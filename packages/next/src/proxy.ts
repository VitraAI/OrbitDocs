import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type AiHandler, type AiManifest, createAi } from '@vitra-ai/orbitdocs-ai';
import { type AccessManifest, type AuthHandler, createAuth } from '@vitra-ai/orbitdocs-auth';
import { NextResponse } from 'next/server';

export interface OrbitProxyOptions {
  /** The docs app folder (where `.orbitdocs/access.json` is). Defaults to the working directory. */
  appDir?: string;
  /** Public origin (https://docs.acme.com) when the app runs behind a proxy that rewrites Host. */
  publicUrl?: string;
}

/** Next only accepts absolute redirects from a proxy. */
function absolute(response: Response, request: Request): Response {
  const location = response.headers.get('location');
  if (!location || /^[a-z][a-z0-9+.-]*:/i.test(location)) return response;
  const headers = new Headers(response.headers);
  headers.set('location', new URL(location, request.url).href);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Private docs in Next server mode (`output.mode: 'server'`, e.g. Vercel or
 * Docker): serves `/_auth/*` and gates every page before it renders.
 *
 *   // proxy.ts
 *   import { orbitProxy } from '@vitra-ai/orbitdocs-next/proxy';
 *   export default orbitProxy();
 *
 * Also serves Ask AI and the MCP servers when the config has `ai`. Without
 * `access` and `ai` it lets everything through.
 *
 * Reader-dependent pages and files (the sidebar, partially restricted APIs,
 * the API client) are rewritten to the most complete variant the reader may
 * open; the URL in the browser stays the same.
 */
export function orbitProxy(options: OrbitProxyOptions = {}) {
  let loaded: { auth: AuthHandler | null; ai: AiHandler | null } | undefined;
  const load = () => {
    if (loaded) return loaded;
    const read = <T>(name: string): T | null => {
      const file = join(options.appDir ?? process.cwd(), '.orbitdocs', name);
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T | null) : null;
    };
    const access = read<AccessManifest>('access.json');
    const aiManifest = read<AiManifest>('ai.json');
    const auth = access ? createAuth({ manifest: access, publicUrl: options.publicUrl }) : null;
    loaded = { auth, ai: aiManifest ? createAi({ manifest: aiManifest, access, auth: auth ?? undefined }) : null };
    return loaded;
  };

  return async function proxy(request: Request): Promise<Response | undefined> {
    // The internal manifests are never served.
    if (/\/orbitdocs-(access|ai)\.json\/?$/.test(new URL(request.url).pathname)) return new Response('Not found', { status: 404 });
    const { auth, ai } = load();
    const answered = (await ai?.handle(request)) ?? (await auth?.handle(request));
    if (answered) return absolute(answered, request);
    if (!auth) return undefined;
    const result = await auth.gate(request);
    if (!result.allowed) return absolute(result.response, request);
    if (!result.varies) return undefined;
    // The same URL serves different content per reader: no shared cache may keep it.
    const headers = { Vary: 'Cookie', 'Cache-Control': 'private, no-cache' };
    if (!result.rewrite) return NextResponse.next({ headers });
    const target = new URL(request.url);
    target.pathname = result.rewrite;
    return NextResponse.rewrite(target, { headers });
  };
}
