import type { Schema } from '@orbitdocs/openapi';

import { type FieldOptions, fieldHtml, schemaFieldsHtml } from './server/fields';

// The markup is built as HTML (server/fields.ts) so operations can also ship
// as data; these wrappers keep the React components for direct use.

/** One field row, Scalar-style: name · type · flags, description, enum, children. */
export function Field(props: FieldOptions) {
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: fieldHtml(props) }} />;
}

/** Every property of an object schema (or of its array items). */
export function SchemaFields(props: { schema?: Schema; schemas: Record<string, Schema>; depth?: number; direction?: 'request' | 'response' }) {
  const html = schemaFieldsHtml(props);
  return html ? <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} /> : null;
}
