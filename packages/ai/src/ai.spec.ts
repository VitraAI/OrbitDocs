import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AccessManifest } from '@orbitdocs/auth';
import { buildReferenceModel, loadDocument } from '@orbitdocs/openapi';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { buildAiManifest, inlineRefs, toolName } from './build-manifest';
import { createAi } from './handler';
import type { AiManifest, AiSettings } from './manifest';
import { chunkPage, SearchIndex, tokens } from './search';

const settings: AiSettings = {
  provider: 'openai-compatible',
  model: 'test',
  apiKeyEnv: 'KEY',
  baseUrl: 'http://llm.test/v1',
  askAi: { enabled: true, suggestions: ['How do I book?'], maxSources: 4 },
  mcp: { docs: true, apis: true, tools: 'per-operation' },
};

const spec = {
  openapi: '3.1.0',
  info: { title: 'Travel API', version: '1.0.0' },
  servers: [{ url: 'https://api.travel.test' }],
  components: {
    securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
    schemas: { Passenger: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
  },
  security: [{ apiKey: [] }],
  paths: {
    '/v1/bookings': {
      post: {
        operationId: 'createBooking',
        summary: 'Create a booking',
        description: 'Books seats on a flight.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['flightId'], properties: { flightId: { type: 'string' }, passengers: { type: 'array', items: { $ref: '#/components/schemas/Passenger' } } } } } },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/v1/bookings/{id}': {
      get: {
        summary: 'Get a booking',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'expand', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

async function manifest(): Promise<AiManifest> {
  const { document } = await loadDocument(JSON.stringify(spec));
  return buildAiManifest({
    site: { title: 'Travel', url: 'https://docs.travel.test' },
    output: { basePath: '/docs' },
    ai: settings,
    guides: [
      { url: '/quickstart', title: 'Quickstart', description: 'Make your first booking.', markdown: 'Get an API key.\n\n## Book a seat\n\nPOST /v1/bookings with a flightId.' },
      { url: '/webhooks', title: 'Webhooks', markdown: 'We POST booking.confirmed events to your endpoint.\n\n## Verify signatures\n\nCheck the Orbit-Signature header.' },
      { url: '/internal/runbook', title: 'On-call runbook', markdown: 'Page the flight-ops channel when bookings are stuck.' },
    ],
    apis: [{ id: 'travel', route: '/reference/travel', model: buildReferenceModel(document, 'travel') }],
  });
}

const access: AccessManifest = {
  version: 2,
  basePath: '/docs',
  site: { title: 'Travel' },
  mode: 'public',
  groups: { staff: { emails: [], domains: ['travel.test'], idpGroups: [] } },
  rules: [{ pattern: '/internal/*', groups: ['staff'] }],
  providers: [],
  session: { secretEnv: 'S', maxAgeHours: 1 },
  loginPage: {},
};

/** A model that answers with fixed text and records the prompt. */
function mockModel(reply: string) {
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'text-start', id: 't' });
          for (const word of reply.split(' ')) c.enqueue({ type: 'text-delta', id: 't', delta: `${word} ` });
          c.enqueue({ type: 'text-end', id: 't' });
          c.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage });
          c.close();
        },
      }),
    }),
  } as never);
}

async function readNdjson(res: Response) {
  return (await res.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { type: string; delta?: string; sources?: Array<{ title: string; url: string }> });
}

describe('search', () => {
  it('tokenizes and chunks by section', () => {
    expect(tokens('How do I verify the Signatures?')).toEqual(['verific', 'signatur']);
    expect(tokens('verification verifies')).toEqual(['verific', 'verific']);
    expect(tokens('paginate pagination')).toEqual(['pagin', 'pagin']);
    expect(tokens('authentication authenticate')).toEqual(['authentic', 'authentic']);
    const chunks = chunkPage({ url: '/w', title: 'W', kind: 'guide', markdown: 'intro\n\n## A\n\none\n\n```\n## not a heading\n```\n\n## B\n\ntwo' }, 0);
    expect(chunks.map((c) => c.heading)).toEqual([undefined, 'A', 'B']);
  });
  it('ranks the section that answers the question first', async () => {
    const index = new SearchIndex((await manifest()).pages);
    expect(index.search('verify webhook signature')[0]!.chunk.heading).toBe('Verify signatures');
    expect(index.search('create booking flight')[0]!.chunk.page.title).toMatch(/Create a booking|Quickstart/);
    const paging = new SearchIndex([
      { url: '/pagination', title: 'Pagination', kind: 'guide', markdown: 'Pass nextCursor as cursor to get the next page.' },
      { url: '/flights', title: 'Search flights', kind: 'operation', markdown: 'Results are ordered by departure time.' },
    ]);
    expect(paging.search('How do I paginate results?')[0]!.chunk.page.title).toBe('Pagination');
    const auth = new SearchIndex([
      { url: '/authentication', title: 'Authentication', kind: 'guide', markdown: 'Send your API key in the x-api-key header. Keep it secret and rotate it from the dashboard when someone leaves the team.' },
      ...['Create', 'List', 'Delete'].map((v) => ({ url: `/${v}`, title: `${v} a webhook`, kind: 'operation' as const, markdown: '### 401\n\nAuthentication is missing or invalid.' })),
    ]);
    expect(auth.search('How do I authenticate?')[0]!.chunk.page.title).toBe('Authentication');
  });
});

