import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoadedConfig } from '@orbitdocs/core/loader';

import { fail, log } from '../util';
import { build, outDir } from './build';

export interface PublishOptions {
  platform?: string;
  token?: string;
  /** Publish a preview with this label (`mr-42`) instead of production. */
  preview?: string;
  skipBuild?: boolean;
  message?: string;
}

function git(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/** What the platform's `POST /api/publish` answers. */
export interface PublishResponse {
  url?: string;
  /** Registry versions (production only). */
  versions?: Array<{ apiId: string; revision: number; version: string; created: boolean; errors?: number; warnings?: number }>;
  /** Spectral counts per spec, for production and previews. */
  lint?: Array<{ apiId: string; title?: string; version?: string; revision?: number | null; errors: number; warnings: number; problems?: Array<{ severity: string; message: string; path: string }> }>;
  /** Site variables the build reads but the project hasn't set (names only). */
  missingEnv?: Array<{ key: string; usedBy: string }>;
}

/** The lines `orbitdocs publish` prints for the platform's answer. */
export function publishReport(body: PublishResponse, preview?: string): Array<{ level: 'ok' | 'warn' | 'dim'; text: string }> {
  const lines: Array<{ level: 'ok' | 'warn' | 'dim'; text: string }> = [];
  const lint = body.lint;
  for (const v of body.versions ?? []) {
    const registry = `${v.apiId}: ${v.created ? `registry revision ${v.revision}` : `unchanged (revision ${v.revision})`} · v${v.version}`;
    // Older platforms only report lint here.
    lines.push({ level: 'ok', text: lint || v.errors === undefined ? registry : `${registry} · ${v.errors} lint errors, ${v.warnings ?? 0} warnings` });
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  for (const l of lint ?? []) {
    lines.push({ level: l.errors ? 'warn' : 'ok', text: `${l.apiId}: ${plural(l.errors, 'lint error')}, ${plural(l.warnings, 'warning')}` });
    for (const p of (l.problems ?? []).slice(0, 3)) lines.push({ level: 'dim', text: `    ${p.severity} ${p.path}: ${p.message}` });
  }
  for (const m of body.missingEnv ?? []) lines.push({ level: 'warn', text: `${m.key} is not set (${m.usedBy}): add it in the dashboard under Settings → Environment` });
  lines.push({ level: 'ok', text: `${preview ? `Preview ${preview}` : 'Published'}: ${body.url}` });
  return lines;
}

/**
 * `orbitdocs publish`: builds the site and uploads it with its specs to an
 * OrbitDocs platform. Production updates the live site and the registry; a
 * preview gets its own URL.
 */
export async function publish(loaded: LoadedConfig, options: PublishOptions = {}): Promise<void> {
  const { config, dir } = loaded;
  const platform = (options.platform ?? process.env.ORBITDOCS_PLATFORM_URL)?.replace(/\/$/, '');
  const token = options.token ?? process.env.ORBITDOCS_TOKEN;
  if (!platform) fail('Set --platform or ORBITDOCS_PLATFORM_URL (e.g. https://docs.acme.com).');
  if (!token) fail('Set --token or ORBITDOCS_TOKEN (a project token from the dashboard).');
  if (config.output.mode !== 'static') fail('The platform hosts static builds: set output.mode to "static".');
  if (!options.skipBuild) await build(loaded);
  const out = outDir(dir);
  if (!existsSync(out)) fail(`No build at ${out}. Run \`orbitdocs build\`.`);

  const staging = mkdtempSync(join(tmpdir(), 'orbitdocs-publish-'));
  try {
    cpSync(out, join(staging, 'site'), { recursive: true });
    mkdirSync(join(staging, 'specs'));
    const specs = join(dir, 'openapi');
    if (existsSync(specs)) for (const f of readdirSync(specs).filter((n) => n.endsWith('.json'))) cpSync(join(specs, f), join(staging, 'specs', f));
    const meta = {
      branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
      commit: git(dir, ['rev-parse', 'HEAD']),
      message: options.message ?? git(dir, ['log', '-1', '--pretty=%s']),
    };
    writeFileSync(
      join(staging, 'publish.json'),
      JSON.stringify({ basePath: config.output.basePath, kind: options.preview ? 'preview' : 'production', label: options.preview, meta }),
    );
    const tar = await import('tar');
    const archive = join(staging, 'upload.tar.gz');
    await tar.c({ gzip: true, cwd: staging, file: archive, portable: true }, ['site', 'specs', 'publish.json']);
    log.step(`Uploading ${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB to ${platform}`);
    const { readFile } = await import('node:fs/promises');
    const res = await fetch(`${platform}/api/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip' },
      body: await readFile(archive),
    });
    const body = (await res.json().catch(() => ({}))) as PublishResponse & { message?: string | string[] };
    if (!res.ok) fail(`Publish failed (${res.status}): ${Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? 'unknown error')}`);
    for (const line of publishReport(body, options.preview)) log[line.level](line.text);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
