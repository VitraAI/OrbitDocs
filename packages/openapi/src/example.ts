import { deref } from './refs';
import type { MediaType, Schema } from './types';

const FORMAT_EXAMPLES: Record<string, unknown> = {
  'date-time': '2026-01-15T09:30:00Z',
  date: '2026-01-15',
  time: '09:30:00',
  email: 'ada@example.com',
  uri: 'https://example.com',
  url: 'https://example.com',
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  binary: '<binary>',
  byte: 'U3dhZ2dlciByb2Nrcw==',
  password: '********',
};

export interface ExampleOptions {
  /** `request` skips readOnly properties, `response` skips writeOnly ones. */
  direction?: 'request' | 'response';
  /** Include optional properties (default true). */
  optional?: boolean;
}

/**
 * A plausible example value for `schema`: its own example, default, const or
 * first enum value; otherwise built from type and format. Cycle-safe.
 */
export function exampleFor(
  schema: Schema | undefined,
  schemas: Record<string, Schema>,
  options: ExampleOptions = {},
  depth = 0,
  seen: ReadonlySet<string> = new Set(),
): unknown {
  if (!schema) return undefined;
  if (schema.$ref) {
    if (seen.has(schema.$ref) || depth > 8) return {};
    return exampleFor(deref(schema, schemas), schemas, options, depth + 1, new Set([...seen, schema.$ref]));
  }
  const s = schema;
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (s.const !== undefined) return s.const;
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  if (s.allOf?.length) {
    return s.allOf.reduce<unknown>((acc, part) => {
      const v = exampleFor(part, schemas, options, depth + 1, seen);
      return isObject(acc) && isObject(v) ? { ...acc, ...v } : (v ?? acc);
    }, undefined);
  }
  const variant = s.oneOf?.[0] ?? s.anyOf?.[0];
  if (variant) return exampleFor(variant, schemas, options, depth + 1, seen);

  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  switch (type ?? (s.properties ? 'object' : s.items ? 'array' : undefined)) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [name, prop] of Object.entries(s.properties ?? {})) {
        const p = deref(prop, schemas);
        if (options.direction === 'request' && p.readOnly) continue;
        if (options.direction === 'response' && p.writeOnly) continue;
        if (options.optional === false && !s.required?.includes(name)) continue;
        out[name] = exampleFor(prop, schemas, options, depth + 1, seen);
      }
      if (!s.properties && isObject(s.additionalProperties)) {
        out.key = exampleFor(s.additionalProperties, schemas, options, depth + 1, seen);
      }
      return out;
    }
    case 'array':
      return depth > 8 ? [] : [exampleFor(s.items, schemas, options, depth + 1, seen)];
    case 'integer':
      return s.minimum ?? 1;
    case 'number':
      return s.minimum ?? 1.5;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'string':
      return (s.format && FORMAT_EXAMPLES[s.format]) ?? 'string';
    default:
      return undefined;
  }
}

/** The example of a media type: explicit example, first named example, or one built from its schema. */
export function mediaExample(
  media: MediaType | undefined,
  schemas: Record<string, Schema>,
  options: ExampleOptions = {},
): unknown {
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const first = media.examples && Object.values(media.examples)[0];
  if (first && 'value' in first) return first.value;
  return exampleFor(media.schema, schemas, options);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A schema's own example: `example` (OpenAPI 3.0) or the first of `examples` (3.1 / JSON Schema). */
export function schemaExample(schema: Schema | undefined): unknown {
  if (!schema) return undefined;
  if (schema.example !== undefined) return schema.example;
  return Array.isArray(schema.examples) ? schema.examples[0] : undefined;
}
