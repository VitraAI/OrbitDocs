/**
 * Loose OpenAPI 3.x shapes: enough structure to work with, without fighting
 * the full spec types. Unknown keys (extensions) pass through.
 */
export type Json = Record<string, unknown>;

export interface Schema extends Json {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
}

export interface Parameter extends Json {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie' | string;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, { value?: unknown; summary?: string }>;
  $ref?: string;
}

export interface MediaType extends Json {
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, { value?: unknown; summary?: string; description?: string }>;
}

export interface RequestBody extends Json {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaType>;
  $ref?: string;
}

export interface Header extends Json {
  description?: string;
  schema?: Schema;
}

export interface Response extends Json {
  description?: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
  $ref?: string;
}

export type SecurityRequirement = Record<string, string[]>;

export interface Operation extends Json {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: SecurityRequirement[];
}

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type PathItem = Partial<Record<HttpMethod, Operation>> & {
  parameters?: Parameter[];
  summary?: string;
  description?: string;
} & Json;

export interface Tag extends Json {
  name: string;
  description?: string;
}

export interface Server extends Json {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

export interface Document extends Json {
  openapi: string;
  info: { title: string; version: string; description?: string } & Json;
  servers?: Server[];
  tags?: Tag[];
  paths: Record<string, PathItem>;
  webhooks?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    securitySchemes?: Record<string, Json>;
    parameters?: Record<string, Parameter>;
    responses?: Record<string, Response>;
    requestBodies?: Record<string, RequestBody>;
  } & Json;
  security?: SecurityRequirement[];
}

/** Every [path, method, operation] in document order. */
export function* operations(
  doc: Pick<Document, 'paths'>,
): Generator<[path: string, method: HttpMethod, op: Operation, item: PathItem]> {
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item?.[method];
      if (op) yield [path, method, op, item];
    }
  }
}
