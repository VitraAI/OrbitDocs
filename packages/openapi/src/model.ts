import { mediaExample, schemaExample } from './example';
import { ORDER_EXTENSION, STABILITY_EXTENSION, type Stability } from './marker';
import { slugify, uniqueSlug } from './slug';
import {
  type Document,
  type Header,
  type HttpMethod,
  type Json,
  operations,
  type Operation,
  type Parameter,
  type RequestBody,
  type Response,
  type Schema,
  type SecurityRequirement,
  type Server,
} from './types';

export interface ContentModel {
  mediaType: string;
  schema?: Schema;
  /** Explicit or generated example. */
  example?: unknown;
  /** Named examples, when the spec gives several. */
  examples?: Array<{ name: string; summary?: string; value: unknown }>;
}

export interface ParameterModel {
  name: string;
  in: string;
  description?: string;
  required: boolean;
  deprecated: boolean;
  schema?: Schema;
  example?: unknown;
}

export interface ResponseModel {
  status: string;
  description: string;
  headers: Array<{ name: string; description?: string; schema?: Schema }>;
  content: ContentModel[];
}

export interface OperationModel {
  /** URL slug, unique within the API (`create-a-booking`). */
  slug: string;
  operationId?: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  deprecated: boolean;
  stability?: Stability;
  group?: string;
  parameters: ParameterModel[];
  requestBody?: { description?: string; required: boolean; content: ContentModel[] };
  responses: ResponseModel[];
  /** Effective security requirements (operation's own, else the document's). */
  security: SecurityRequirement[];
  /** Every `x-` key on the operation. */
  extensions: Json;
}

export interface GroupModel {
  /** Tag name; undefined for operations without a tag. */
  name?: string;
  slug: string;
  description?: string;
  operations: OperationModel[];
}

export interface ReferenceModel {
  id: string;
  title: string;
  version: string;
  description?: string;
  servers: Server[];
  securitySchemes: Record<string, Json>;
  groups: GroupModel[];
  operations: OperationModel[];
  /** Named schemas, for the Models section and `$ref` resolution. */
  schemas: Record<string, Schema>;
  /** Download name for the raw spec. */
  openapi: string;
}

function resolveComponent<T extends { $ref?: string }>(
  value: T | undefined,
  doc: Document,
  kind: 'parameters' | 'responses' | 'requestBodies',
): T | undefined {
  let current = value;
  for (let i = 0; current?.$ref && i < 16; i++) {
    const prefix = `#/components/${kind}/`;
    if (!current.$ref.startsWith(prefix)) break;
    current = (doc.components?.[kind] as Record<string, T> | undefined)?.[current.$ref.slice(prefix.length)];
  }
  return current;
}

function contents(
  content: Record<string, { schema?: Schema; example?: unknown; examples?: Record<string, { value?: unknown; summary?: string }> }> | undefined,
  schemas: Record<string, Schema>,
  direction: 'request' | 'response',
): ContentModel[] {
  return Object.entries(content ?? {}).map(([mediaType, media]) => ({
    mediaType,
    schema: media.schema,
    example: mediaExample(media, schemas, { direction }),
    ...(media.examples
      ? {
          examples: Object.entries(media.examples).map(([name, ex]) => ({
            name,
            summary: ex.summary,
            value: ex.value,
          })),
        }
      : {}),
  }));
}

/**
 * The shape the reference renderer draws: operations grouped by tag in the
 * document's tag order, sorted by `x-orbitdocs-order`, with $refs on
 * parameters/bodies/responses resolved and examples filled in.
 */
export function buildReferenceModel(doc: Document, id: string): ReferenceModel {
  const schemas = doc.components?.schemas ?? {};
  const used = new Set<string>();
  const ops: OperationModel[] = [];

  for (const [path, method, op, item] of operations(doc)) {
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])]
      .map((p) => resolveComponent<Parameter>(p, doc, 'parameters'))
      .filter((p): p is Parameter => Boolean(p));
    // Operation-level parameters override path-level ones with the same name+in.
    const byKey = new Map(params.map((p) => [`${p.in}:${p.name}`, p] as const));
    const body = resolveComponent<RequestBody>(op.requestBody, doc, 'requestBodies');

    ops.push({
      slug: uniqueSlug(op.operationId ?? op.summary ?? `${method} ${path}`, used),
      operationId: op.operationId,
      method,
      path,
      summary: op.summary ?? op.operationId ?? `${method.toUpperCase()} ${path}`,
      description: op.description,
      deprecated: Boolean(op.deprecated),
      stability: op[STABILITY_EXTENSION] as Stability | undefined,
      group: op.tags?.[0],
      parameters: [...byKey.values()].map((p) => ({
        name: p.name,
        in: p.in,
        description: p.description,
        required: Boolean(p.required) || p.in === 'path',
        deprecated: Boolean(p.deprecated),
        schema: p.schema,
        example: p.example ?? (p.examples ? Object.values(p.examples)[0]?.value : undefined) ?? schemaExample(p.schema),
      })),
      ...(body
        ? {
            requestBody: {
              description: body.description,
              required: Boolean(body.required),
              content: contents(body.content, schemas, 'request'),
            },
          }
        : {}),
      responses: Object.entries(op.responses ?? {}).map(([status, raw]) => {
        const r = resolveComponent<Response>(raw, doc, 'responses') ?? {};
        return {
          status,
          description: r.description ?? '',
          headers: Object.entries((r.headers ?? {}) as Record<string, Header>).map(([name, h]) => ({
            name,
            description: h.description,
            schema: h.schema,
          })),
          content: contents(r.content, schemas, 'response'),
        };
      }),
      security: op.security ?? doc.security ?? [],
      extensions: Object.fromEntries(Object.entries(op).filter(([k]) => k.startsWith('x-'))),
    });
  }

  const order = (o: OperationModel) => (o.extensions[ORDER_EXTENSION] as number | undefined) ?? Number.MAX_SAFE_INTEGER;
  const tagOrder = (doc.tags ?? []).map((t) => t.name);
  const groupNames: Array<string | undefined> = [];
  for (const o of ops) if (!groupNames.includes(o.group)) groupNames.push(o.group);
  // Untagged first, then the document's tag order, then tags it never declared (as they appear).
  const rank = (name: string | undefined) => {
    if (name === undefined) return -1;
    const declared = tagOrder.indexOf(name);
    return declared === -1 ? tagOrder.length + groupNames.indexOf(name) : declared;
  };
  // Array#sort always moves `undefined` entries last without asking the comparator, so sort wrappers.
  const sortedNames = groupNames
    .map((name) => ({ name }))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((g) => g.name);
  const usedGroupSlugs = new Set<string>();
  const groups: GroupModel[] = sortedNames.map((name) => ({
    name,
    slug: uniqueSlug(name ? `tag-${slugify(name)}` : 'endpoints', usedGroupSlugs),
    description: doc.tags?.find((t) => t.name === name)?.description,
    operations: ops
      .filter((o) => o.group === name)
      .map((o, i) => [o, i] as const)
      .sort(([a, ia], [b, ib]) => order(a) - order(b) || ia - ib)
      .map(([o]) => o),
  }));

  return {
    id,
    title: doc.info.title,
    version: doc.info.version,
    description: doc.info.description,
    servers: doc.servers ?? [],
    securitySchemes: (doc.components?.securitySchemes ?? {}) as Record<string, Json>,
    groups,
    operations: groups.flatMap((g) => g.operations),
    schemas,
    openapi: `${id}.json`,
  };
}

export type { Operation };