describe('buildAiManifest', () => {
  it('turns operations into pages and tools', async () => {
    const m = await manifest();
    expect(m.pages.filter((p) => p.kind === 'operation').map((p) => p.url)).toEqual(['/reference/travel/createbooking', '/reference/travel/get-a-booking']);
    const api = m.apis[0]!;
    expect(api.serverUrl).toBe('https://api.travel.test');
    expect(api.credentialHeaders).toEqual(['x-api-key']);
    const create = api.operations.find((o) => o.slug === 'createbooking')!;
    expect(create.tool).toBe('create_booking');
    const body = (create.inputSchema.properties as Record<string, { properties: { passengers: { items: unknown } } }>).body;
    expect(body.properties.passengers.items).toEqual({ type: 'object', required: ['name'], properties: { name: { type: 'string' } } });
    expect(create.inputSchema.required).toEqual(['body']);
    const get = api.operations.find((o) => o.slug === 'get-a-booking')!;
    expect(get.inputSchema.required).toEqual(['id']);
  });
  it('names tools uniquely and inlines refs', () => {
    const taken = new Set<string>();
    expect([toolName('list-items', taken), toolName('list-items', taken)]).toEqual(['list_items', 'list_items_2']);
    expect(inlineRefs({ $ref: '#/components/schemas/A' }, { A: { type: 'string', example: 'x' } })).toEqual({ type: 'string' });
  });
});

