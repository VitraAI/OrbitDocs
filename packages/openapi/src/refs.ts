import type { Schema } from './types';

const SCHEMA_PREFIX = '#/components/schemas/';

/** Name of a `#/components/schemas/X` reference, or undefined. */
export function refName(ref: string | undefined): string | undefined {
  return ref?.startsWith(SCHEMA_PREFIX) ? decodeURIComponent(ref.slice(SCHEMA_PREFIX.length)) : undefined;
}

export const schemaRef = (name: string) => ({ $ref: `${SCHEMA_PREFIX}${name}` });

/** Every schema name reachable from `node`, transitively through `schemas`. */
export function referencedSchemas(
  node: unknown,
  schemas: Record<string, unknown>,
  seen = new Set<string>(),
): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) referencedSchemas(item, schemas, seen);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const name = k === '$ref' && typeof v === 'string' ? refName(v) : undefined;
      if (name !== undefined) {
        if (!seen.has(name)) {
          seen.add(name);
          referencedSchemas(schemas[name], schemas, seen);
        }
      } else if (k !== '$ref') {
        referencedSchemas(v, schemas, seen);
      }
    }
  }
  return seen;
}

/** Follows `$ref` chains to a concrete schema (cycle-safe). */
export function deref(schema: Schema | undefined, schemas: Record<string, Schema>): Schema {
  let current: Schema = schema ?? {};
  for (let i = 0; current.$ref && i < 32; i++) {
    const name = refName(current.$ref);
    if (name === undefined) break;
    const next = schemas[name];
    if (!next) break;
    current = { ...next, ...stripRef(current) };
  }
  return current;
}

/** Sibling keys next to a `$ref` (OpenAPI 3.1 allows description etc. beside it). */
function stripRef(s: Schema): Schema {
  const { $ref: _ref, ...rest } = s;
  return rest;
}
