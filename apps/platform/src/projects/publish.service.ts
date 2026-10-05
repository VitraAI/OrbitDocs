import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { AiManifest } from '@vitra-ai/orbitdocs-ai';
import type { AccessManifest } from '@vitra-ai/orbitdocs-auth';
import { stableStringify } from '@vitra-ai/orbitdocs-openapi';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import * as tar from 'tar';

import { type Actor, AuditService } from '../audit.service';
import { CONFIG, DB, type PlatformConfig } from '../config';
import type { Db } from '../db';
import { deployments, projects, type SpecLint, specVersions } from '../db/schema';
import { siteEnvNames } from '../hosting/site-env';

/** `publish.json` in the upload. */
export interface PublishManifest {
  /** Site path prefix the build was made for (`output.basePath`). */
  basePath: string;
  kind: 'production' | 'preview';
  /** Previews: `mr-42`. */
  label?: string;
  meta?: { branch?: string; commit?: string; message?: string; title?: string; url?: string };
}

export type LintResult = { errors: number; warnings: number; problems: Array<{ severity: string; code: string; message: string; path: string }> };
const SEVERITY = ['error', 'warn', 'info', 'hint'];

/** Spectral's recommended OpenAPI rules. */
export async function lintSpec(json: string): Promise<LintResult> {
  const cjs = <T>(m: T): T => ({ ...(m as { default?: T }).default, ...m }) as T;
  const { Spectral, Document } = cjs(await import('@stoplight/spectral-core'));
  const Parsers = cjs(await import('@stoplight/spectral-parsers'));
  const { oas } = cjs(await import('@stoplight/spectral-rulesets'));
  const spectral = new Spectral();
  spectral.setRuleset({ extends: [[oas as never, 'recommended']] });
  const results = await spectral.run(new Document(json, Parsers.Json));
  const problems = results.map((r) => ({ severity: SEVERITY[r.severity] ?? 'hint', code: String(r.code), message: r.message, path: r.path.join('.') }));
  return { errors: problems.filter((p) => p.severity === 'error').length, warnings: problems.filter((p) => p.severity === 'warn').length, problems: problems.slice(0, 200) };
}

