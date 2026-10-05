import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { type AiManifest, createAi } from '@vitra-ai/orbitdocs-ai';
import { type AccessManifest, createAuth } from '@vitra-ai/orbitdocs-auth';
import { sendWebResponse, toWebRequest } from '@vitra-ai/orbitdocs-auth/express';

export interface MountOrbitDocsOptions {
  /** Folder with the built site (`orbitdocs build` output). */
  root: string;
  /** URL path to serve it under. Must match `output.basePath` in the docs config. Default `/docs`. */
  path?: string;
  /** Also serve this spec file at `<path>/openapi.json` style URL (optional). */
  spec?: { file: string; path: string };
  /**
   * Private docs. Enabled automatically when the build has an access manifest
   * (`access` in orbitdocs.config.ts). `publicUrl` is the docs origin behind a proxy.
   */
  auth?: false | { publicUrl?: string; env?: Record<string, string | undefined> };
  /**
   * Ask AI and the MCP servers. Enabled automatically when the build has an AI
   * index (`ai` in orbitdocs.config.ts); the LLM key comes from `env`.
   */
  ai?: false | { env?: Record<string, string | undefined>; rateLimit?: number };
}

const INTERNAL = /\/orbitdocs-(access|ai)\.json$/;

type GateRequest = IncomingMessage & { originalUrl?: string; url?: string };

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T | null) : null;
}

/**
 * Serves the static docs build from the Nest app (Express adapter). Call in
 * main.ts before `app.listen()`.
 *
 * @example
 *   await mountOrbitDocs(app, { root: join(__dirname, '../docs/out'), path: '/docs' });
 */
export function mountOrbitDocs(app: INestApplication, options: MountOrbitDocsOptions): void {
  const root = resolve(options.root);
  const base = (options.path ?? '/docs').replace(/\/$/, '');
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`OrbitDocs build not found at ${root}. Run \`orbitdocs build\` first.`);
  }
  const adapter = app.getHttpAdapter();
  if (adapter.getType() !== 'express') {
    throw new Error('mountOrbitDocs supports the Express adapter in this version.');
  }
  const instance = adapter.getInstance() as {
    use: (path: string, ...handlers: unknown[]) => void;
    get: (path: string, handler: (req: unknown, res: { type: (t: string) => { send: (b: string) => void } }) => void) => void;
  };
  // Use the app's own express so the static middleware matches its version.
  const express = createRequire(join(process.cwd(), 'package.json'))('express') as {
    static: (root: string, opts: Record<string, unknown>) => unknown;
  };

  if (options.spec) {
    const specFile = resolve(options.spec.file);
    instance.get(options.spec.path, (_req, res) => res.type('application/json').send(readFileSync(specFile, 'utf8')));
  }
  const access = options.auth !== false ? readJson<AccessManifest>(join(root, 'orbitdocs-access.json')) : null;
  const aiManifest = options.ai !== false ? readJson<AiManifest>(join(root, 'orbitdocs-ai.json')) : null;
  const auth = access ? createAuth({ manifest: access, ...(options.auth || {}) }) : null;
  const ai = aiManifest ? createAi({ manifest: aiManifest, access, auth: auth ?? undefined, ...(options.ai || {}) }) : null;
  // Before any file is served: the internal manifests stay private, AI and sign-in routes answer, then the access gate.
  // Reader-dependent files (sidebar, partially restricted APIs, the client) are served from the variant the reader
  // may open: the request is rewritten in place, the URL the reader sees stays the same.
  instance.use(base || '/', async (req: GateRequest, res: ServerResponse, next: (err?: unknown) => void) => {
    try {
      const request = await toWebRequest(req);
      if (INTERNAL.test(new URL(request.url).pathname)) return void (await sendWebResponse(res, new Response('Not found', { status: 404 })));
      const answered = (await ai?.handle(request)) ?? (await auth?.handle(request));
      if (answered) return void (await sendWebResponse(res, answered));
      if (!auth) return next();
      const result = await auth.gate(request);
      if (!result.allowed) return void (await sendWebResponse(res, result.response));
      if (result.varies) {
        res.setHeader('Vary', 'Cookie');
        res.setHeader('Cache-Control', 'private, no-cache');
      }
      if (result.rewrite) {
        const search = (req.url ?? '').includes('?') ? (req.url ?? '').slice((req.url ?? '').indexOf('?')) : '';
        // Under `instance.use(base, …)` the request URL is relative to the base path.
        req.url = `${result.rewrite.slice(base.length) || '/'}${search}`;
      }
      next();
    } catch (err) {
      next(err);
    }
  });
  instance.use(base || '/', express.static(root, { extensions: ['html'], index: ['index.html'], fallthrough: true }));
  const notFound = join(root, '404.html');
  if (existsSync(notFound)) {
    instance.use(base || '/', (_req: unknown, res: { status: (n: number) => { type: (t: string) => { send: (b: string) => void } } }) =>
      res.status(404).type('text/html').send(readFileSync(notFound, 'utf8')),
    );
  }
}
