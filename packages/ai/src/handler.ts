import { type AccessManifest, type AuthHandler, isAllowed, requiredGroups, type DocsUser, sitePath } from '@vitra-ai/orbitdocs-auth';
import type { LanguageModel } from 'ai';

import { answer, type ChatMessage } from './chat';
import type { AiManifest, AiPage } from './manifest';
import { apiMcp, docsMcp } from './mcp';
import { SearchIndex } from './search';

export interface AiOptions {
  manifest: AiManifest;
  /** The private-docs manifest, so answers only use pages the reader can see. */
  access?: AccessManifest | null;
  /** Resolves the signed-in reader (from @vitra-ai/orbitdocs-auth). */
  auth?: Pick<AuthHandler, 'user'>;
  env?: Record<string, string | undefined>;
  /** Questions per reader (IP) per 10 minutes. */
  rateLimit?: number;
  /** Called for each question with how many passages matched (0 = the docs don't cover it): analytics. */
  onAsk?: (event: { question: string; sources: number; request: Request }) => void;
  /** Tests: a model instead of the configured provider. */
  model?: LanguageModel;
  /**
   * HTTP client for every outbound request: the AI provider and the API MCP's calls to your API.
   * A host can pass one that refuses private addresses (the platform does). Default: fetch.
   */
  fetch?: typeof fetch;
}

export interface AiHandler {
  /** Handles `<base>/_ai/*` and `<base>/mcp[/<api>]`; undefined for any other path. */
  handle(request: Request): Promise<Response | undefined>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export function createAi(options: AiOptions): AiHandler {
  const { manifest } = options;
  const env = options.env ?? process.env;
  const base = manifest.basePath;
  const index = new SearchIndex(manifest.pages);
  const limit = options.rateLimit ?? 30;
  const asked = new Map<string, number[]>();

  /** Who may read a page: the same rules the docs server enforces. */
  const readable = (page: AiPage, user: DocsUser | undefined) =>
    !options.access || isAllowed(user, requiredGroups(options.access, `${base}${page.url}`));
  // MCP clients carry no docs session: they only see what anonymous readers see.
  const publicPages = manifest.pages.filter((p) => readable(p, undefined));
  const publicApi = (id: string) => !options.access || requiredGroups(options.access, `${base}/reference/${id}/`) === null;
  const mcpApis = manifest.ai.mcp.apis;

  function limited(req: Request): boolean {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
    const now = Date.now();
    const recent = (asked.get(ip) ?? []).filter((t) => now - t < 600_000);
    recent.push(now);
    asked.set(ip, recent);
    return recent.length > limit;
  }

  async function handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    const path = sitePath(url.pathname, base);

    if (path === '/_ai/config') {
      const a = manifest.ai.askAi;
      return json({ enabled: a.enabled, greeting: a.greeting, suggestions: a.suggestions });
    }

    if (path === '/_ai/chat') {
      if (!manifest.ai.askAi.enabled) return json({ error: 'Ask AI is off' }, 404);
      if (request.method !== 'POST') return json({ error: 'POST a question' }, 405);
      if (limited(request)) return json({ error: 'Too many questions. Try again in a few minutes.' }, 429);
      const body = (await request.json().catch(() => null)) as { messages?: ChatMessage[] } | null;
      const messages = (body?.messages ?? [])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-12);
      if (!messages.length || messages.at(-1)!.role !== 'user') return json({ error: 'Send messages ending with a question' }, 400);
      const user = await options.auth?.user(request);
      if (options.onAsk) {
        const question = messages.at(-1)!.content;
        const sources = index.search(question, { limit: manifest.ai.askAi.maxSources, filter: (p) => readable(p, user) }).length;
        try {
          options.onAsk({ question, sources, request });
        } catch {
          // analytics never breaks an answer
        }
      }
      return answer({ manifest, index, messages, env, canRead: (p) => readable(p, user), model: options.model, fetch: options.fetch, signal: request.signal });
    }

    if (path === '/mcp' || path.startsWith('/mcp/')) {
      const id = path.split('/')[2];
      if (!id) {
        if (!manifest.ai.mcp.docs) return json({ error: 'Docs MCP is off' }, 404);
        return docsMcp(manifest, publicPages, request);
      }
      const api = manifest.apis.find((a) => a.id === id);
      const enabled = mcpApis === true || (Array.isArray(mcpApis) && mcpApis.includes(id));
      if (!api || !enabled || !publicApi(id)) return json({ error: `No MCP server for API "${id}"` }, 404);
      // Operations gated on their own (an `access.rules` entry on one reference page) are not tools either.
      const operations = api.operations.filter((op) => !options.access || requiredGroups(options.access, `${base}/reference/${id}/${op.slug}/`) === null);
      return apiMcp(manifest, { ...api, operations }, request, options.fetch);
    }
    return undefined;
  }

  return { handle };
}
