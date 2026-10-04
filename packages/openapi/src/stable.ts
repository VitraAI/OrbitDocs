/** JSON with object keys in a stable order (paths and schemas sorted; everything else as written). */
export function stableStringify(doc: unknown): string {
  return `${JSON.stringify(sortTopLevel(doc), null, 2)}\n`;
}

function sortObject<T extends Record<string, unknown>>(obj: T | undefined): T | undefined {
  if (!obj) return obj;
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;
}

function sortTopLevel(doc: unknown): unknown {
  if (!doc || typeof doc !== 'object') return doc;
  const d = { ...(doc as Record<string, unknown>) };
  if (d.paths && typeof d.paths === 'object') d.paths = sortObject(d.paths as Record<string, unknown>);
  const components = d.components as Record<string, Record<string, unknown>> | undefined;
  if (components) {
    d.components = Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, sortObject(v)]),
    );
  }
  return d;
}
