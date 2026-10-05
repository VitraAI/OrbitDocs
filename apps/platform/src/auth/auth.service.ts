import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { type AccessManifest, type AuthHandler, createAuth } from '@vitra-ai/orbitdocs-auth';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';

import { type Actor, AuditService } from '../audit.service';
import { CONFIG, DB, type PlatformConfig } from '../config';
import { hashPassword, newToken, sha256, verifyPassword } from '../crypto';
import type { Db } from '../db';
import { invitations, memberships, projects, users } from '../db/schema';

export const SESSION_COOKIE = 'od_platform';
const MAX_AGE_HOURS = 24 * 7;

export type User = typeof users.$inferSelect;
export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

/** Minimal request shape (Express). */
export interface Req {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: User | null;
}

export function readCookie(req: Req, name: string): string | undefined {
  const raw = req.headers.cookie;
  const header = Array.isArray(raw) ? raw.join(';') : raw;
  for (const part of (header ?? '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly log = new Logger('Auth');
  private readonly key: Uint8Array;
  /** SSO (OpenID Connect presets), shared with private docs. */
  readonly sso: AuthHandler | null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: PlatformConfig,
    private readonly audit: AuditService,
  ) {
    this.key = new TextEncoder().encode(`orbitdocs:session:${config.secret}`);
    const manifest: AccessManifest = {
      version: 2,
      basePath: '/api/sso',
      site: { title: 'OrbitDocs' },
      mode: 'public',
      groups: {},
      rules: [],
      providers: config.sso,
      session: { secretEnv: 'PLATFORM_SECRET', maxAgeHours: 1 },
      loginPage: { title: 'Sign in to OrbitDocs' },
    };
    this.sso = config.sso.length ? createAuth({ manifest, env: { ...process.env, PLATFORM_SECRET: config.secret }, publicUrl: config.publicUrl }) : null;
  }

  /** The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD. */
  async onApplicationBootstrap() {
    const admin = this.config.admin;
    if (!admin) return;
    const [existing] = await this.db.select().from(users).where(eq(users.email, admin.email));
    if (existing) {
      if (!existing.isAdmin) await this.db.update(users).set({ isAdmin: true }).where(eq(users.id, existing.id));
      return;
    }
    await this.db.insert(users).values({ email: admin.email, name: 'Admin', passwordHash: await hashPassword(admin.password), isAdmin: true });
    this.log.log(`Created the first admin: ${admin.email}`);
  }

  /**
   * Signs a session. `iat_ms` is the issue time in milliseconds, compared with the password change
   * time (also milliseconds), so a change ends every session issued before it, even in the same
   * second. A session is never dated before the user's own last change, so the one issued right
   * after a change survives it even if the clock steps back.
   */
  async session(user: User): Promise<string> {
    const issuedMs = Math.max(Date.now(), user.passwordChangedAt?.getTime() ?? 0);
    return new SignJWT({ iat_ms: issuedMs }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(`${MAX_AGE_HOURS}h`).setAudience('orbitdocs:platform').sign(this.key);
  }

  cookie(token: string, secure: boolean): string {
    return [`${SESSION_COOKIE}=${token}`, 'Path=/', `Max-Age=${token ? MAX_AGE_HOURS * 3600 : 0}`, 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; ');
  }

  /** The signed-in user, or null. Cached on the request. */
  async user(req: Req): Promise<User | null> {
    if (req.user !== undefined) return req.user;
    req.user = null;
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { audience: 'orbitdocs:platform', algorithms: ['HS256'] });
      const [u] = await this.db.select().from(users).where(eq(users.id, String(payload.sub)));
      // A password change or reset ends the sessions issued before it. Sessions signed before
      // `iat_ms` existed only have `iat` (seconds): a change in their second ends them too.
      const issuedMs = typeof payload.iat_ms === 'number' ? payload.iat_ms : (payload.iat ?? 0) * 1000;
      const revoked = u?.passwordChangedAt && issuedMs < u.passwordChangedAt.getTime();
      req.user = u?.active && !revoked ? u : null;
    } catch {
      req.user = null;
    }
    return req.user;
  }

  async requireUser(req: Req): Promise<User> {
    const u = await this.user(req);
    if (!u) throw new UnauthorizedException('Sign in first');
    return u;
  }

  actor(user: Pick<User, 'id' | 'email'>, req?: Req): Actor {
    const fwd = req?.headers['x-forwarded-for'];
    return { id: user.id, email: user.email, ip: (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ?? req?.ip };
  }

  async login(email: string, password: string, req: Req): Promise<User> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!u || !u.active || !(await verifyPassword(password, u.passwordHash))) {
      await this.audit.record({ email: email.trim().toLowerCase() || '(blank)', ip: req.ip }, 'auth.login_failed');
      throw new UnauthorizedException('Wrong email or password');
    }
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await this.audit.record(this.actor(u, req), 'auth.login', { data: { method: 'password' } });
    return u;
  }

  /**
   * Changes the signed-in user's own password. Other sessions end; the caller issues a new
   * session for this one. SSO-only accounts (no password) cannot set one here.
   */
  async changePassword(user: User, current: string, next: string, req: Req): Promise<User> {
    if (!user.passwordHash) throw new BadRequestException('Your account signs in with SSO and has no password to change. Your identity provider manages your credentials.');
    if (!current || !next) throw new BadRequestException('Enter your current password and a new password');
    if (!(await verifyPassword(current, user.passwordHash))) {
      await this.audit.record(this.actor(user, req), 'auth.password_change_failed', { target: user.email, data: { reason: 'wrong current password' } });
      throw new BadRequestException('The current password is wrong');
    }
    if (next.length < 10) throw new BadRequestException('Choose a new password of at least 10 characters');
    if (next.length > 256) throw new BadRequestException('The new password is longer than 256 characters');
    if (next === current) throw new BadRequestException('The new password must differ from the current one');
    const [u] = await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await this.audit.record(this.actor(user, req), 'user.password_changed', { target: user.email });
    return u!;
  }

  /**
   * A platform admin changes a user: activates or deactivates, grants or removes admin, or resets
   * the password. A reset ends every session of that user; when admins reset their own password,
   * the caller issues a new session for the current one (like `changePassword`).
   */
  async updateUser(admin: User, id: string, body: { active?: boolean; isAdmin?: boolean; password?: string }, req: Req): Promise<User> {
    if (id === admin.id && (body.active === false || body.isAdmin === false)) throw new BadRequestException('You cannot deactivate or demote yourself');
    const set: Partial<typeof users.$inferInsert> = {};
    if (body.active !== undefined) set.active = body.active;
    if (body.isAdmin !== undefined) set.isAdmin = body.isAdmin;
    if (body.password) {
      if (body.password.length < 10) throw new BadRequestException('Choose a password of at least 10 characters');
      if (body.password.length > 256) throw new BadRequestException('The new password is longer than 256 characters');
      set.passwordHash = await hashPassword(body.password);
      set.passwordChangedAt = new Date();
    }
    const [u] = Object.keys(set).length ? await this.db.update(users).set(set).where(eq(users.id, id)).returning() : await this.db.select().from(users).where(eq(users.id, id));
    if (!u) throw new NotFoundException('No such user');
    await this.audit.record(this.actor(admin, req), 'user.updated', { target: id, data: { active: body.active, isAdmin: body.isAdmin, password: body.password ? 'reset' : undefined } });
    return u;
  }

  /** After SSO: the account with this email (or a pending invitation for it). */
  async ssoUser(email: string, name: string | undefined, req: Req): Promise<User> {
    const lower = email.toLowerCase();
    let [u] = await this.db.select().from(users).where(eq(users.email, lower));
    if (!u) {
      const [invite] = await this.db
        .select()
        .from(invitations)
        .where(and(eq(invitations.email, lower), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
      if (!invite) throw new ForbiddenException(`${lower} has no OrbitDocs account. Ask an admin to invite you.`);
      u = await this.acceptInvite(invite, { name }, req);
    }
    if (!u.active) throw new ForbiddenException('This account is deactivated.');
    await this.db.update(users).set({ lastLoginAt: new Date(), name: u.name ?? name }).where(eq(users.id, u.id));
    await this.audit.record(this.actor(u, req), 'auth.login', { data: { method: 'sso' } });
    return u;
  }

  /** Creates an invitation and returns its one-time link. */
  async invite(by: User, input: { email: string; projectId?: string; role?: Role }, req: Req): Promise<{ url: string; expiresAt: Date }> {
    const token = newToken('odi');
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    await this.db.insert(invitations).values({ email: input.email.toLowerCase(), projectId: input.projectId, role: input.role ?? 'viewer', tokenHash: sha256(token), invitedBy: by.id, expiresAt });
    await this.audit.record(this.actor(by, req), 'user.invited', { projectId: input.projectId, target: input.email.toLowerCase(), data: { role: input.role ?? 'viewer' } });
    return { url: `${this.config.publicUrl}/invite?token=${token}`, expiresAt };
  }

  async invitation(token: string) {
    const [invite] = await this.db
      .select({ email: invitations.email, role: invitations.role, project: projects.name, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, id: invitations.id, projectId: invitations.projectId })
      .from(invitations)
      .leftJoin(projects, eq(projects.id, invitations.projectId))
      .where(eq(invitations.tokenHash, sha256(token)));
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new ForbiddenException('This invitation is invalid or has expired.');
    return invite;
  }

  async acceptInvite(invite: { id: string; email: string; projectId: string | null; role: Role }, input: { name?: string; password?: string }, req: Req): Promise<User> {
    let [u] = await this.db.select().from(users).where(eq(users.email, invite.email));
    if (!u) {
      [u] = await this.db
        .insert(users)
        .values({ email: invite.email, name: input.name, passwordHash: input.password ? await hashPassword(input.password) : null })
        .returning();
    } else if (input.password && !u.passwordHash) {
      await this.db.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, u.id));
    }
    if (invite.projectId) {
      await this.db.insert(memberships).values({ projectId: invite.projectId, userId: u!.id, role: invite.role }).onConflictDoUpdate({ target: [memberships.projectId, memberships.userId], set: { role: invite.role } });
    }
    await this.db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));
    await this.audit.record(this.actor(u!, req), 'user.joined', { projectId: invite.projectId ?? undefined, data: { role: invite.role } });
    return u!;
  }

  /** The user's role in a project (platform admins are owners everywhere). */
  async role(user: User, projectId: string): Promise<Role | null> {
    if (user.isAdmin) return 'owner';
    const [m] = await this.db.select().from(memberships).where(and(eq(memberships.projectId, projectId), eq(memberships.userId, user.id)));
    return m?.role ?? null;
  }

  async requireRole(user: User, projectId: string, min: Role): Promise<Role> {
    const r = await this.role(user, projectId);
    if (!r) throw new ForbiddenException('You are not a member of this project');
    if (RANK[r] < RANK[min]) throw new ForbiddenException(`Needs the ${min} role`);
    return r;
  }
}
