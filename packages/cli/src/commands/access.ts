import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { type AccessManifest, buildManifest, implies, planVariants, type RestrictedPage, requiredGroups, type VariantSet } from '@orbitdocs/auth';
import { specFile } from '@orbitdocs/core';
import type { LoadedConfig } from '@orbitdocs/core/loader';
import { buildReferenceModel, loadDocument, pruneDocument, stableStringify } from '@orbitdocs/openapi';
import { parse } from 'yaml';

import { log } from '../util';

function mdxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? mdxFiles(f) : /\.mdx?$/.test(n) ? [f] : [];
  });
}

interface GuideFile extends RestrictedPage {
  /** `layout: landing`: full width, no sidebar. */
  landing: boolean;
}

/** Every guide: URL and slugs as Fumadocs builds them (`index` is the folder, `(group)` folders are not in the URL). */
export function guideFiles(contentDir: string): GuideFile[] {
  const out: GuideFile[] = [];
  for (const file of mdxFiles(contentDir)) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
    const fm = (m ? parse(m[1]!) ?? {} : {}) as { access?: unknown; layout?: unknown };
    const groups = Array.isArray(fm.access) ? fm.access.map(String) : typeof fm.access === 'string' ? [fm.access] : [];
    const slugs = relative(contentDir, file)
      .replace(/\.mdx?$/, '')
      .split(/[\\/]/)
      .filter((s) => s !== 'index' && !/^\(.+\)$/.test(s));
    out.push({ url: `/${slugs.join('/')}`.replace(/\/$/, '') || '/', slugs, groups, landing: fm.layout === 'landing' });
  }
  return out;
}

/** Guide pages whose frontmatter has `access: [groups]`. */
export function restrictedPages(contentDir: string): RestrictedPage[] {
  return guideFiles(contentDir)
    .filter((p) => p.groups.length)
    .map(({ url, slugs, groups }) => ({ url, slugs, groups }));
}

/**
 * Writes `.orbitdocs/access.json` (no secrets): what mountOrbitDocs and the
 * Next proxy enforce. `null` when the site has no private docs. Variants of
 * reader-dependent files are added by `writeAccessVariants` once the specs
 * are extracted.
 */
export function writeAccessManifest(loaded: LoadedConfig): string[] {
  const { config, dir } = loaded;
  const pages = restrictedPages(join(dir, 'content'));
  const known = new Set(['*', ...Object.keys(config.access?.groups ?? {})]);
  const problems = pages.flatMap((p) => p.groups.filter((g) => !known.has(g)).map((g) => `content${p.url}: unknown access group "${g}"`));
  if (pages.length && !config.access) problems.push('Pages use `access` frontmatter but the config has no `access` section.');
  mkdirSync(join(dir, '.orbitdocs'), { recursive: true });
  writeFileSync(join(dir, '.orbitdocs', 'access.json'), `${JSON.stringify(buildManifest(config, pages), null, 2)}\n`);
  return problems;
}

/** Whether the docs app has a route (folder under `app/` or `src/app/`). */
function hasRoute(dir: string, route: string): boolean {
  return existsSync(join(dir, 'app', route)) || existsSync(join(dir, 'src', 'app', route));
}

/**
 * Plans the reader-dependent files and writes what the CLI owns:
 *
 * - the guides sidebar: a variant per combination of page restrictions
 *   (rendered by `app/~/[variant]`), so restricted titles never reach readers
 *   who can't open them;
 * - each API with operations only some readers may open: variants of its
 *   reference, spec download and code samples, and `public/openapi/<id>.json`
 *   (the canonical download) without the restricted operations;
 * - the API client (`app/client/[[...variant]]`), across every API.
 *
 * The plans go into `.orbitdocs/access.json` (`variants`); the server serves
 * each reader the most complete variant they may open. Without private docs,
 * the public spec copies are the full specs.
 */
