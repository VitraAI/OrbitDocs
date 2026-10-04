import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, type CallToolResult, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';

import type { AiApi, AiManifest, AiOperation, AiPage } from './manifest';
import { SearchIndex } from './search';

const text = (t: string, isError = false): CallToolResult => ({ content: [{ type: 'text', text: t }], isError });

interface ToolDef {
  tool: Tool;
  run(args: Record<string, unknown>): Promise<CallToolResult>;
}

/** Serves one stateless MCP request with the given tools. */
async function serve(name: string, version: string, instructions: string, tools: ToolDef[], request: Request): Promise<Response> {
  const server = new Server({ name, version }, { capabilities: { tools: {} }, instructions });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map((t) => t.tool) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = tools.find((t) => t.tool.name === req.params.name);
    if (!def) return text(`Unknown tool: ${req.params.name}`, true);
    try {
      return await def.run((req.params.arguments ?? {}) as Record<string, unknown>);
    } catch (err) {
      return text(`Error: ${(err as Error).message}`, true);
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

const absolute = (m: AiManifest, url: string) => `${m.site.url ?? ''}${m.basePath}${url}`;

/** Docs MCP: search and read the public guides and API references. */
export function docsMcp(manifest: AiManifest, pages: AiPage[], request: Request): Promise<Response> {
  const index = new SearchIndex(pages);
  const byUrl = new Map(pages.map((p) => [p.url.replace(/\/$/, ''), p]));
  const find = (url: string) => {
    let path = url.trim();
    try {
      path = new URL(path, 'http://x').pathname;
    } catch {
      // keep as is
    }
    if (manifest.basePath && path.startsWith(manifest.basePath)) path = path.slice(manifest.basePath.length);
    return byUrl.get(path.replace(/\/$/, '') || '/') ?? byUrl.get(`/${path.replace(/^\/|\/$/g, '')}`);
  };
  const tools: ToolDef[] = [
    {
      tool: {
        name: 'search_docs',
        description: `Search the ${manifest.site.title} documentation (guides and API reference). Returns the best passages with their page URLs; read a page with read_page.`,
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'What to look for, in plain words.' }, limit: { type: 'number', description: 'Passages to return (default 5, max 10).' } },
          required: ['query'],
        },
        annotations: { readOnlyHint: true },
      },
      async run(args) {
        const hits = index.search(String(args.query ?? ''), { limit: Math.min(Number(args.limit) || 5, 10) });
        if (!hits.length) return text('No matching documentation.');
        return text(
          hits
            .map(({ chunk }, i) => `${i + 1}. ${chunk.page.title}${chunk.heading ? ` > ${chunk.heading}` : ''}\n   URL: ${absolute(manifest, chunk.page.url)}\n\n${chunk.text.slice(0, 900)}`)
            .join('\n\n---\n\n'),
        );
      },
    },
    {
      tool: {
        name: 'read_page',
        description: 'Read one documentation page as Markdown, by URL or path (from search_docs or list_pages).',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        annotations: { readOnlyHint: true },
      },
      async run(args) {
        const page = find(String(args.url ?? ''));
        return page ? text(`# ${page.title}\n\n${page.markdown}`) : text('No such page. Use list_pages or search_docs.', true);
      },
    },
    {
      tool: {
        name: 'list_pages',
        description: 'List every guide and API operation page with its URL.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
      },
      async run() {
        const guides = pages.filter((p) => p.kind === 'guide').map((p) => `- ${p.title}: ${p.url}`);
        const ops = pages.filter((p) => p.kind === 'operation').map((p) => `- [${p.api}] ${p.title}: ${p.url}`);
        return text(`## Guides\n${guides.join('\n')}\n\n## API operations\n${ops.join('\n')}`);
      },
    },
  ];
  return serve(`${manifest.site.title} docs`, '1.0.0', `Documentation for ${manifest.site.title}. Use search_docs first, then read_page.`, tools, request);
}

