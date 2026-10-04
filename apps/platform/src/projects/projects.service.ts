import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';

import { type Actor, AuditService } from '../audit.service';
import type { Role, User } from '../auth/auth.service';
import { CONFIG, DB, type PlatformConfig } from '../config';
import { encrypt, newToken, sha256 } from '../crypto';
import type { Db } from '../db';
import { apiTokens, builds, deployments, domains, type GitSettings, memberships, projects, specVersions, users } from '../db/schema';
import { RESERVED_BUILD_ENV, repoWebUrl } from '../git/repo';
import { applyEnvChanges } from '../hosting/site-env';
import { PublishService } from './publish.service';

export type Project = typeof projects.$inferSelect;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: PlatformConfig,
    private readonly audit: AuditService,
    private readonly publish: PublishService,
  ) {}

  async bySlug(slug: string): Promise<Project> {
    const [p] = await this.db.select().from(projects).where(eq(projects.slug, slug));
    if (!p) throw new NotFoundException(`No project "${slug}"`);
    return p;
  }

  /** Projects the user can see, with their role and live URL. */
  async list(user: User) {
    const rows = user.isAdmin
      ? (await this.db.select().from(projects).orderBy(asc(projects.name))).map((p) => ({ ...p, role: 'owner' as Role }))
      : await this.db
          .select({ project: projects, role: memberships.role })
          .from(memberships)
          .innerJoin(projects, eq(projects.id, memberships.projectId))
          .where(eq(memberships.userId, user.id))
          .orderBy(asc(projects.name))
          .then((r) => r.map((x) => ({ ...x.project, role: x.role })));
    return Promise.all(rows.map((p) => this.summary(p)));
  }

  async summary(p: Project & { role?: Role }) {
    const live = p.productionDeploymentId ? (await this.db.select().from(deployments).where(eq(deployments.id, p.productionDeploymentId)))[0] : undefined;
    const [{ previews }] = await this.db
      .select({ previews: count() })
      .from(deployments)
      .where(and(eq(deployments.projectId, p.id), eq(deployments.kind, 'preview'), isNull(deployments.removedAt)));
    const apis = await this.db
      .selectDistinctOn([specVersions.apiId], { apiId: specVersions.apiId, title: specVersions.title, version: specVersions.version, revision: specVersions.revision })
      .from(specVersions)
      .where(eq(specVersions.projectId, p.id))
      .orderBy(specVersions.apiId, desc(specVersions.revision));
    const { git, siteEnv, ...rest } = p;
    return {
      ...rest,
      siteEnvKeys: siteEnv.map((v) => v.key),
      // Secrets stay on the server: build variables are listed by name only.
      git: git ? { ...git, tokenEncrypted: undefined, hasToken: Boolean(git.tokenEncrypted), webhookSecret: undefined, buildEnv: undefined, envKeys: (git.buildEnv ?? []).map((v) => v.key), webUrl: repoWebUrl(git) } : null,
      url: live ? this.publish.siteUrl(p.slug, null, live.basePath) : null,
      publishedAt: live?.createdAt ?? null,
      latest: live ? live.meta : null,
      previews,
      apis,
    };
  }

  async create(user: User, input: { slug: string; name: string; description?: string }, actor: Actor) {
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG.test(slug)) throw new BadRequestException('The slug is 1–40 lowercase letters, digits and dashes (no "--").');
    if (slug.includes('--')) throw new BadRequestException('The slug cannot contain "--" (reserved for previews).');
    if (!input.name?.trim()) throw new BadRequestException('Name the project');
    const [exists] = await this.db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
    if (exists) throw new ConflictException(`"${slug}" is taken`);
    const [p] = await this.db.insert(projects).values({ slug, name: input.name.trim(), description: input.description }).returning();
    await this.db.insert(memberships).values({ projectId: p!.id, userId: user.id, role: 'owner' });
    await this.audit.record(actor, 'project.created', { projectId: p!.id, target: slug });
    return p!;
  }

  async update(p: Project, input: Partial<Pick<Project, 'name' | 'description' | 'blockOnLint' | 'analytics'>>, actor: Actor) {
    const set: Partial<Project> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.description !== undefined) set.description = input.description;
    if (input.blockOnLint !== undefined) set.blockOnLint = input.blockOnLint;
    if (input.analytics !== undefined) {
      if (!['builtin', 'plausible', 'umami', 'posthog'].includes(input.analytics.provider)) throw new BadRequestException('Unknown analytics provider');
      set.analytics = input.analytics;
    }
    await this.db.update(projects).set(set).where(eq(projects.id, p.id));
    await this.audit.record(actor, 'project.updated', { projectId: p.id, data: { ...set } });
  }

  async remove(p: Project, actor: Actor) {
    const ds = await this.db.select({ id: deployments.id }).from(deployments).where(eq(deployments.projectId, p.id));
    for (const d of ds) await this.publish.remove(d.id);
    await this.db.delete(projects).where(eq(projects.id, p.id));
    await this.audit.record(actor, 'project.deleted', { target: p.slug });
  }

  // Members ---------------------------------------------------------------

  members(p: Project) {
    return this.db
      .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, active: users.active, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.projectId, p.id))
      .orderBy(asc(users.email));
  }

  /** Adds an existing user (true), or returns false when the email has no account yet. */
  async addMember(p: Project, email: string, role: Role, actor: Actor): Promise<boolean> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (!u) return false;
    await this.db.insert(memberships).values({ projectId: p.id, userId: u.id, role }).onConflictDoUpdate({ target: [memberships.projectId, memberships.userId], set: { role } });
    await this.audit.record(actor, 'member.added', { projectId: p.id, target: u.email, data: { role } });
    return true;
  }

  async setRole(p: Project, userId: string, role: Role, actor: Actor) {
    const owners = (await this.members(p)).filter((m) => m.role === 'owner');
    if (role !== 'owner' && owners.length === 1 && owners[0]!.userId === userId) throw new BadRequestException('A project needs at least one owner');
    await this.db.update(memberships).set({ role }).where(and(eq(memberships.projectId, p.id), eq(memberships.userId, userId)));
    await this.audit.record(actor, 'member.role_changed', { projectId: p.id, target: userId, data: { role } });
  }

  async removeMember(p: Project, userId: string, actor: Actor) {
    const owners = (await this.members(p)).filter((m) => m.role === 'owner');
    if (owners.length === 1 && owners[0]!.userId === userId) throw new BadRequestException('A project needs at least one owner');
    await this.db.delete(memberships).where(and(eq(memberships.projectId, p.id), eq(memberships.userId, userId)));
    await this.audit.record(actor, 'member.removed', { projectId: p.id, target: userId });
  }

  // Publish tokens ----------------------------------------------------------

  tokens(p: Project) {
    return this.db
      .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt, revokedAt: apiTokens.revokedAt })
      .from(apiTokens)
      .where(eq(apiTokens.projectId, p.id))
      .orderBy(desc(apiTokens.createdAt));
  }

  /** Returns the token once; only its hash is stored. */
  async createToken(p: Project, name: string, user: User, actor: Actor) {
    const token = newToken('odp');
    await this.db.insert(apiTokens).values({ projectId: p.id, name: name || 'CI', prefix: token.slice(0, 10), tokenHash: sha256(token), createdBy: user.id });
    await this.audit.record(actor, 'token.created', { projectId: p.id, target: name || 'CI' });
    return { token };
  }

  async revokeToken(p: Project, id: string, actor: Actor) {
    await this.db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.projectId, p.id), eq(apiTokens.id, id)));
    await this.audit.record(actor, 'token.revoked', { projectId: p.id, target: id });
  }

  /** The project a publish token belongs to. */
  async byToken(token: string): Promise<Project | null> {
    const [row] = await this.db
      .select({ project: projects, id: apiTokens.id })
      .from(apiTokens)
      .innerJoin(projects, eq(projects.id, apiTokens.projectId))
      .where(and(eq(apiTokens.tokenHash, sha256(token)), isNull(apiTokens.revokedAt)));
    if (!row) return null;
    await this.db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
    return row.project;
  }

  // Deployments and registry ------------------------------------------------

  async deployments(p: Project) {
    const rows = await this.db.select().from(deployments).where(eq(deployments.projectId, p.id)).orderBy(desc(deployments.createdAt)).limit(100);
    return rows.map((d) => ({
      ...d,
      live: d.id === p.productionDeploymentId,
      url: d.removedAt ? null : d.kind === 'preview' ? this.publish.siteUrl(p.slug, d.label, d.basePath) : d.id === p.productionDeploymentId ? this.publish.siteUrl(p.slug, null, d.basePath) : null,
    }));
  }

  /** Rollback: make an earlier production build live again. */
  async promote(p: Project, deploymentId: string, actor: Actor) {
    const [d] = await this.db.select().from(deployments).where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, p.id)));
    if (!d || d.kind !== 'production' || d.removedAt) throw new BadRequestException('Only kept production builds can go live');
    await this.db.update(projects).set({ productionDeploymentId: d.id }).where(eq(projects.id, p.id));
    await this.audit.record(actor, 'site.rolled_back', { projectId: p.id, target: d.id });
  }

  async removePreview(p: Project, deploymentId: string, actor: Actor) {
    const [d] = await this.db.select().from(deployments).where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, p.id)));
    if (!d || d.kind !== 'preview') throw new BadRequestException('Not a preview');
    await this.publish.remove(d.id);
    await this.audit.record(actor, 'preview.removed', { projectId: p.id, target: d.label ?? d.id });
  }

  registry(p: Project) {
    return this.db
      .select({
        id: specVersions.id,
        apiId: specVersions.apiId,
        revision: specVersions.revision,
        version: specVersions.version,
        title: specVersions.title,
        operations: specVersions.operations,
        errors: sql<number>`(${specVersions.lint}->>'errors')::int`,
        warnings: sql<number>`(${specVersions.lint}->>'warnings')::int`,
        createdAt: specVersions.createdAt,
        createdBy: users.email,
      })
      .from(specVersions)
      .leftJoin(users, eq(users.id, specVersions.createdBy))
      .where(eq(specVersions.projectId, p.id))
      .orderBy(asc(specVersions.apiId), desc(specVersions.revision));
  }

  async version(p: Project, apiId: string, revision: number) {
    const [v] = await this.db
      .select()
      .from(specVersions)
      .where(and(eq(specVersions.projectId, p.id), eq(specVersions.apiId, apiId), eq(specVersions.revision, revision)));
    if (!v) throw new NotFoundException('No such version');
    return v;
  }

  // Custom domains ----------------------------------------------------------

  domains(p: Project) {
    return this.db.select().from(domains).where(eq(domains.projectId, p.id)).orderBy(asc(domains.hostname));
  }

  async addDomain(p: Project, hostname: string, actor: Actor) {
    const host = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) || !host.includes('.')) throw new BadRequestException('Enter a hostname like docs.acme.com');
    if (host === this.config.domain || host.endsWith(`.${this.config.domain}`)) throw new BadRequestException('Project subdomains are automatic');
    const [d] = await this.db.insert(domains).values({ projectId: p.id, hostname: host, verifyToken: randomBytes(12).toString('hex') }).onConflictDoNothing().returning();
    if (!d) throw new ConflictException(`${host} is already used`);
    await this.audit.record(actor, 'domain.added', { projectId: p.id, target: host });
    return d;
  }

  /**
   * Verified when DNS points at the platform: a CNAME to the platform domain,
   * or a TXT record `_orbitdocs.<host>` with the token. `*.localhost` verifies at once (development).
   */
  async verifyDomain(p: Project, id: string, actor: Actor) {
    const [d] = await this.db.select().from(domains).where(and(eq(domains.id, id), eq(domains.projectId, p.id)));
    if (!d) throw new NotFoundException('No such domain');
    const bare = d.hostname.replace(/:\d+$/, '');
    let ok = bare.endsWith('.localhost');
    if (!ok) {
      const platformHost = this.config.domain.replace(/:\d+$/, '');
      const cname = await dns.resolveCname(bare).catch(() => [] as string[]);
      const txt = await dns.resolveTxt(`_orbitdocs.${bare}`).catch(() => [] as string[][]);
      ok = cname.some((c) => c.replace(/\.$/, '') === platformHost) || txt.flat().includes(d.verifyToken);
    }
    if (!ok) throw new BadRequestException(`DNS is not set yet: add a CNAME ${bare} → ${this.config.domain.replace(/:\d+$/, '')}, or a TXT record _orbitdocs.${bare} = ${d.verifyToken}`);
    await this.db.update(domains).set({ verified: true }).where(eq(domains.id, d.id));
    await this.audit.record(actor, 'domain.verified', { projectId: p.id, target: d.hostname });
  }

  async removeDomain(p: Project, id: string, actor: Actor) {
    const [d] = await this.db.delete(domains).where(and(eq(domains.id, id), eq(domains.projectId, p.id))).returning();
    if (d) await this.audit.record(actor, 'domain.removed', { projectId: p.id, target: d.hostname });
  }

  // Git sync settings -------------------------------------------------------

  /**
   * `env` changes build variables: a string sets one (stored encrypted), null removes it, and
   * variables left out stay as they are. Values are never sent back.
   */
  async setGit(p: Project, input: Partial<Omit<GitSettings, 'buildEnv'>> & { token?: string; enabled?: boolean; env?: Record<string, string | null> }, actor: Actor) {
    if (input.enabled === false) {
      await this.db.update(projects).set({ git: null }).where(eq(projects.id, p.id));
      await this.audit.record(actor, 'git.disconnected', { projectId: p.id });
      return null;
    }
    const provider = input.provider ?? p.git?.provider;
    if (provider !== 'github' && provider !== 'gitlab') throw new BadRequestException('provider is github or gitlab');
    if (!(input.repo ?? p.git?.repo)) throw new BadRequestException('repo is required (owner/repo or group/project)');
    const apiUrl = (input.apiUrl || (provider === p.git?.provider ? p.git?.apiUrl : undefined) || (provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com/api/v4')).replace(/\/$/, '');
    if (!/^https?:\/\/[^/\s]+/.test(apiUrl)) throw new BadRequestException('The API URL is an http(s) URL, such as https://github.acme.com/api/v3');
    const { vars: buildEnv, changed: envChanges } = applyEnvChanges(p.git?.buildEnv ?? [], input.env ?? {}, {
      seal: (v) => encrypt(v, this.config.secret),
      reserved: RESERVED_BUILD_ENV,
      max: 100,
      what: 'build variables',
    });
    const git: GitSettings = {
      provider,
      repo: input.repo ?? p.git!.repo,
      branch: input.branch ?? p.git?.branch ?? 'main',
      apiUrl,
      cloneUrl: input.cloneUrl === '' ? undefined : (input.cloneUrl ?? p.git?.cloneUrl),
      tokenEncrypted: input.token ? encrypt(input.token, this.config.secret) : p.git?.tokenEncrypted,
      webhookSecret: p.git?.webhookSecret ?? randomBytes(24).toString('hex'),
      docsDir: input.docsDir ?? p.git?.docsDir ?? 'docs',
      // Empty: install automatically from the lockfiles (see autoInstall).
      installCommand: (input.installCommand ?? p.git?.installCommand ?? '').trim(),
      buildCommand: input.buildCommand ?? p.git?.buildCommand ?? 'npx orbitdocs build',
      outputDir: input.outputDir ?? p.git?.outputDir ?? 'out',
      buildEnv,
    };
    await this.db.update(projects).set({ git }).where(eq(projects.id, p.id));
    await this.audit.record(actor, 'git.configured', { projectId: p.id, data: { provider, repo: git.repo, branch: git.branch, ...(envChanges.length ? { env: envChanges } : {}) } });
    return { webhookUrl: `${this.config.publicUrl}/api/git/${p.id}/webhook`, webhookSecret: git.webhookSecret };
  }

  // Site environment variables ----------------------------------------------

  /**
   * `env` changes the hosted site's variables, like build variables: a string sets one
   * (stored encrypted), null removes it. The next request to the site uses them.
   */
  async setSiteEnv(p: Project, env: Record<string, string | null>, actor: Actor) {
    if (!env || typeof env !== 'object') throw new BadRequestException('env is an object of NAME: value (or null to remove)');
    const { vars, changed } = applyEnvChanges(p.siteEnv, env, { seal: (v) => encrypt(v, this.config.secret), max: 50, what: 'site variables' });
    await this.db.update(projects).set({ siteEnv: vars }).where(eq(projects.id, p.id));
    if (changed.length) await this.audit.record(actor, 'site_env.changed', { projectId: p.id, data: { env: changed } });
    return this.siteEnvStatus({ ...p, siteEnv: vars });
  }

  /** Variable names (never values) and which ones the live site reads but the project lacks. */
  async siteEnvStatus(p: Project) {
    const live = p.productionDeploymentId ? (await this.db.select().from(deployments).where(eq(deployments.id, p.productionDeploymentId)))[0] : undefined;
    const keys = p.siteEnv.map((v) => v.key);
    const used = live && !live.removedAt ? this.publish.siteEnvNames(live.id) : [];
    return { keys, used: used.map((u) => ({ ...u, set: keys.includes(u.key) })) };
  }

  async gitSecrets(p: Project) {
    if (!p.git) return null;
    return { webhookUrl: `${this.config.publicUrl}/api/git/${p.id}/webhook`, webhookSecret: p.git.webhookSecret };
  }

  builds(p: Project) {
    return this.db
      .select({ id: builds.id, kind: builds.kind, label: builds.label, request: builds.request, branch: builds.branch, commit: builds.commit, message: builds.message, status: builds.status, trigger: builds.trigger, deploymentId: builds.deploymentId, createdAt: builds.createdAt, startedAt: builds.startedAt, finishedAt: builds.finishedAt, lint: deployments.lint })
      .from(builds)
      .leftJoin(deployments, eq(deployments.id, builds.deploymentId))
      .where(eq(builds.projectId, p.id))
      .orderBy(desc(builds.createdAt))
      .limit(50)
      .then((rows) => rows.map((b) => ({ ...b, lint: b.lint?.map(({ problems: _, ...l }) => l) ?? null })));
  }

  async buildLog(p: Project, id: string) {
    const [b] = await this.db.select({ log: builds.log, status: builds.status }).from(builds).where(and(eq(builds.id, id), eq(builds.projectId, p.id)));
    if (!b) throw new NotFoundException('No such build');
    return b;
  }
}
