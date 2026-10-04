import { existsSync, readFileSync } from 'node:fs';

import { specFile } from '@orbitdocs/core';
import type { LoadedConfig } from '@orbitdocs/core/loader';
import { buildReferenceModel, loadDocument, type Document } from '@orbitdocs/openapi';

import { fail, log } from '../util';

/** Puts the configured handlers on their operations as `x-handler` (the mock server's custom responses). */
export function withHandlers(document: Document, apiId: string, handlers: Record<string, string>): Document {
  const model = buildReferenceModel(document, apiId);
  for (const op of model.operations) {
    const code = handlers[`${apiId}/${op.slug}`] ?? handlers[op.slug];
    if (!code) continue;
    const target = document.paths?.[op.path]?.[op.method] as Record<string, unknown> | undefined;
    if (target) target['x-handler'] = code;
  }
  return document;
}

/** The mock server for one API, as a fetch handler. */
export async function mockApp(loaded: LoadedConfig, apiId: string): Promise<{ fetch: (request: Request) => Response | Promise<Response> }> {
  const { config, dir } = loaded;
  const file = specFile(dir, apiId);
  if (!existsSync(file)) fail(`No spec for ${apiId}. Run \`orbitdocs extract\` first.`);
  const { document } = await loadDocument(readFileSync(file, 'utf8'));
  // The mock answers on its own origin.
  document.servers = [{ url: '/' }];
  withHandlers(document, apiId, config.mock?.handlers ?? {});
  const { createMockServer } = await import('@scalar/mock-server');
  return createMockServer({ document: document as Record<string, unknown>, validateRequest: config.mock?.validate ?? true, logger: false });
}

/** `orbitdocs mock`: serves one API's mock on `mock.port`. */
export async function mock(loaded: LoadedConfig, options: { api?: string; port?: string } = {}): Promise<void> {
  const { config } = loaded;
  const api = options.api ?? config.apis[0]?.id;
  if (!api) fail('No API in the config.');
  const port = Number(options.port ?? config.mock?.port ?? 4010);
  const app = await mockApp(loaded, api);
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port }, () => {
    log.ok(`Mock ${api} at http://localhost:${port}`);
    log.dim('    Requests are checked against the spec (422 when they do not match). Ctrl+C to stop.');
  });
}