/** Calls the API on behalf of the MCP client, passing its credentials through. */
export async function callOperation(api: AiApi, op: AiOperation, args: Record<string, unknown>, incoming: Headers, fetcher: typeof fetch = fetch): Promise<CallToolResult> {
  if (!api.serverUrl) return text(`No server URL for ${api.title}: add servers to the spec or the config.`, true);
  let path = op.path;
  const query = new URLSearchParams();
  const headers = new Headers({ accept: 'application/json' });
  for (const p of op.params) {
    const v = args[p.name];
    if (v === undefined || v === null || v === '') {
      if (p.required && p.in === 'path') return text(`Missing required path parameter "${p.name}".`, true);
      continue;
    }
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (p.in === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(s));
    else if (p.in === 'query') {
      if (Array.isArray(v)) for (const x of v) query.append(p.name, String(x));
      else query.set(p.name, s);
    } else if (p.in === 'header') headers.set(p.name, s);
  }
  // Credentials come from the MCP client's own request, never from the docs server.
  for (const name of ['authorization', ...api.credentialHeaders.map((h) => h.toLowerCase())]) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }
  let body: BodyInit | undefined;
  if (op.body && args.body !== undefined) {
    headers.set('content-type', op.body.mediaType.includes('json') ? 'application/json' : op.body.mediaType);
    body = typeof args.body === 'string' && !op.body.mediaType.includes('json') ? args.body : JSON.stringify(args.body);
  }
  const url = `${api.serverUrl.replace(/\/+$/, '')}${path}${query.size ? `?${query}` : ''}`;
  const res = await fetcher(url, { method: op.method.toUpperCase(), headers, body });
  const raw = await res.text();
  let pretty = raw;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // not JSON
  }
  const shown = pretty.length > 50_000 ? `${pretty.slice(0, 50_000)}\n… (truncated)` : pretty;
  return text(`${op.method.toUpperCase()} ${path} → ${res.status} ${res.statusText}\n\n${shown}`, !res.ok);
}

/** API MCP: the API's operations as tools, called with the client's credentials. */
export function apiMcp(manifest: AiManifest, api: AiApi, request: Request, fetcher?: typeof fetch): Promise<Response> {
  const incoming = request.headers;
  const opTool = (op: AiOperation): Tool => ({
    name: op.tool,
    title: op.title,
    description: `${op.title} — ${op.method.toUpperCase()} ${op.path}${op.description ? `\n\n${op.description.slice(0, 900)}` : ''}`,
    inputSchema: op.inputSchema as Tool['inputSchema'],
    annotations: { readOnlyHint: op.method === 'get' || op.method === 'head', destructiveHint: op.method === 'delete' },
  });
  let tools: ToolDef[];
  if (manifest.ai.mcp.tools === 'per-operation') {
    tools = api.operations.map((op) => ({ tool: opTool(op), run: (args) => callOperation(api, op, args, incoming, fetcher) }));
  } else {
    const index = new SearchIndex(
      api.operations.map((op) => ({ url: op.slug, title: op.title, kind: 'operation', api: api.id, markdown: `${op.method} ${op.path}\n${op.description ?? ''}` })),
    );
    tools = [
      {
        tool: {
          name: 'search_operations',
          description: `Find ${api.title} operations by what they do. Returns each operation's name and input schema for call_operation.`,
          inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
          annotations: { readOnlyHint: true },
        },
        async run(args) {
          const hits = index.search(String(args.query ?? ''), { limit: 8 });
          const ops = hits.map((h) => api.operations.find((o) => o.slug === h.chunk.page.url)!);
          if (!ops.length) return text('No matching operations.');
          return text(ops.map((o) => `### ${o.tool}\n${o.title} — ${o.method.toUpperCase()} ${o.path}\nInput schema: ${JSON.stringify(o.inputSchema)}`).join('\n\n'));
        },
      },
      {
        tool: {
          name: 'call_operation',
          description: `Call a ${api.title} operation found with search_operations.`,
          inputSchema: {
            type: 'object',
            properties: { operation: { type: 'string', description: 'Operation name from search_operations.' }, arguments: { type: 'object' } },
            required: ['operation'],
          },
        },
        async run(args) {
          const op = api.operations.find((o) => o.tool === args.operation || o.slug === args.operation);
          if (!op) return text(`Unknown operation "${String(args.operation)}". Use search_operations.`, true);
          return callOperation(api, op, (args.arguments ?? {}) as Record<string, unknown>, incoming, fetcher);
        },
      },
    ];
  }
  return serve(`${api.title}`, '1.0.0', `Call the ${api.title}. Pass your API credentials as HTTP headers when connecting.`, tools, request);
}