const countOperations = (spec: { paths?: Record<string, Record<string, unknown>> }) =>
  Object.values(spec.paths ?? {}).reduce((n, item) => n + Object.keys(item).filter((k) => ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'].includes(k)).length, 0);

/** Files and bytes under a folder. */
function measure(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    const s = statSync(f);
    if (s.isDirectory()) {
      const m = measure(f);
      files += m.files;
      bytes += m.bytes;
    } else {
      files++;
      bytes += s.size;
    }
  }
  return { files, bytes };
}

@Injectable()
export class PublishService {
  private readonly log = new Logger('Publish');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: PlatformConfig,
    private readonly audit: AuditService,
  ) {}

  /** The private-docs and Ask AI manifests of a deployment (never served to readers). */
  manifests(deploymentId: string): { access: AccessManifest | null; ai: AiManifest | null } {
    const read = <T>(name: string): T | null => {
      const file = join(this.dir(deploymentId), name);
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T | null) : null;
    };
    return { access: read<AccessManifest>('orbitdocs-access.json'), ai: read<AiManifest>('orbitdocs-ai.json') };
  }

  /** The site variables a deployment reads (secret names, never values). */
  siteEnvNames(deploymentId: string) {
    const { access, ai } = this.manifests(deploymentId);
    return siteEnvNames(access, ai);
  }

  dir(deploymentId: string) {
    return join(this.config.dataDir, 'deployments', deploymentId);
  }

  /** Unpacks an upload (`site/`, `specs/*.json`, `publish.json`) and publishes it. */
  async fromArchive(project: typeof projects.$inferSelect, archive: string, actor: Actor & { userId?: string }) {
    const staging = join(this.config.dataDir, 'staging', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(staging, { recursive: true });
    try {
      await new Promise<void>((resolve, reject) =>
        createReadStream(archive)
          .pipe(
            tar.x({
              cwd: staging,
              // macOS tar adds xattr headers and ._* AppleDouble files: skip them rather than fail.
              strict: false,
              filter: (p, entry) => {
                const parts = p.split('/');
                const type = (entry as { type?: string }).type;
                // Plain files and folders only: no links that could point outside the staging folder.
                return !parts.includes('..') && !parts.some((s) => s.startsWith('._') || s === '.DS_Store') && (type === 'File' || type === 'OldFile' || type === 'Directory');
              },
            }),
          )
          .on('finish', resolve)
          .on('error', (err: Error) => reject(new BadRequestException(`The upload is not a valid .tar.gz archive (${err.message}).`))),
      );
      const manifestFile = join(staging, 'publish.json');
      if (!existsSync(manifestFile) || !existsSync(join(staging, 'site'))) throw new BadRequestException('The upload needs publish.json and site/ (use `orbitdocs publish`).');
      let manifest: PublishManifest;
      try {
        manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as PublishManifest;
      } catch {
        throw new BadRequestException('publish.json is not valid JSON.');
      }
      return await this.fromDirectory(project, { site: join(staging, 'site'), specs: join(staging, 'specs') }, manifest, actor);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }

  /**
   * Publishes a folder with `site/` and `specs/`: production updates the live
   * site and the registry; a preview replaces the previous preview with the same label.
   */
  async fromDirectory(project: typeof projects.$inferSelect, from: { site: string; specs: string }, manifest: PublishManifest, actor: Actor & { userId?: string }) {
    if (manifest.kind !== 'production' && manifest.kind !== 'preview') throw new BadRequestException('kind is production or preview');
    const label = manifest.kind === 'preview' ? (manifest.label ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) : null;
    if (manifest.kind === 'preview' && !label) throw new BadRequestException('A preview needs a label (e.g. mr-42)');

    // Specs: lint first, so a blocked publish leaves nothing behind.
    const specsDir = from.specs;
    const specs = existsSync(specsDir)
      ? readdirSync(specsDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => {
            const raw = readFileSync(join(specsDir, f), 'utf8');
            const spec = JSON.parse(raw) as { info?: { title?: string; version?: string }; paths?: Record<string, Record<string, unknown>> };
            return { apiId: f.replace(/\.json$/, ''), spec, canonical: stableStringify(spec) };
          })
      : [];
    const linted = await Promise.all(specs.map(async (s) => ({ ...s, lint: await lintSpec(s.canonical) })));
    if (manifest.kind === 'production' && project.blockOnLint) {
      const failing = linted.filter((s) => s.lint.errors > 0);
      if (failing.length) {
        throw new BadRequestException(
          `Lint errors block this publish: ${failing.map((s) => `${s.apiId} (${s.lint.errors})`).join(', ')}. ${failing[0]!.lint.problems.filter((p) => p.severity === 'error').slice(0, 3).map((p) => `${p.path}: ${p.message}`).join('; ')}`,
        );
      }
    }

    if (!existsSync(join(from.site, 'index.html')) && !readdirSync(from.site).some((f) => statSync(join(from.site, f)).isDirectory())) {
      throw new BadRequestException('The site folder has no index.html: is it a static build (output.mode: static)?');
    }
    const { files, bytes } = measure(from.site);
    // The registry revision each spec matches: a production publish adds one when the spec changed.
    const latest = new Map<string, typeof specVersions.$inferSelect>();
    for (const s of linted) {
      const [row] = await this.db
        .select()
        .from(specVersions)
        .where(and(eq(specVersions.projectId, project.id), eq(specVersions.apiId, s.apiId)))
        .orderBy(desc(specVersions.revision))
        .limit(1);
      if (row) latest.set(s.apiId, row);
    }
    const hashOf = (canonical: string) => createHash('sha256').update(canonical).digest('hex');
    // Lint is computed for previews too: they are never blocked, so reviewers see the counts.
    const lint: SpecLint[] = linted.map((s) => {
      const row = latest.get(s.apiId);
      const same = row?.hash === hashOf(s.canonical);
      return {
        apiId: s.apiId,
        title: s.spec.info?.title ?? s.apiId,
        version: s.spec.info?.version ?? '0.0.0',
        revision: same ? row!.revision : manifest.kind === 'production' ? (row?.revision ?? 0) + 1 : null,
        errors: s.lint.errors,
        warnings: s.lint.warnings,
        problems: s.lint.problems.slice(0, 50),
      };
    });
    const [deployment] = await this.db
      .insert(deployments)
      .values({ projectId: project.id, kind: manifest.kind, label, meta: manifest.meta ?? {}, basePath: manifest.basePath ?? '', files, bytes, lint, createdBy: actor.userId })
      .returning();
    const target = this.dir(deployment!.id);
    mkdirSync(join(this.config.dataDir, 'deployments'), { recursive: true });
    await import('node:fs/promises').then((fs) => fs.cp(from.site, target, { recursive: true }));

    /** Registry versions: production publishes only. */
    const versions: Array<{ apiId: string; revision: number; version: string; created: boolean; lint: LintResult }> = [];
    if (manifest.kind === 'production') {
      for (const s of linted) {
        const hash = hashOf(s.canonical);
        const row = latest.get(s.apiId);
        if (row?.hash === hash) {
          versions.push({ apiId: s.apiId, revision: row.revision, version: row.version, created: false, lint: s.lint });
          continue;
        }
        const revision = (row?.revision ?? 0) + 1;
        await this.db.insert(specVersions).values({
          projectId: project.id,
          apiId: s.apiId,
          revision,
          version: s.spec.info?.version ?? '0.0.0',
          title: s.spec.info?.title ?? s.apiId,
          spec: s.spec,
          hash,
          operations: countOperations(s.spec),
          lint: s.lint,
          deploymentId: deployment!.id,
          createdBy: actor.userId,
        });
        versions.push({ apiId: s.apiId, revision, version: s.spec.info?.version ?? '0.0.0', created: true, lint: s.lint });
      }
      await this.db.update(projects).set({ productionDeploymentId: deployment!.id }).where(eq(projects.id, project.id));
      await this.pruneProduction(project.id, deployment!.id);
    } else {
      // A newer preview with the same label replaces the old one.
      const old = await this.db
        .select()
        .from(deployments)
        .where(and(eq(deployments.projectId, project.id), eq(deployments.kind, 'preview'), eq(deployments.label, label!), ne(deployments.id, deployment!.id), isNull(deployments.removedAt)));
      for (const d of old) await this.remove(d.id);
    }

    const url = this.siteUrl(project.slug, label, manifest.basePath);
    await this.audit.record(actor, manifest.kind === 'production' ? 'site.published' : 'preview.published', {
      projectId: project.id,
      target: label ?? deployment!.id,
      data: {
        deploymentId: deployment!.id,
        files,
        bytes,
        versions: versions.filter((v) => v.created).map((v) => `${v.apiId}@r${v.revision}`),
        lint: lint.map((l) => `${l.apiId}: ${l.errors} errors, ${l.warnings} warnings`),
        ...manifest.meta,
      },
    });
    this.log.log(`${project.slug}: ${manifest.kind}${label ? ` ${label}` : ''} → ${url}`);
    // Names the site reads that the project hasn't set: sign-in or Ask AI fails until they are.
    const missingEnv = this.siteEnvNames(deployment!.id).filter((n) => !project.siteEnv.some((v) => v.key === n.key));
    return { deployment: deployment!, url, versions, lint, missingEnv };
  }

  /** `https://travel.docs.acme.com/docs/`, `http://travel--mr-42.localhost:8080/`. */
  siteUrl(slug: string, label: string | null, basePath = '') {
    const origin = new URL(this.config.publicUrl);
    return `${origin.protocol}//${label ? `${slug}--${label}` : slug}.${this.config.domain}${basePath}/`;
  }

  /** Deletes a deployment's files (previews when closed, old production builds). */
  async remove(deploymentId: string) {
    rmSync(this.dir(deploymentId), { recursive: true, force: true });
    await this.db.update(deployments).set({ removedAt: new Date() }).where(eq(deployments.id, deploymentId));
  }

  /** Keeps the five newest production builds for rollback. */
  private async pruneProduction(projectId: string, keep: string) {
    const all = await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(eq(deployments.projectId, projectId), eq(deployments.kind, 'production'), isNull(deployments.removedAt)))
      .orderBy(desc(deployments.createdAt));
    for (const d of all.slice(5)) if (d.id !== keep) await this.remove(d.id);
  }
}
