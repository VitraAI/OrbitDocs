import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';

import { fail, log, resolveFrom, run } from '../util';
import { writeAccessManifest, writeAccessVariants } from './access';
import { writeAiManifest } from './ai';
import { check } from './check';
import { extract } from './extract';

/** Output folder of a static build. */
export const outDir = (dir: string) => join(dir, 'out');

/** Static hosts cannot run redirects: write meta-refresh pages + a `_redirects` file (Netlify/Cloudflare). */
function writeRedirects(loaded: LoadedConfig) {
  const { config, dir } = loaded;
  if (!config.redirects.length) return;
  const out = outDir(dir);
  const base = config.output.basePath;
  const lines: string[] = [];
  for (const r of config.redirects) {
    const to = r.to.startsWith('/') ? `${base}${r.to}` : r.to;
    lines.push(`${base}${r.from.replace(/\*$/, '*')} ${to.replace(/\*$/, ':splat')} ${r.permanent ? 301 : 302}`);
    if (r.from.includes('*')) continue;
    const target = join(out, r.from, 'index.html');
    if (existsSync(target)) continue;
    mkdirSync(join(out, r.from), { recursive: true });
    writeFileSync(
      target,
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><title>Redirecting…</title><a href="${to}">${to}</a>`,
    );
  }
  writeFileSync(join(out, '_redirects'), `${lines.join('\n')}\n`);
}

/**
 * `build --skip-extract` keeps the specs, but guides, their `access`
 * frontmatter and the config may have changed since the last extract: rewrite
 * what extract derives from them (`.orbitdocs/ai.json`, `.orbitdocs/access.json`
 * with its variants, and the public spec copies). Returns the access problems
 * extract would fail on.
 */
export async function refreshManifests(loaded: LoadedConfig): Promise<string[]> {
  const problems = writeAccessManifest(loaded);
  if (!problems.length) await writeAccessVariants(loaded);
  await writeAiManifest(loaded);
  return problems;
}

export async function build(loaded: LoadedConfig, options: { skipExtract?: boolean } = {}): Promise<string> {
  const { dir, config } = loaded;
  if (!options.skipExtract) {
    const results = await extract(loaded);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) fail(`Documentation gaps in ${failed.map((f) => f.id).join(', ')} (completeness: 'error'). Fix them or set completeness to 'warn'.`);
  }
  if (options.skipExtract) {
    const problems = await refreshManifests(loaded);
    if (problems.length) fail(problems.join('\n'));
  }
  const problems = await check(loaded);
  if (problems.length) {
    for (const p of problems) log.error(p);
    fail(`${problems.length} broken reference(s).`);
  }
  // For the platform and CI: what this build was made for.
  mkdirSync(join(dir, '.orbitdocs'), { recursive: true });
  writeFileSync(join(dir, '.orbitdocs', 'build.json'), `${JSON.stringify({ basePath: config.output.basePath, mode: config.output.mode })}\n`);
  log.step('next build');
  const code = await run(process.execPath, [resolveFrom(dir, 'next/dist/bin/next'), 'build'], { cwd: dir });
  if (code !== 0) fail('next build failed');
  if (config.output.mode === 'static') {
    writeRedirects(loaded);
    if (config.access) {
      log.warn('Private docs are enforced by the server that serves them: mountOrbitDocs (Nest) or output.mode "server". Plain static hosts serve every file.');
    }
    log.ok(`Static site in ${outDir(dir)}${config.output.basePath ? ` (served under ${config.output.basePath})` : ''}`);
    log.dim('Check it locally with `orbitdocs start`.');
    return outDir(dir);
  }
  log.ok('Server build in .next (start it with `orbitdocs start` or `next start`)');
  return join(dir, '.next');
}
