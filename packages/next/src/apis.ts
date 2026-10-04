import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type ApiConfig, type OrbitDocsConfig, referenceRoute, specFile } from '@orbitdocs/core';
import { buildReferenceModel, type Document, loadDocument, type ReferenceModel } from '@orbitdocs/openapi';

export interface LoadedApi {
  id: string;
  config: ApiConfig;
  document: Document;
  model: ReferenceModel;
  /** Route of the reference, without base path (`/reference/travel`). */
  route: string;
}

const cache = new Map<string, Promise<LoadedApi>>();

/**
 * One API's spec, as written by `orbitdocs extract` (or copied for `file`
 * sources) into `openapi/<id>.json`, plus the reference model built from it.
 * Config title/description/version/servers override the spec's.
 */
export function loadApi(config: OrbitDocsConfig, api: ApiConfig, appDir = process.cwd()): Promise<LoadedApi> {
  const key = `${appDir}:${api.id}`;
  let pending = cache.get(key);
  if (!pending || process.env.NODE_ENV === 'development') {
    pending = (async () => {
      const file = specFile(appDir, api.id);
      if (!existsSync(file)) {
        throw new Error(
          `No spec for API "${api.id}" at ${file}. Run \`orbitdocs extract\` (or \`orbitdocs dev\`) in ${appDir}.`,
        );
      }
      const { document } = await loadDocument(readFileSync(file, 'utf8'));
      if (api.title) document.info.title = api.title;
      if (api.description) document.info.description = api.description;
      if (api.version) document.info.version = api.version;
      if (api.servers) document.servers = api.servers;
      addSdkSamples(document, api.id, appDir);
      // The mock server as one more server (dev, or a hosted mock), never a localhost URL in production.
      const m = config.mock;
      const mockUrl = m?.client === false ? undefined : (m?.url ?? (process.env.NODE_ENV === 'development' && m ? `http://localhost:${m.port}` : undefined));
      if (mockUrl) document.servers = [...(document.servers ?? []), { url: mockUrl, description: 'Mock server', 'x-orbitdocs-mock': true }];
      return { id: api.id, config: api, document, model: buildReferenceModel(document, api.id), route: referenceRoute(api.id) };
    })();
    cache.set(key, pending);
  }
  return pending;
}

/** SDK code samples from `orbitdocs sdk` (`.orbitdocs/sdk-samples.json`), as `x-codeSamples`. */
function addSdkSamples(document: Document, apiId: string, appDir: string) {
  const file = join(appDir, '.orbitdocs', 'sdk-samples.json');
  if (!existsSync(file)) return;
  const samples = (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, Array<{ lang: string; label: string; source: string }>>>)[apiId];
  if (!samples) return;
  for (const [key, list] of Object.entries(samples)) {
    const [method, path] = key.split(' ') as [string, string];
    const op = document.paths?.[path]?.[method.toLowerCase() as 'get'] as Record<string, unknown> | undefined;
    if (!op) continue;
    // A hand-written sample with the same label (e.g. from @DocsSamples) wins.
    const existing = (op['x-codeSamples'] as Array<{ label?: string; lang: string }> | undefined) ?? [];
    const taken = new Set(existing.map((s) => (s.label ?? s.lang).toLowerCase()));
    op['x-codeSamples'] = [...existing, ...list.filter((s) => !taken.has(s.label.toLowerCase()))];
  }
}

export function loadApis(config: OrbitDocsConfig, appDir = process.cwd()): Promise<LoadedApi[]> {
  return Promise.all(config.apis.map((api) => loadApi(config, api, appDir)));
}

/** Path of the published spec copy (served from `public/openapi/<id>.json`). */
export function specUrl(config: OrbitDocsConfig, id: string): string {
  return `${config.output.basePath}/openapi/${id}.json`;
}

/** Whether `public/openapi/<id>.json` exists (the CLI copies specs there for download). */
export function hasPublicSpec(id: string, appDir = process.cwd()): boolean {
  return existsSync(join(appDir, 'public', 'openapi', `${id}.json`));
}

/** `.orbitdocs/access.json` written by the CLI (null when the site has no private docs). */
/** `.orbitdocs/ai.json` (written by the CLI): copied into the build for the server that runs Ask AI and MCP. */
export function readAiManifest(appDir = process.cwd()): unknown {
  const file = join(appDir, '.orbitdocs', 'ai.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function readAccessManifest(appDir = process.cwd()): unknown {
  const file = join(appDir, '.orbitdocs', 'access.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
