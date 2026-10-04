import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnApplicationShutdown, UnauthorizedException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';

import { CONFIG, DB, type PlatformConfig } from '../config';
import { decrypt } from '../crypto';
import type { Db } from '../db';
import { builds, deployments, type GitSettings, projects, type SpecLint } from '../db/schema';
import { PublishService } from '../projects/publish.service';
import { autoInstall, buildEnv, cloneUrl, gitAuthEnv } from './repo';

type Project = typeof projects.$inferSelect;

/** The build queue and the queue its jobs move to when every retry is used up. */
export const BUILD_QUEUE = 'orbitdocs-builds';
export const BUILD_DEAD_QUEUE = 'orbitdocs-builds-dead';

interface BuildJob {
  buildId: string;
}

/** What a webhook asks for. */
export type GitEvent =
  | { type: 'push'; branch: string; commit: string; message?: string }
  | { type: 'request'; action: 'open' | 'update' | 'close' | 'merge'; number: number; branch: string; commit: string; title?: string; url?: string; message?: string }
  | { type: 'ignore'; reason: string };

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Checks the webhook's signature and reads the event. */
export function parseWebhook(git: GitSettings, headers: Record<string, string | string[] | undefined>, raw: Buffer): GitEvent {
  const h = (name: string) => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const body = JSON.parse(raw.toString('utf8') || '{}') as Record<string, any>;
  if (git.provider === 'gitlab') {
    if (!safeEqual(h('x-gitlab-token') ?? '', git.webhookSecret)) throw new UnauthorizedException('Bad X-Gitlab-Token');
    const event = h('x-gitlab-event');
    if (event === 'Push Hook') {
      if (!body.after || /^0+$/.test(body.after)) return { type: 'ignore', reason: 'branch deleted' };
      return { type: 'push', branch: String(body.ref ?? '').replace(/^refs\/heads\//, ''), commit: body.checkout_sha ?? body.after, message: body.commits?.at(-1)?.message };
    }
    if (event === 'Merge Request Hook') {
      const mr = body.object_attributes ?? {};
      const actions: Record<string, 'open' | 'update' | 'close' | 'merge'> = { open: 'open', reopen: 'open', update: 'update', close: 'close', merge: 'merge' };
      const action = actions[mr.action];
      if (!action) return { type: 'ignore', reason: `merge request ${mr.action ?? 'event'}` };
      // An update without new commits (title, labels) needs no build.
      if (action === 'update' && !mr.oldrev) return { type: 'ignore', reason: 'merge request changed without new commits' };
      return { type: 'request', action, number: Number(mr.iid), branch: mr.source_branch, commit: mr.last_commit?.id, title: mr.title, url: mr.url, message: mr.last_commit?.message };
    }
    return { type: 'ignore', reason: `GitLab event ${event}` };
  }
  const signature = h('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', git.webhookSecret).update(raw).digest('hex')}`;
  if (!safeEqual(signature, expected)) throw new UnauthorizedException('Bad X-Hub-Signature-256');
  const event = h('x-github-event');
  if (event === 'ping') return { type: 'ignore', reason: 'ping' };
  if (event === 'push') {
    if (body.deleted) return { type: 'ignore', reason: 'branch deleted' };
    return { type: 'push', branch: String(body.ref ?? '').replace(/^refs\/heads\//, ''), commit: body.after, message: body.head_commit?.message };
  }
  if (event === 'pull_request') {
    const pr = body.pull_request ?? {};
    const action = body.action === 'opened' || body.action === 'reopened' ? 'open' : body.action === 'synchronize' ? 'update' : body.action === 'closed' ? (pr.merged ? 'merge' : 'close') : null;
    if (!action) return { type: 'ignore', reason: `pull request ${body.action}` };
    return { type: 'request', action, number: Number(body.number), branch: pr.head?.ref, commit: pr.head?.sha, title: pr.title, url: pr.html_url };
  }
  return { type: 'ignore', reason: `GitHub event ${event}` };
}

/** The PR/MR comment for a ready preview: its link and every spec's lint counts. */
export function previewComment(commit: string, url: string, lint: SpecLint[], blockOnLint: boolean): string {
  const parts = [`📘 **Docs preview** for ${commit.slice(0, 8)}: ${url}`];
  if (lint.length) {
    const rows = lint.map((l) => {
      const result = l.errors || l.warnings ? `${l.errors ? '✗' : '⚠'} ${l.errors} ${l.errors === 1 ? 'error' : 'errors'}, ${l.warnings} ${l.warnings === 1 ? 'warning' : 'warnings'}` : '✓ No problems';
      return `| \`${l.apiId}\` v${l.version} | ${result} | ${l.revision ? `r${l.revision} (unchanged)` : 'changed'} |`;
    });
    parts.push(['| API | Spectral lint | Registry |', '| --- | --- | --- |', ...rows].join('\n'));
    if (blockOnLint && lint.some((l) => l.errors)) parts.push('The lint gate is on: production refuses specs with lint errors, so fix them before merging.');
  }
  return parts.join('\n\n');
}