export async function writeAccessVariants(loaded: LoadedConfig): Promise<void> {
  const { config, dir } = loaded;
  const file = join(dir, '.orbitdocs', 'access.json');
  const manifest = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as AccessManifest | null) : null;
  const publicDir = join(dir, 'public', 'openapi');
  // Variant copies from an earlier build.
  if (existsSync(publicDir)) for (const f of readdirSync(publicDir)) if (f.includes('~')) rmSync(join(publicDir, f));

  const apis = [];
  for (const api of config.apis) {
    const spec = specFile(dir, api.id);
    if (!existsSync(spec)) continue;
    const { document } = await loadDocument(readFileSync(spec, 'utf8'));
    apis.push({ id: api.id, spec, document, model: buildReferenceModel(document, api.id) });
  }
  if (!manifest) {
    for (const a of apis) writeSpec(publicDir, a.id, readFileSync(a.spec, 'utf8'));
    return;
  }

  const at = (path: string) => requiredGroups(manifest, `${manifest.basePath}${path}`);
  const variants: VariantSet[] = [];
  const plan = (what: string, ...args: Parameters<typeof planVariants>) => {
    try {
      return planVariants(...args);
    } catch (err) {
      throw new Error(`${what}: ${(err as Error).message}`);
    }
  };

  // The guides sidebar.
  const guides = guideFiles(join(dir, 'content')).filter((g) => !g.landing);
  const guidePlan = plan('Guides', manifest.mode === 'private' ? [['*']] : null, guides.map((g) => ({ id: g.url, requires: at(g.url) })), 'g');
  if (guidePlan.options.length) {
    if (hasRoute(dir, '~/[variant]')) {
      variants.push({ scope: 'guides', options: guidePlan.options.map(({ key, requires }) => ({ key, requires })), routes: [{ from: '', to: '/~/{key}', paths: guides.map((g) => g.url) }] });
    } else {
      log.warn('Restricted guides are left out of the sidebar for every reader: add the app/~/[variant] route (see "Private docs") to show them to readers who may open them.');
    }
  }

  for (const a of apis) {
    const route = `/reference/${a.id}`;
    const opAccess = new Map(a.model.operations.map((op) => [op.slug, at(`${route}/${op.slug}`)]));
    const apiPlan = plan(`API "${a.id}"`, at(route), a.model.operations.map((op) => ({ id: op.slug, requires: opAccess.get(op.slug)! })), 'v');
    const set: VariantSet = {
      scope: `api:${a.id}`,
      options: apiPlan.options.map(({ key, requires }) => ({ key, requires })),
      routes: [
        { from: route, to: `${route}~{key}` },
        { from: `/openapi/${a.id}.json`, to: `/openapi/${a.id}~{key}.json` },
        { from: `/reference-samples/${a.id}.json`, to: `/reference-samples/${a.id}~{key}.json` },
      ],
    };
    if (set.options.length) variants.push(set);
    // The spec download: what a reader who may open each file may see (canonical, then each variant).
    const withSet = { ...manifest, variants: [set] };
    const files = [{ name: a.id, path: `/openapi/${a.id}.json` }, ...set.options.map((o) => ({ name: `${a.id}~${o.key}`, path: `/openapi/${a.id}~${o.key}.json` }))];
    for (const f of files) {
      const viewer = requiredGroups(withSet, `${manifest.basePath}${f.path}`);
      const slugs = new Set(a.model.operations.filter((op) => implies(viewer, opAccess.get(op.slug)!)).map((op) => op.slug));
      const keep = new Set(a.model.operations.filter((op) => slugs.has(op.slug)).map((op) => `${op.method} ${op.path}`));
      const doc = slugs.size === a.model.operations.length ? readFileSync(a.spec, 'utf8') : stableStringify(pruneDocument(a.document, (m, p) => keep.has(`${m} ${p}`)));
      writeSpec(publicDir, f.name, doc);
    }
    if (set.options.length) log.ok(`${a.id}: ${set.options.length} reader variant(s) of the reference, spec and samples`);
  }

  // The API client holds every API.
  const clientPlan = plan(
    'API client',
    at('/client'),
    apis.flatMap((a) => a.model.operations.map((op) => ({ id: `${a.id}/${op.slug}`, requires: at(`/reference/${a.id}/${op.slug}`) }))),
    'c',
  );
  if (clientPlan.options.length && config.client.enabled) {
    if (hasRoute(dir, 'client/[[...variant]]')) {
      variants.push({ scope: 'client', options: clientPlan.options.map(({ key, requires }) => ({ key, requires })), routes: [{ from: '/client', to: '/client/{key}', paths: ['/client'] }] });
    } else {
      log.warn('The API client shows only public operations to every reader: move app/client/page.tsx to app/client/[[...variant]]/page.tsx (see "Private docs") to show readers the operations they may open.');
    }
  }

  writeFileSync(file, `${JSON.stringify({ ...manifest, variants }, null, 2)}\n`);
}

function writeSpec(publicDir: string, name: string, body: string) {
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, `${name}.json`), body);
}
