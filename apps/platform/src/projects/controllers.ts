import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { asc, isNull } from 'drizzle-orm';
import type { Request, Response } from 'express';

import { AuditService } from '../audit.service';
import { AuthService, type Role } from '../auth/auth.service';
import { CONFIG, DB, type PlatformConfig } from '../config';
import type { Db } from '../db';
import { invitations, users } from '../db/schema';
import { ProjectsService } from './projects.service';
import { PublishService } from './publish.service';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];
const secure = (req: Request) => (req.headers['x-forwarded-proto'] ?? req.protocol) === 'https';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: PlatformConfig,
  ) {}

  /** Who is signed in, and how one can sign in (for the login page). */
  @Get('me')
  async me(@Req() req: Request) {
    const u = await this.auth.user(req);
    return {
      user: u ? { id: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin, hasPassword: Boolean(u.passwordHash) } : null,
      sso: this.config.sso.map((p) => ({ id: p.id, name: p.name, brand: p.brand })),
      domain: this.config.domain,
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!body.email || !body.password) throw new BadRequestException('Email and password are required');
    const u = await this.auth.login(body.email, body.password, req);
    res.setHeader('Set-Cookie', this.auth.cookie(await this.auth.session(u), secure(req)));
    return { ok: true };
  }

  /** Changes your own password; other sessions are signed out, this one gets a new cookie. */
  @Post('password')
  @HttpCode(200)
  async password(@Body() body: { currentPassword?: string; newPassword?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.requireUser(req);
    const u = await this.auth.changePassword(user, String(body.currentPassword ?? ''), String(body.newPassword ?? ''), req);
    res.setHeader('Set-Cookie', this.auth.cookie(await this.auth.session(u), secure(req)));
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Set-Cookie', this.auth.cookie('', secure(req)));
    return { ok: true };
  }
}

@Controller('api/invitations')
export class InvitationsController {
  constructor(private readonly auth: AuthService) {}

  @Get(':token')
  async show(@Param('token') token: string) {
    const i = await this.auth.invitation(token);
    return { email: i.email, role: i.role, project: i.project, expiresAt: i.expiresAt };
  }

  @Post(':token/accept')
  @HttpCode(200)
  async accept(@Param('token') token: string, @Body() body: { name?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!body.password || body.password.length < 10) throw new BadRequestException('Choose a password of at least 10 characters');
    const invite = await this.auth.invitation(token);
    const u = await this.auth.acceptInvite(invite, body, req);
    res.setHeader('Set-Cookie', this.auth.cookie(await this.auth.session(u), secure(req)));
    return { ok: true };
  }
}

@Controller('api/projects')
export class ProjectsController {
  constructor(
    private readonly auth: AuthService,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  private async ctx(req: Request, slug: string, min: Role) {
    const user = await this.auth.requireUser(req);
    const project = await this.projects.bySlug(slug);
    const role = await this.auth.requireRole(user, project.id, min);
    return { user, project, role, actor: this.auth.actor(user, req) };
  }

  @Get()
  async list(@Req() req: Request) {
    return this.projects.list(await this.auth.requireUser(req));
  }

  @Post()
  async create(@Req() req: Request, @Body() body: { slug: string; name: string; description?: string }) {
    const user = await this.auth.requireUser(req);
    return this.projects.create(user, body, this.auth.actor(user, req));
  }

  @Get(':slug')
  async get(@Req() req: Request, @Param('slug') slug: string) {
    const { project, role } = await this.ctx(req, slug, 'viewer');
    return { ...(await this.projects.summary(project)), role };
  }

  @Patch(':slug')
  async update(@Req() req: Request, @Param('slug') slug: string, @Body() body: Parameters<ProjectsService['update']>[1]) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    await this.projects.update(project, body, actor);
    return { ok: true };
  }

  @Delete(':slug')
  async remove(@Req() req: Request, @Param('slug') slug: string) {
    const { project, actor } = await this.ctx(req, slug, 'owner');
    await this.projects.remove(project, actor);
    return { ok: true };
  }

