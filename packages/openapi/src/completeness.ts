import type { Document } from './types';

/**
 * What every documented operation should carry, so a developer can call it
 * from the docs alone:
 *
 * - the operation has a description;
 * - every parameter has a description, and an example unless its values are
 *   an enum, a default or a boolean;
 * - every JSON request-body property has a description, and every leaf one an
 *   example on the same terms;
 * - every success response other than 204 has a JSON schema, and every
 *   property in it a description, and every leaf one an example (so no
 *   sample in the docs shows a placeholder like "string");
 * - every response has a description.
 */

type Schema = {
  $ref?: string;
  type?: string;
  description?: string;
  example?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
};

type Operation = {
  description?: string;
  parameters?: Array<{
    name: string;
    in: string;
    description?: string;
    example?: unknown;
    schema?: Schema;
  }>;
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, { schema?: Schema }> }
  >;
};

const HTTP = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace']);

const hasShape = (s: Schema) =>
  Boolean(s.properties || s.allOf?.length || s.oneOf?.length);

const exampleless = (s: Schema) =>
  s.example !== undefined ||
  (Array.isArray(s.examples) && s.examples.length > 0) ||
  s.enum !== undefined ||
  s.default !== undefined ||
  s.type === 'boolean' ||
  // A file field (multipart upload or download) has no meaningful example.
  (s as { format?: string }).format === 'binary';

export function findDocumentationGaps(document: Document): string[] {
  const schemas = (document.components?.schemas ?? {}) as Record<
    string,
    Schema
  >;
  const deref = (s: Schema | undefined): Schema => {
    let current = s ?? {};
    for (let i = 0; current.$ref && i < 20; i++)
      current = schemas[current.$ref.split('/').pop()!] ?? {};
    return current;
  };

  const gaps: string[] = [];

  /**
   * Walks an object schema's properties; `examples` = also require examples on
   * leaves. `prefix` is the path so far (`body`, `200`, `body.passengers[]`):
   * properties join with `.`, array items append `[]` to their property.
   */
  const walk = (
    where: string,
    schema: Schema | undefined,
    prefix: string,
    examples: boolean,
    seen: Set<string>,
  ) => {
    const s = deref(schema);
    for (const part of [...(s.allOf ?? []), ...(s.oneOf ?? [])])
      walk(where, part, prefix, examples, seen);
    if (s.items) return walk(where, s.items, `${prefix}[]`, examples, seen);
    for (const [name, raw] of Object.entries(s.properties ?? {})) {
      const key = `${prefix}.${name}`;
      const resolved = deref(raw);
      const item = deref(resolved.items);
      if (!raw.description && !resolved.description)
        gaps.push(`${where}: ${key} has no description`);
      // Nest wraps a described object reference in `allOf`.
      const nested = hasShape(resolved) || hasShape(item);
      if (
        examples &&
        !nested &&
        !exampleless(raw) &&
        !exampleless(resolved) &&
        !exampleless(item)
      )
        gaps.push(`${where}: ${key} has no example`);
      const ref = raw.$ref ?? raw.items?.$ref ?? raw.allOf?.[0]?.$ref;
      if (ref && seen.has(ref)) continue;
      if (nested)
        walk(where, raw, key, examples, new Set([...seen, ref ?? '']));
    }
  };

  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, Operation>)) {
      if (!HTTP.has(method)) continue;
      const where = `${method.toUpperCase()} ${path}`;
      if (!op.description) gaps.push(`${where}: no description`);
      for (const p of op.parameters ?? []) {
        if (!p.description)
          gaps.push(
            `${where}: ${p.in} parameter "${p.name}" has no description`,
          );
        if (
          p.in !== 'header' &&
          p.example === undefined &&
          !exampleless(deref(p.schema))
        )
          gaps.push(`${where}: ${p.in} parameter "${p.name}" has no example`);
      }
      walk(
        where,
        op.requestBody?.content?.['application/json']?.schema,
        'body',
        true,
        new Set(),
      );
      for (const [code, response] of Object.entries(op.responses ?? {})) {
        if (!response.description)
          gaps.push(`${where}: ${code} response has no description`);
        if (!code.startsWith('2') || code === '204') continue;
        const schema = response.content?.['application/json']?.schema;
        // A file download (PDF, CSV, ZIP, image…) documents its media type and a binary schema.
        const file = Object.entries(response.content ?? {}).some(([type, media]) => type !== 'application/json' && media?.schema);
        // A DELETE that answers with an empty body is normal; anything else should say what it returns.
        if (!schema && !file && method !== 'delete') gaps.push(`${where}: ${code} response has no schema`);
        else if (schema) walk(where, schema, code, true, new Set());
      }
    }
  }
  return gaps;
}