/** Masks secret values (tokens, build variables) in build output. */
export function redactor(secrets: string[]): (s: string) => string {
  const values = secrets.filter((v) => v.length >= 6).sort((a, b) => b.length - a.length);
  return (s) => values.reduce((out, v) => out.split(v).join('***'), redact(s));
}

/** Commit statuses and PR/MR comments, through the provider's API. */
export class GitProviderClient {
  constructor(
    private readonly git: GitSettings,
    private readonly token: string | undefined,
  ) {}

  private async call(method: string, path: string, body: unknown) {
    if (!this.token) return;
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'OrbitDocs' };
    if (this.git.provider === 'gitlab') headers['private-token'] = this.token;
    else headers.authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.git.apiUrl}${path}`, { method, headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${this.git.provider} ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  status(commit: string, state: 'pending' | 'running' | 'success' | 'failed', url: string | undefined, description: string) {
    if (this.git.provider === 'gitlab') {
      return this.call('POST', `/projects/${encodeURIComponent(this.git.repo)}/statuses/${commit}`, { state, name: 'OrbitDocs', target_url: url, description });
    }
    const gh = { pending: 'pending', running: 'pending', success: 'success', failed: 'failure' }[state];
    return this.call('POST', `/repos/${this.git.repo}/statuses/${commit}`, { state: gh, context: 'OrbitDocs', target_url: url, description });
  }

  comment(number: number, body: string) {
    if (this.git.provider === 'gitlab') return this.call('POST', `/projects/${encodeURIComponent(this.git.repo)}/merge_requests/${number}/notes`, { body });
    return this.call('POST', `/repos/${this.git.repo}/issues/${number}/comments`, { body });
  }
}

/**
 * Git sync: webhooks queue builds, workers build and publish them.
 *
 * The queue is pg-boss, in the platform's own Postgres, so queued builds survive a restart and any
 * number of platform instances can share the work. Each target (production, or one PR/MR preview) is
 * a `singletonKey` under the `singleton` policy: one build per target runs at a time across all
 * instances, while different targets build in parallel. The `builds` table stays the record the
 * dashboard reads; a job only carries the build's id.
 */
@Injectable()
export class GitService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('GitSync');
  /** Builds this instance runs at once. */
  private readonly concurrency = Number(process.env.BUILD_CONCURRENCY ?? 1);
  private readonly timeoutMs = Number(process.env.BUILD_TIMEOUT_MS ?? 15 * 60_000);
  private readonly boss: PgBoss;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: PlatformConfig,
    private readonly publish: PublishService,
  ) {
    this.boss = new PgBoss({ connectionString: config.databaseUrl, schema: 'pgboss', max: 4 });
    this.boss.on('error', (err) => this.log.error(err.message));
  }

  async onApplicationBootstrap() {
    await this.boss.start();
    await this.boss.createQueue(BUILD_DEAD_QUEUE, { policy: 'standard' }).catch(() => undefined);
    await this.boss
      .createQueue(BUILD_QUEUE, {
        policy: 'singleton',
        // A crashed or killed worker misses heartbeats; its build goes back on the queue.
        heartbeatSeconds: 60,
        expireInSeconds: Math.ceil(this.timeoutMs / 1000) + 300,
        retryLimit: 2,
        retryDelay: 15,
        deadLetter: BUILD_DEAD_QUEUE,
      })
      .catch(() => undefined);
    await this.boss.work<BuildJob>(BUILD_QUEUE, { localConcurrency: this.concurrency }, async ([job]) => {
      if (job) await this.run(job.data.buildId, job.retryCount ?? 0);
    });
    // Out of retries (the worker died every time): the build failed.
    await this.boss.work<BuildJob>(BUILD_DEAD_QUEUE, async ([job]) => {
      if (!job) return;
      await this.db
        .update(builds)
        .set({ status: 'failed', finishedAt: new Date(), log: '✗ The build worker stopped before the build finished, on every attempt.\n' })
        .where(and(eq(builds.id, job.data.buildId), inArray(builds.status, ['queued', 'running'])));
    });
  }

  async onApplicationShutdown() {
    // Running builds are left to the heartbeat: another instance (or this one, restarted) picks them up.
    await this.boss.stop({ graceful: false, close: true }).catch(() => undefined);
  }

  private client(git: GitSettings) {
    return new GitProviderClient(git, git.tokenEncrypted ? decrypt(git.tokenEncrypted, this.config.secret) : undefined);
  }

  /** Handles a webhook: queues a build, or removes a preview. */
  async webhook(projectId: string, headers: Record<string, string | string[] | undefined>, raw: Buffer) {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId)).catch(() => []);
    if (!project?.git) throw new NotFoundException('No Git sync for this project');
    const event = parseWebhook(project.git, headers, raw);
    if (event.type === 'ignore') return { ok: true, ignored: event.reason };

    if (event.type === 'push') {
      if (event.branch !== project.git.branch) return { ok: true, ignored: `push to ${event.branch}` };
      const build = await this.enqueue(project, { kind: 'production', branch: event.branch, commit: event.commit, message: event.message, trigger: 'push' });
      return { ok: true, build: build.id };
    }

    const label = `${project.git.provider === 'gitlab' ? 'mr' : 'pr'}-${event.number}`;
    if (event.action === 'close' || event.action === 'merge') {
      // Merging publishes through the push to the production branch; the preview goes either way.
      await this.cancelQueued(project.id, label);
      const previews = await this.db
        .select()
        .from(deployments)
        .where(and(eq(deployments.projectId, project.id), eq(deployments.kind, 'preview'), eq(deployments.label, label), isNull(deployments.removedAt)));
      for (const d of previews) await this.publish.remove(d.id);
      return { ok: true, removed: previews.length };
    }
    const build = await this.enqueue(project, { kind: 'preview', label, request: event.number, branch: event.branch, commit: event.commit, message: event.title, trigger: `${label} ${event.action}` });
    return { ok: true, build: build.id };
  }

  async enqueue(project: Project, b: { kind: 'production' | 'preview'; label?: string; request?: number; branch: string; commit: string; message?: string; trigger: string }) {
    if (!/^[0-9a-f]{7,64}$/i.test(b.commit ?? '')) throw new BadRequestException('The webhook has no commit');
    // A newer commit replaces a build still waiting for the same target.
    await this.cancelQueued(project.id, b.label ?? null);
    const [build] = await this.db.insert(builds).values({ projectId: project.id, ...b }).returning();
    await this.boss.send(BUILD_QUEUE, { buildId: build!.id } satisfies BuildJob, { singletonKey: `${project.id}:${b.label ?? 'production'}` });
    void this.client(project.git!).status(b.commit, 'pending', undefined, 'Queued').catch((e) => this.log.warn((e as Error).message));
    return build!;
  }

  /** Marks waiting builds for a target cancelled; their jobs find that and end without building. */
  private async cancelQueued(projectId: string, label: string | null) {
    const queued = await this.db
      .select({ id: builds.id })
      .from(builds)
      .where(and(eq(builds.projectId, projectId), eq(builds.status, 'queued'), label ? eq(builds.label, label) : isNull(builds.label)));
    if (!queued.length) return;
    await this.db
      .update(builds)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(and(inArray(builds.id, queued.map((q) => q.id)), eq(builds.status, 'queued')));
  }

  /** Clone at the commit, install, build, publish; report back to the provider. */
  private async run(id: string, attempt: number) {
    const [build] = await this.db.select().from(builds).where(eq(builds.id, id));
    // 'running' here means an earlier attempt's worker died: pg-boss only hands a job to one worker.
    if (!build || (build.status !== 'queued' && !(build.status === 'running' && attempt > 0))) return;
    const [project] = await this.db.select().from(projects).where(eq(projects.id, build.projectId));
    if (!project?.git) return;
    const git = project.git;
    const provider = this.client(git);
    const work = join(this.config.dataDir, 'builds', build.id);
    let log = attempt > 0 ? `↻ Attempt ${attempt + 1}: the previous worker stopped mid-build.\n` : '';
    let flushed = Date.now();
    const append = async (text: string) => {
      log += text;
      if (log.length > 400_000) log = `…\n${log.slice(-300_000)}`;
      if (Date.now() - flushed > 1000) {
        flushed = Date.now();
        await this.db.update(builds).set({ log }).where(eq(builds.id, build.id));
      }
    };
    await this.db.update(builds).set({ status: 'running', startedAt: new Date() }).where(eq(builds.id, build.id));
    void provider.status(build.commit, 'running', undefined, 'Building the docs').catch(() => undefined);
    try {
      rmSync(work, { recursive: true, force: true });
      mkdirSync(work, { recursive: true });
      const token = git.tokenEncrypted ? decrypt(git.tokenEncrypted, this.config.secret) : undefined;
      const projectEnv = Object.fromEntries((git.buildEnv ?? []).map((v) => [v.key, decrypt(v.valueEncrypted, this.config.secret)]));
      const env = buildEnv(process.env, projectEnv);
      const mask = redactor([...(token ? [token] : []), ...Object.values(projectEnv)]);
      // Git gets the token for the clone and fetch only, through its environment (never .git/config).
      const url = cloneUrl(git);
      const gitEnv = { ...buildEnv(process.env), ...gitAuthEnv(git, token, url) };
      await append(`$ git clone ${redact(url)}\n`);
      await this.exec('git', ['clone', '--quiet', '--no-checkout', url, 'repo'], work, append, gitEnv, mask);
      const repo = join(work, 'repo');
      await this.exec('git', ['fetch', '--quiet', 'origin', build.commit], repo, append, gitEnv, mask).catch(() => undefined);
      await append(`$ git checkout ${build.commit}\n`);
      await this.exec('git', ['checkout', '--quiet', build.commit], repo, append, buildEnv(process.env), mask);

      const docs = resolve(repo, git.docsDir);
      if (!docs.startsWith(repo + sep) && docs !== repo) throw new Error('docsDir must be inside the repository');
      // An empty install command installs from the lockfiles: the docs app and the Nest app it extracts from.
      const install: Array<[string, string]> = git.installCommand ? [[docs, git.installCommand]] : autoInstall(repo, docs).map(([dir, command]) => [resolve(repo, dir), command]);
      if (!git.installCommand) await append(install.length ? `Install: automatic, from ${install.map(([dir]) => (dir === repo ? '.' : dir.slice(repo.length + 1))).join(', ')}\n` : 'Install: automatic, nothing to install (no package.json)\n');
      if (Object.keys(projectEnv).length) await append(`Build environment: ${Object.keys(projectEnv).join(', ')}\n`);
      for (const [cwd, command] of [...install, ...(git.buildCommand ? [[docs, git.buildCommand] as [string, string]] : [])]) {
        await append(`$ ${cwd === docs ? '' : `(cd ${cwd === repo ? '.' : cwd.slice(repo.length + 1)}) `}${command}\n`);
        await this.exec('sh', ['-c', command], cwd, append, env, mask);
      }
      const site = resolve(docs, git.outputDir);
      const meta = existsSync(join(docs, '.orbitdocs', 'build.json')) ? (JSON.parse(readFileSync(join(docs, '.orbitdocs', 'build.json'), 'utf8')) as { basePath?: string }) : {};
      const result = await this.publish.fromDirectory(
        project,
        { site, specs: join(docs, 'openapi') },
        { basePath: meta.basePath ?? '', kind: build.kind, label: build.label ?? undefined, meta: { branch: build.branch, commit: build.commit, message: build.message ?? undefined } },
        { email: `git:${git.provider}` },
      );
      for (const l of result.lint) await append(`${l.errors ? '✗' : l.warnings ? '!' : '✓'} ${l.apiId} v${l.version}: ${l.errors} lint errors, ${l.warnings} warnings${l.revision ? ` · registry r${l.revision}` : ''}\n`);
      for (const m of result.missingEnv) await append(`! ${m.key} is not set (${m.usedBy}): add it under Settings → Environment\n`);
      await append(`\n✓ Published ${result.url}\n`);
      await this.db.update(builds).set({ status: 'succeeded', finishedAt: new Date(), log, deploymentId: result.deployment.id }).where(eq(builds.id, build.id));
      const errors = result.lint.reduce((n, l) => n + l.errors, 0);
      const description = `${build.kind === 'preview' ? 'Preview ready' : 'Published'}${errors ? ` · ${errors} lint ${errors === 1 ? 'error' : 'errors'}` : ''}`;
      await provider.status(build.commit, 'success', result.url, description).catch((e) => this.log.warn((e as Error).message));
      if (build.kind === 'preview' && build.request) {
        await provider.comment(build.request, previewComment(build.commit, result.url, result.lint, project.blockOnLint)).catch((e) => this.log.warn((e as Error).message));
      }
    } catch (err) {
      await append(`\n✗ ${(err as Error).message}\n`);
      await this.db.update(builds).set({ status: 'failed', finishedAt: new Date(), log }).where(eq(builds.id, build.id));
      await provider.status(build.commit, 'failed', `${this.config.publicUrl}/project?slug=${project.slug}&tab=builds`, 'Docs build failed').catch(() => undefined);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  /** Runs a command with exactly `env`: never the platform's own environment. */
  private exec(cmd: string, args: string[], cwd: string, append: (s: string) => Promise<void>, env: Record<string, string>, mask: (s: string) => string = redact): Promise<void> {
    return new Promise((ok, fail) => {
      const child = spawn(cmd, args, { cwd, env });
      const out = (d: Buffer) => void append(mask(d.toString()));
      child.stdout.on('data', out);
      child.stderr.on('data', out);
      const timer = setTimeout(() => child.kill('SIGKILL'), this.timeoutMs);
      child.on('error', fail);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) ok();
        else fail(new Error(`${cmd} ${mask(args.join(' ')).slice(0, 80)} exited with ${code}`));
      });
    });
  }
}

const redact = (s: string) => s.replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//***@');
