import { deref, type Schema, schemaExample } from '@orbitdocs/openapi';

import { markdown } from './markdown';
import { childSchema, enumValues, typeLabel } from './schema';

/**
 * Schema fields as plain HTML strings. Operations are shipped as data (the
 * page's own operation in the RSC payload, the others in lazily loaded JSON)
 * and rendered by one client component, so the static parts are HTML.
 * Attributes use single quotes: the HTML travels inside JSON, where double
 * quotes would be escaped.
 */

export const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const show = (v: unknown) => (typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v)));
const code = (v: unknown) => `<code>${esc(show(v))}</code>`;
const meta = (label: string, value: unknown) =>
  `<span><span class='od-muted'>${label}:</span> ${code(value)}</span>`;

export interface FieldOptions {
  name: string;
  schema?: Schema;
  required?: boolean;
  description?: string;
  deprecated?: boolean;
  example?: unknown;
  schemas: Record<string, Schema>;
  depth?: number;
  /** `request` hides readOnly fields, `response` hides writeOnly ones. */
  direction?: 'request' | 'response';
}

/** One field row, Scalar-style: name · type · flags, description, enum, children. */
export function fieldHtml({
  name,
  schema,
  required,
  description,
  deprecated,
  example,
  schemas,
  depth = 0,
  direction,
}: FieldOptions): string {
  const s = deref(schema, schemas);
  const text = description ?? schema?.description ?? s.description;
  const values = enumValues(schema, schemas);
  const children = depth < 6 ? childSchema(schema, schemas) : undefined;
  const ex = example ?? schemaExample(s);
  const isDeprecated = Boolean(deprecated || s.deprecated);
  let out = `<div class='od-field-row'${isDeprecated ? " data-deprecated='true'" : ''}><div class='od-field-head'>`;
  out += `<span class='od-field-name'>${esc(name)}</span><span class='od-field-type'>${esc(typeLabel(schema, schemas))}</span>`;
  if (s.readOnly) out += "<span class='od-flag od-flag-read'>read-only</span>";
  if (s.writeOnly) out += "<span class='od-flag od-flag-write'>write-only</span>";
  if (required) out += "<span class='od-flag od-flag-required'>required</span>";
  if (isDeprecated) out += "<span class='od-flag od-flag-deprecated'>deprecated</span>";
  out += '</div>';
  if (text) out += `<div class='od-prose od-field-description'>${markdown(text)}</div>`;
  if (values?.length)
    out += `<div class='od-field-meta'><span class='od-muted'>Enum values:</span>${values.map(code).join('')}</div>`;
  const metas: string[] = [];
  if (s.default !== undefined) metas.push(meta('Default', s.default));
  if (ex !== undefined && !children) metas.push(meta('Example', ex));
  if (s.minimum !== undefined) metas.push(meta('Min', s.minimum));
  if (s.maximum !== undefined) metas.push(meta('Max', s.maximum));
  if (s.pattern) metas.push(meta('Pattern', s.pattern));
  if (metas.length) out += `<div class='od-field-meta'>${metas.join('')}</div>`;
  if (children) {
    out += `<details class='od-children'><summary>Show child attributes</summary>${schemaFieldsHtml({ schema: children, schemas, depth: depth + 1, direction })}</details>`;
  }
  return `${out}</div>`;
}

/** Every property of an object schema (or of its array items). */
export function schemaFieldsHtml({
  schema,
  schemas,
  depth = 0,
  direction,
}: {
  schema?: Schema;
  schemas: Record<string, Schema>;
  depth?: number;
  direction?: 'request' | 'response';
}): string {
  const obj = childSchema(schema, schemas);
  if (!obj) return schema ? fieldHtml({ name: 'body', schema, schemas, depth, direction }) : '';
  const entries = Object.entries(obj.properties ?? {}).filter(([, p]) => {
    const r = deref(p, schemas);
    return !(direction === 'request' && r.readOnly) && !(direction === 'response' && r.writeOnly);
  });
  // Required first, as Scalar does.
  entries.sort(([a], [b]) => Number(obj.required?.includes(b)) - Number(obj.required?.includes(a)));
  const rows = entries.map(([name, prop]) =>
    fieldHtml({
      name,
      schema: prop,
      required: obj.required?.includes(name),
      schemas,
      depth,
      direction,
    }),
  );
  return `<div class='od-fields'>${rows.join('')}</div>`;
}