  @Get(':slug/members')
  async members(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'viewer');
    return this.projects.members(project);
  }

  @Post(':slug/members')
  async invite(@Req() req: Request, @Param('slug') slug: string, @Body() body: { email: string; role: Role }) {
    const { project, user, actor } = await this.ctx(req, slug, 'admin');
    if (!ROLES.includes(body.role) || !/^\S+@\S+\.\S+$/.test(body.email ?? '')) throw new BadRequestException('Give an email and a role');
    // Existing users join at once; others get an invitation link.
    if (await this.projects.addMember(project, body.email, body.role, actor)) return { added: true };
    return this.auth.invite(user, { email: body.email, projectId: project.id, role: body.role }, req);
  }

  @Patch(':slug/members/:userId')
  async setRole(@Req() req: Request, @Param('slug') slug: string, @Param('userId') userId: string, @Body() body: { role: Role }) {
    const { project, actor, role } = await this.ctx(req, slug, 'admin');
    if (!ROLES.includes(body.role)) throw new BadRequestException('Unknown role');
    if (body.role === 'owner' && role !== 'owner') throw new ForbiddenException('Only owners make owners');
    await this.projects.setRole(project, userId, body.role, actor);
    return { ok: true };
  }

  @Delete(':slug/members/:userId')
  async removeMember(@Req() req: Request, @Param('slug') slug: string, @Param('userId') userId: string) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    await this.projects.removeMember(project, userId, actor);
    return { ok: true };
  }

  @Get(':slug/tokens')
  async tokens(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'admin');
    return this.projects.tokens(project);
  }

  @Post(':slug/tokens')
  async createToken(@Req() req: Request, @Param('slug') slug: string, @Body() body: { name?: string }) {
    const { project, user, actor } = await this.ctx(req, slug, 'admin');
    return this.projects.createToken(project, body.name ?? 'CI', user, actor);
  }

  @Delete(':slug/tokens/:id')
  async revokeToken(@Req() req: Request, @Param('slug') slug: string, @Param('id') id: string) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    await this.projects.revokeToken(project, id, actor);
    return { ok: true };
  }

  @Get(':slug/deployments')
  async deployments(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'viewer');
    return this.projects.deployments(project);
  }

  @Post(':slug/deployments/:id/promote')
  async promote(@Req() req: Request, @Param('slug') slug: string, @Param('id') id: string) {
    const { project, actor } = await this.ctx(req, slug, 'editor');
    await this.projects.promote(project, id, actor);
    return { ok: true };
  }

  @Delete(':slug/deployments/:id')
  async removePreview(@Req() req: Request, @Param('slug') slug: string, @Param('id') id: string) {
    const { project, actor } = await this.ctx(req, slug, 'editor');
    await this.projects.removePreview(project, id, actor);
    return { ok: true };
  }

  @Get(':slug/registry')
  async registry(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'viewer');
    return this.projects.registry(project);
  }

  @Get(':slug/registry/:api/:revision')
  async version(@Req() req: Request, @Param('slug') slug: string, @Param('api') api: string, @Param('revision') revision: string, @Query('download') download?: string, @Res({ passthrough: true }) res?: Response) {
    const { project } = await this.ctx(req, slug, 'viewer');
    const v = await this.projects.version(project, api, Number(revision));
    if (download !== undefined) {
      res!.setHeader('Content-Disposition', `attachment; filename="${api}-r${v.revision}-v${v.version}.json"`);
      return v.spec;
    }
    return v;
  }

  @Get(':slug/domains')
  async domains(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'viewer');
    return this.projects.domains(project);
  }

  @Post(':slug/domains')
  async addDomain(@Req() req: Request, @Param('slug') slug: string, @Body() body: { hostname: string }) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    return this.projects.addDomain(project, body.hostname ?? '', actor);
  }

  @Post(':slug/domains/:id/verify')
  @HttpCode(200)
  async verifyDomain(@Req() req: Request, @Param('slug') slug: string, @Param('id') id: string) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    await this.projects.verifyDomain(project, id, actor);
    return { ok: true };
  }

  @Delete(':slug/domains/:id')
  async removeDomain(@Req() req: Request, @Param('slug') slug: string, @Param('id') id: string) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    await this.projects.removeDomain(project, id, actor);
    return { ok: true };
  }

  @Get(':slug/git')
  async git(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'admin');
    return this.projects.gitSecrets(project);
  }

  @Patch(':slug/git')
  async setGit(@Req() req: Request, @Param('slug') slug: string, @Body() body: Parameters<ProjectsService['setGit']>[1]) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    return this.projects.setGit(project, body, actor);
  }

  @Get(':slug/site-env')
  async siteEnv(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'admin');
    return this.projects.siteEnvStatus(project);
  }

  @Patch(':slug/site-env')
  async setSiteEnv(@Req() req: Request, @Param('slug') slug: string, @Body() body: { env: Record<string, string | null> }) {
    const { project, actor } = await this.ctx(req, slug, 'admin');
    return this.projects.setSiteEnv(project, body?.env, actor);
  }

  @Get(':slug/builds')
  async builds(@Req() req: Request, @Param('slug') slug: string) {
    const { project } = await this.ctx(req, slug, 'viewer');
    return this.projects.builds(project);
  }

  @Get(':slug/builds/:id/log')
  async buildLog(@Req() req: Request, @Param('slug') slug: string, @Param('id') id: string) {
    const { project } = await this.ctx(req, slug, 'viewer');
    return this.projects.buildLog(project, id);
  }

  @Get(':slug/audit')
  async projectAudit(@Req() req: Request, @Param('slug') slug: string, @Query('before') before?: string) {
    const { project } = await this.ctx(req, slug, 'admin');
    return this.audit.list({ projectId: project.id, before: before ? Number(before) : undefined });
  }

}

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(DB) private readonly db: Db,
  ) {}

  private async admin(req: Request) {
    const u = await this.auth.requireUser(req);
    if (!u.isAdmin) throw new ForbiddenException('Platform admins only');
    return u;
  }

  @Get('users')
  async users(@Req() req: Request) {
    await this.admin(req);
    const list = await this.db
      .select({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin, active: users.active, externalId: users.externalId, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
      .from(users)
      .orderBy(asc(users.email));
    const pending = await this.db
      .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(isNull(invitations.acceptedAt));
    return { users: list, invitations: pending.filter((i) => i.expiresAt > new Date()) };
  }

  @Post('invitations')
  async invite(@Req() req: Request, @Body() body: { email: string }) {
    const u = await this.admin(req);
    if (!/^\S+@\S+\.\S+$/.test(body.email ?? '')) throw new BadRequestException('Enter an email');
    return this.auth.invite(u, { email: body.email }, req);
  }

  /** Changes a user. Admins resetting their own password stay signed in here; other sessions end. */
  @Patch('users/:id')
  async updateUser(@Req() req: Request, @Param('id') id: string, @Body() body: { active?: boolean; isAdmin?: boolean; password?: string }, @Res({ passthrough: true }) res: Response) {
    const admin = await this.admin(req);
    const u = await this.auth.updateUser(admin, id, body, req);
    if (u.id === admin.id && body.password) res.setHeader('Set-Cookie', this.auth.cookie(await this.auth.session(u), secure(req)));
    return { ok: true };
  }

  @Get('audit')
  async auditLog(@Req() req: Request, @Query('before') before?: string, @Query('project') project?: string) {
    await this.admin(req);
    return this.audit.list({ before: before ? Number(before) : undefined, projectId: project || undefined });
  }
}

/** `orbitdocs publish`: a `.tar.gz` upload, authorised by a project token. */
@Controller('api/publish')
export class PublishController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly publish: PublishService,
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: PlatformConfig,
  ) {}

  @Post()
  async upload(@Req() req: Request) {
    const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))?.[1];
    let project = bearer ? await this.projects.byToken(bearer) : null;
    let actor = { email: `token:${bearer?.slice(0, 10) ?? '?'}`, ip: req.ip } as { email: string; ip?: string; id?: string; userId?: string };
    if (!project) {
      // Signed-in editors can publish from the dashboard too.
      const user = await this.auth.user(req);
      const slug = String(req.query.project ?? '');
      if (!user || !slug) throw new UnauthorizedException('Send a project token: Authorization: Bearer odp_…');
      project = await this.projects.bySlug(slug);
      await this.auth.requireRole(user, project.id, 'editor');
      actor = { ...this.auth.actor(user, req), userId: user.id };
    }
    const dir = join(this.config.dataDir, 'uploads');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
    try {
      await pipeline(req, createWriteStream(file));
      const result = await this.publish.fromArchive(project, file, actor);
      return {
        url: result.url,
        deploymentId: result.deployment.id,
        kind: result.deployment.kind,
        // Registry versions: production only.
        versions: result.versions.map(({ lint, ...v }) => ({ ...v, errors: lint.errors, warnings: lint.warnings })),
        // Lint counts per spec: production and previews.
        lint: result.lint.map(({ problems: _, ...l }) => l),
        // Site variables the build reads but the project lacks (names only).
        missingEnv: result.missingEnv,
      };
    } finally {
      rmSync(file, { force: true });
    }
  }
}

