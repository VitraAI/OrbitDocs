import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { type AccessManifest, implies, type Requirement, requiredGroups, requirementKey } from '@vitra-ai/orbitdocs-auth/edge';
import type { OrbitDocsConfig } from '@vitra-ai/orbitdocs-core';
import { pruneModel, type ReferenceModel } from '@vitra-ai/orbitdocs-openapi';

/**
 * Reader-dependent files: the access manifest (`.orbitdocs/access.json`,
 * written by the CLI) plans which variants exist; these helpers render each
 * one. The rule everywhere: a file holds exactly the items (guide pages,
 * operations) a reader who may open that file may see. Canonical files hold
 * what every allowed reader may see; the server (mountOrbitDocs, the Next
 * proxy) serves a reader the most complete variant they may open instead.
 */

let cached: { file: string; mtime: number; manifest: AccessManifest | null } | undefined;

/** `.orbitdocs/access.json`, re-read when it changes. null without private docs. */
export function accessManifest(appDir = process.cwd()): AccessManifest | null {
  const file = join(appDir, '.orbitdocs', 'access.json');
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  if (cached?.file !== file || cached.mtime !== mtime) {
    cached = { file, mtime, manifest: JSON.parse(readFileSync(file, 'utf8')) as AccessManifest | null };
  }
  return cached.manifest;
}

/** What a reader needs to open a site path (no base path); null = public. */
export function accessAt(manifest: AccessManifest, path: string): Requirement | null {
  return requiredGroups(manifest, `${manifest.basePath}${path}`);
}

/** The options of one variant set (`guides`, `client`, `api:<id>`). */
export function variantOptions(manifest: AccessManifest | null, scope: string): Array<{ key: string; requires: Requirement }> {
  return manifest?.variants?.find((v) => v.scope === scope)?.options ?? [];
}

/** `public~v1` → `{ id: 'public', key: 'v1' }`: an API variant's route segment. */
export function splitApiParam(param: string): { id: string; key?: string } {
  const i = param.indexOf('~');
  return i === -1 ? { id: param } : { id: param.slice(0, i), key: param.slice(i + 1) };
}

const pruned = new WeakMap<ReferenceModel, Map<string, ReferenceModel>>();

/**
 * The API's model with only the operations a reader who satisfies `viewer`
 * may open (each operation is decided by its reference page's access). The
 * full model without private docs.
 */
export function modelFor(manifest: AccessManifest | null, model: ReferenceModel, route: string, viewer: Requirement | null): ReferenceModel {
  if (!manifest) return model;
  let byViewer = pruned.get(model);
  if (!byViewer) pruned.set(model, (byViewer = new Map()));
  const key = requirementKey(viewer);
  let out = byViewer.get(key);
  if (!out) {
    out = pruneModel(model, (op) => implies(viewer, accessAt(manifest, `${route}/${op.slug}`)));
    byViewer.set(key, out);
  }
  return out;
}

/** The site default every reader of a page already satisfies: sign-in in `private` mode. */
export function siteDefault(manifest: AccessManifest): Requirement | null {
  return manifest.mode === 'private' ? [['*']] : null;
}

/**
 * Whether the readers of `readerOf` (a site path, e.g. `/reference/admin` or
 * `/~/g1`; every reader of the site when omitted) may open each path. Used for
 * links in shared chrome (the top bar's API menu, tabs), so a file never links
 * to what its own readers can't open. Always true without private docs.
 */
export function readerMayOpen(readerOf?: string): (path: string) => boolean {
  const manifest = accessManifest();
  if (!manifest) return () => true;
  const viewer = readerOf ? accessAt(manifest, readerOf) : siteDefault(manifest);
  return (path) => /^[a-z][a-z0-9+.-]*:/i.test(path) || implies(viewer, accessAt(manifest, path));
}

/** Route segments of an API's variants (`public~v1`), one per option. */
export function apiVariantParams(_config: Pick<OrbitDocsConfig, 'apis'>, apiId: string): string[] {
  return variantOptions(accessManifest(), `api:${apiId}`).map((o) => `${apiId}~${o.key}`);
}

/** `app/client/[[...variant]]/page.tsx`: the client (`/client/`), plus one copy per reader variant. */
export function clientStaticParams(): Array<{ variant: string[] }> {
  return [{ variant: [] }, ...variantOptions(accessManifest(), 'client').map((o) => ({ variant: [o.key] }))];
}
