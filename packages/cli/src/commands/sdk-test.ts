import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { specFile } from '@vitra-ai/orbitdocs-core';
import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';
import { buildReferenceModel, exampleFor, loadDocument, type OperationModel, type ReferenceModel } from '@vitra-ai/orbitdocs-openapi';
import pc from 'picocolors';

import { fail, log } from '../util';
import { mockApp } from './mock';
import { sdkDir } from './sdk';

type SdkFn = (options?: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown; response?: Response }>;

/** The SDK call's options from the spec's examples: path, query, headers, body. */
export function exampleOptions(op: OperationModel, model: ReferenceModel): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const where of ['path', 'query', 'header'] as const) {
    const params = op.parameters.filter((p) => p.in === where && (p.required || p.example !== undefined));
    if (!params.length) continue;
    options[where === 'header' ? 'headers' : where] = Object.fromEntries(params.map((p) => [p.name, p.example ?? exampleFor(p.schema, model.schemas, { direction: 'request' })]));
  }
  const body = op.requestBody?.content[0];
  if (body) {
    const example = body.example ?? exampleFor(body.schema, model.schemas, { direction: 'request' });
    // Multipart bodies go in as plain objects; the SDK builds the form.
    options.body = body.mediaType.includes('multipart') && example && typeof example === 'object' ? Object.fromEntries(Object.entries(example).map(([k, v]) => [k, typeof v === 'string' && /binary|file/i.test(k) ? new Blob(['test']) : v])) : example;
  }
  return options;
}

/**
 * `orbitdocs sdk test`: calls every operation through the generated TypeScript
 * SDK against the mock server, with the spec's examples. Fails on any non-2xx.
 */
export async function sdkTest(loaded: LoadedConfig, options: { api?: string } = {}): Promise<boolean> {
  const { config, dir } = loaded;
  if (!config.sdks?.typescript) fail('sdks.typescript is not configured.');
  let ok = true;
  for (const api of config.apis) {
    if (options.api && api.id !== options.api) continue;
    if (config.sdks.apis && !config.sdks.apis.includes(api.id)) continue;
    const entry = join(sdkDir(loaded, api.id, 'typescript'), 'src', 'index.ts');
    if (!existsSync(entry)) fail(`No TypeScript SDK for ${api.id}. Run \`orbitdocs sdk --lang typescript\` first.`);

    // Bundle the SDK as it ships.
    const tmp = mkdtempSync(join(tmpdir(), 'orbitdocs-sdk-'));
    const { build } = await import('esbuild');
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'sdk.mjs'), logLevel: 'silent' });
    const sdk = (await import(pathToFileURL(join(tmp, 'sdk.mjs')).href)) as Record<string, SdkFn> & { client: { setConfig(c: Record<string, unknown>): void } };

    // The mock, in-process on a free port.
    const app = await mockApp(loaded, api.id);
    const { serve } = await import('@hono/node-server');
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;

    const { document } = await loadDocument(readFileSync(specFile(dir, api.id), 'utf8'));
    const model = buildReferenceModel(document, api.id);
    // Placeholder credentials for every security scheme: the mock only checks they are present.
    const headers: Record<string, string> = {};
    for (const raw of Object.values(model.securitySchemes)) {
      const s = raw as { type?: string; in?: string; name?: string; scheme?: string };
      if (s.type === 'apiKey' && s.in === 'header' && s.name) headers[s.name] = 'test-key';
      if (s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect') headers.Authorization = s.scheme === 'basic' ? `Basic ${btoa('test:test')}` : 'Bearer test-token';
    }
    sdk.client.setConfig({ baseUrl: `http://localhost:${port}`, headers });

    const fns = sdkFunctions(sdkDir(loaded, api.id, 'typescript'));
    log.step(`${api.id}: ${model.operations.length} operations through the TypeScript SDK against the mock`);
    let passed = 0;
    for (const op of model.operations) {
      const name = fns.get(`${op.method.toUpperCase()} ${op.path}`);
      const fn = name ? sdk[name] : undefined;
      if (!fn) {
        ok = false;
        console.log(`  ${pc.red('✗')} ${op.method.toUpperCase()} ${op.path} ${pc.dim('no SDK function')}`);
        continue;
      }
      try {
        const res = await fn(exampleOptions(op, model));
        const status = res.response?.status ?? 0;
        if (status >= 200 && status < 300 && !res.error) {
          passed++;
          console.log(`  ${pc.green('✓')} ${name} ${pc.dim(`${op.method.toUpperCase()} ${op.path} → ${status}`)}`);
        } else {
          ok = false;
          console.log(`  ${pc.red('✗')} ${name} ${pc.dim(`→ ${status}`)} ${JSON.stringify(res.error).slice(0, 300)}`);
        }
      } catch (err) {
        ok = false;
        console.log(`  ${pc.red('✗')} ${name} ${(err as Error).message}`);
      }
    }
    server.close();
    rmSync(tmp, { recursive: true, force: true });
    (passed === model.operations.length ? log.ok : log.error)(`${api.id}: ${passed}/${model.operations.length} SDK calls passed`);
  }
  return ok;
}

/** Generated TypeScript functions by `METHOD /path`. */
export function sdkFunctions(out: string): Map<string, string> {
  const map = new Map<string, string>();
  const file = join(out, 'src', 'generated', 'sdk.gen.ts');
  if (!existsSync(file)) return map;
  const re = /export const (\w+) = [\s\S]*?\)\.(get|post|put|patch|delete|head|options)<[\s\S]*?url: '([^']+)'/g;
  for (const m of readFileSync(file, 'utf8').matchAll(re)) map.set(`${m[2]!.toUpperCase()} ${m[3]}`, m[1]!);
  return map;
}
