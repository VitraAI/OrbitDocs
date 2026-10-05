import { isBinarySchema } from './example';
import { deref, refName } from './refs';
import type { Schema } from './types';

/** Short type label as Scalar shows it: `string · email`, `integer · int64`, `Booking[]`. */
export function typeLabel(schema: Schema | undefined, schemas: Record<string, Schema>): string {
  if (!schema) return 'any';
  const ref = refName(schema.$ref);
  const s = deref(schema, schemas);
  const variants = s.oneOf ?? s.anyOf;
  if (variants?.length) return variants.map((v) => typeLabel(v, schemas)).join(' | ');
  if (s.allOf?.length === 1) return typeLabel(s.allOf[0], schemas);
  const types = (Array.isArray(s.type) ? s.type : s.type ? [s.type] : []).filter((t) => t !== 'null');
  const nullable = s.nullable || (Array.isArray(s.type) && s.type.includes('null'));
  let label: string;
  if (types[0] === 'array' || s.items) {
    label = `${typeLabel(s.items, schemas)}[]`;
  } else if (ref && (s.properties || s.allOf)) {
    label = ref;
  } else if (isBinarySchema(s)) {
    // 3.0 `format: binary` and its 3.1 upgrade (`contentMediaType`) read the same.
    label = 'string · binary';
  } else if (types.length) {
    label = types.join(' | ');
    if (s.format) label += ` · ${s.format}`;
    else if (s.contentEncoding) label += ` · ${s.contentEncoding}`;
  } else if (s.properties) {
    label = 'object';
  } else if (ref) {
    label = ref;
  } else {
    label = 'any';
  }
  return nullable ? `${label} | null` : label;
}

/** Child properties to list under a field (object, array of objects, allOf), or undefined for leaves. */
export function childSchema(schema: Schema | undefined, schemas: Record<string, Schema>): Schema | undefined {
  if (!schema) return undefined;
  const s = deref(schema, schemas);
  if (s.properties && Object.keys(s.properties).length) return s;
  if (s.allOf?.length) {
    const merged: Schema = { type: 'object', properties: {}, required: [] };
    for (const part of s.allOf) {
      const p = deref(part, schemas);
      Object.assign(merged.properties!, p.properties ?? {});
      merged.required!.push(...(p.required ?? []));
    }
    return Object.keys(merged.properties!).length ? merged : undefined;
  }
  if (s.items) return childSchema(s.items, schemas);
  return undefined;
}

/** Enum values of a field (looks through arrays). */
export function enumValues(schema: Schema | undefined, schemas: Record<string, Schema>): unknown[] | undefined {
  const s = deref(schema, schemas);
  return s.enum ?? (s.items ? deref(s.items, schemas).enum : undefined);
}