describe('Ask AI', () => {
  it('streams sources then the answer, from pages the reader can see', async () => {
    const m = await manifest();
    const model = mockModel('Use POST /v1/bookings [1].');
    const ai = createAi({ manifest: m, access, model, env: {} });
    const res = await ai.handle(
      new Request('https://docs.travel.test/docs/_ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'How do I book a seat when bookings are stuck?' }] }) }),
    );
    const lines = await readNdjson(res!);
    expect(lines[0]!.type).toBe('sources');
    const urls = lines[0]!.sources!.map((s) => s.url);
    expect(urls).toContain('/docs/quickstart/');
    expect(urls).not.toContain('/docs/internal/runbook/');
    expect(lines.filter((l) => l.type === 'text').map((l) => l.delta).join('')).toContain('POST /v1/bookings [1].');
    expect(lines.at(-1)!.type).toBe('done');
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('Answer the question using only the numbered sources');
    expect(prompt).not.toContain('flight-ops');
  });

  it('reports a failing provider as an error, not an empty answer', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({ message: 'Incorrect API key provided: sk-abc…', url: 'http://llm.test/v1/chat/completions', requestBodyValues: {}, statusCode: 401, isRetryable: false });
      },
    });
    const ai = createAi({ manifest: await manifest(), model, env: {} });
    const lines = await readNdjson((await ai.handle(new Request('https://d.test/docs/_ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) })))!);
    expect(lines.at(-1)).toEqual({ type: 'error', message: "The AI provider couldn't answer (HTTP 401). Try again in a moment." });
    expect(JSON.stringify(lines)).not.toContain('sk-abc');
  });

  it('includes private pages for readers in the group', async () => {
    const ai = createAi({ manifest: await manifest(), access, model: mockModel('ok'), env: {}, auth: { user: async () => ({ email: 'a@travel.test', groups: ['staff'], provider: 'x' }) } });
    const res = await ai.handle(new Request('https://docs.travel.test/docs/_ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'bookings stuck flight-ops' }] }) }));
    expect((await readNdjson(res!))[0]!.sources!.map((s) => s.url)).toContain('/docs/internal/runbook/');
  });

  it('rate-limits each reader and validates input', async () => {
    const ai = createAi({ manifest: await manifest(), model: mockModel('ok'), env: {}, rateLimit: 1 });
    const ask = () => ai.handle(new Request('https://d.test/docs/_ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
    expect((await ask())!.status).toBe(200);
    expect((await ask())!.status).toBe(429);
    const bad = await createAi({ manifest: await manifest(), env: {} }).handle(new Request('https://d.test/docs/_ai/chat', { method: 'POST', body: '{}' }));
    expect(bad!.status).toBe(400);
    const config = await ai.handle(new Request('https://d.test/docs/_ai/config'));
    expect(await config!.json()).toEqual({ enabled: true, suggestions: ['How do I book?'] });
  });
});

describe('MCP', () => {
  async function connect(path: string, opts: { headers?: Record<string, string>; fetch?: typeof fetch; tools?: 'per-operation' | 'search-execute'; access?: AccessManifest } = {}) {
    const m = await manifest();
    m.ai.mcp.tools = opts.tools ?? 'per-operation';
    const ai = createAi({ manifest: m, access: opts.access ?? access, env: {}, fetch: opts.fetch });
    const client = new Client({ name: 'test', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(`https://docs.travel.test/docs${path}`), {
      requestInit: { headers: opts.headers },
      fetch: async (input, init) => (await ai.handle(new Request(input, init))) ?? new Response('not handled', { status: 404 }),
    });
    await client.connect(transport);
    return client;
  }

  it('docs MCP searches and reads public pages only', async () => {
    const client = await connect('/mcp');
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['search_docs', 'read_page', 'list_pages']);
    const found = (await client.callTool({ name: 'search_docs', arguments: { query: 'verify signature' } })) as { content: Array<{ text: string }> };
    expect(found.content[0]!.text).toContain('https://docs.travel.test/docs/webhooks');
    const page = (await client.callTool({ name: 'read_page', arguments: { url: 'https://docs.travel.test/docs/quickstart/' } })) as { content: Array<{ text: string }> };
    expect(page.content[0]!.text).toContain('# Quickstart');
    const hidden = (await client.callTool({ name: 'read_page', arguments: { url: '/internal/runbook' } })) as { isError?: boolean };
    expect(hidden.isError).toBe(true);
    await client.close();
  });

  it('API MCP calls the API with the client credentials', async () => {
    const calls: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];
    const fakeApi: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), method: init!.method!, headers: new Headers(init!.headers), body: init!.body as string | undefined });
      return Response.json({ id: 'bk_1', status: 'pending' }, { status: 201 });
    };
    const client = await connect('/mcp/travel', { headers: { 'X-Api-Key': 'secret-123' }, fetch: fakeApi });
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name)).toEqual(['create_booking', 'get_a_booking']);
    expect(tools[1]!.annotations?.readOnlyHint).toBe(true);
    const res = (await client.callTool({ name: 'create_booking', arguments: { body: { flightId: 'f1', passengers: [{ name: 'Ada' }] } } })) as { content: Array<{ text: string }>; isError?: boolean };
    expect(res.isError).toBe(false);
    expect(res.content[0]!.text).toContain('201');
    expect(calls[0]).toMatchObject({ url: 'https://api.travel.test/v1/bookings', method: 'POST', body: '{"flightId":"f1","passengers":[{"name":"Ada"}]}' });
    expect(calls[0]!.headers.get('x-api-key')).toBe('secret-123');
    await client.callTool({ name: 'get_a_booking', arguments: { id: 'bk 1', expand: 'flight' } });
    expect(calls[1]!.url).toBe('https://api.travel.test/v1/bookings/bk%201?expand=flight');
    await client.close();
  });

  it('API MCP leaves out operations gated by their own access rule', async () => {
    const gated = { ...access, rules: [...access.rules, { pattern: '/reference/travel/createbooking', groups: ['staff'] }] };
    const client = await connect('/mcp/travel', { access: gated, fetch: async () => Response.json({ ok: true }) });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['get_a_booking']);
    await client.close();
  });

  it('search-execute mode exposes two tools', async () => {
    const client = await connect('/mcp/travel', { tools: 'search-execute', fetch: async () => Response.json({ ok: true }) });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['search_operations', 'call_operation']);
    const found = (await client.callTool({ name: 'search_operations', arguments: { query: 'get booking' } })) as { content: Array<{ text: string }> };
    expect(found.content[0]!.text).toContain('### get_a_booking');
    const called = (await client.callTool({ name: 'call_operation', arguments: { operation: 'get_a_booking', arguments: { id: 'x' } } })) as { isError?: boolean };
    expect(called.isError).toBe(false);
    await client.close();
  });
});
