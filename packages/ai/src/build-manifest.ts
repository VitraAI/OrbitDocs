import { deref, operationMarkdown, type OperationModel, type ReferenceModel, type Schema } from '@vitra-ai/orbitdocs-openapi';

import type { AiApi, AiManifest, AiOperation, AiPage, AiSettings } from './manifest';

/** Replaces `$ref`s with the schemas they point to, so a tool's input schema stands alone. */
export function inlineRefs(schema: unknown, schemas: Record<string, Schema>, depth = 0): unknown {
  if (Array.isArray(schema)) return schema.map((s) => inlineRefs(s, schemas, depth));
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as Schema & Record<string, unknown>;
  if (s.$ref) return depth > 6 ? { type: 'object' } : inlineRefs(deref(s, schemas), schemas, depth + 1);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'example' || k === 'examples' || k.startsWith('x-')) continue;
    out[k] = inlineRefs(v, schemas, depth);
  }
  return out;
}

/** `create-a-booking` → `create_a_booking`, unique and at most 64 characters. */
export function toolName(slug: string, taken: Set<string>): string {
  const base = slug.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 60) || 'operation';
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 60)}_${i}`;
  taken.add(name);
  return name;
}

function toOperation(op: OperationModel, model: ReferenceModel, taken: Set<string>): AiOperation {
  const params = op.parameters
    .filter((p) => p.in === 'path' || p.in === 'query' || p.in === 'header')
    .map((p) => ({ name: p.name, in: p.in as 'path' | 'query' | 'header', required: p.required || p.in === 'path', description: p.description, schema: inlineRefs(p.schema, model.schemas) }));
  const content = op.requestBody?.content[0];
  const body = content ? { mediaType: content.mediaType, required: op.requestBody!.required, schema: inlineRefs(content.schema, model.schemas) } : undefined;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = { ...((p.schema as object) ?? { type: 'string' }), ...(p.description ? { description: p.description } : {}) };
    if (p.required) required.push(p.name);
  }
  if (body) {
    properties.body = { ...((body.schema as object) ?? { type: 'object' }), description: op.requestBody?.description ?? `Request body (${body.mediaType})` };
    if (body.required) required.push('body');
  }
  return {
    slug: op.slug,
    // operationIds read best as tool names (createBooking → create_booking); else the URL slug.
    tool: toolName(op.operationId ? op.operationId.replace(/([a-z0-9])([A-Z])/g, '$1_$2') : op.slug, taken),
    method: op.method,
    path: op.path,
    title: op.summary,
    description: op.description,
    params,
    body,
    inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}) },
  };
}

/** Header names that carry credentials, from the API's security schemes. */
export function credentialHeaders(model: ReferenceModel): string[] {
  const names = new Set<string>();
  for (const raw of Object.values(model.securitySchemes)) {
    const s = raw as { type?: string; in?: string; name?: string };
    if (s.type === 'apiKey' && s.in === 'header' && s.name) names.add(s.name.toLowerCase());
    if (s.type === 'apiKey' && s.in === 'cookie') names.add('cookie');
    if (s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect') names.add('authorization');
  }
  return [...names];
}

export interface AiManifestInput {
  site: { title: string; url?: string };
  output: { basePath: string };
  ai: AiSettings;
  /** Guides: URL (without base path), title, description and Markdown body. */
  guides: Array<{ url: string; title: string; description?: string; markdown: string }>;
  apis: Array<{ id: string; route: string; model: ReferenceModel }>;
}

/** Builds `.orbitdocs/ai.json` from the guides and the extracted specs. */
export function buildAiManifest(input: AiManifestInput): AiManifest {
  const pages: AiPage[] = input.guides.map((g) => ({ ...g, kind: 'guide' }));
  const apis: AiApi[] = [];
  for (const { id, route, model } of input.apis) {
    for (const op of model.operations) {
      pages.push({ url: `${route}/${op.slug}`, title: op.summary, description: op.description?.split('\n')[0], kind: 'operation', api: id, markdown: operationMarkdown(op, model) });
    }
    const taken = new Set<string>();
    const server = model.servers[0];
    let serverUrl = server?.url;
    for (const [k, v] of Object.entries(server?.variables ?? {})) serverUrl = serverUrl?.replace(`{${k}}`, v.default);
    apis.push({
      id,
      title: model.title,
      description: model.description?.split('\n')[0],
      serverUrl: serverUrl && /^https?:\/\//.test(serverUrl) ? serverUrl : serverUrl && input.site.url ? new URL(serverUrl, input.site.url).href : undefined,
      credentialHeaders: credentialHeaders(model),
      operations: model.operations.map((op) => toOperation(op, model, taken)),
    });
  }
  return { version: 1, basePath: input.output.basePath, site: input.site, ai: input.ai, pages, apis };
}
