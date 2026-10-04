import type { OperationModel, ReferenceModel } from './model';
import { referencedSchemas } from './refs';
import { type Document, HTTP_METHODS, type Json, operations } from './types';

/** Component kinds a `$ref` can point to (security schemes are referenced by name, not `$ref`). */
const COMPONENT_REF = /^#\/components\/([^/]+)\/(.+)$/;

/** Every `#/components/<kind>/<name>` reachable from `node`, transitively. */
function referencedComponents(node: unknown, components: Record<string, Record<string, unknown>>, seen = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) referencedComponents(item, components, seen);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const m = k === '$ref' && typeof v === 'string' ? COMPONENT_REF.exec(v) : null;
      if (m) {
        const key = `${m[1]}/${decodeURIComponent(m[2]!)}`;
        if (!seen.has(key)) {
          seen.add(key);
          referencedComponents(components[m[1]!]?.[decodeURIComponent(m[2]!)], components, seen);
        }
      } else if (k !== '$ref') {
        referencedComponents(v, components, seen);
      }
    }
  }
  return seen;
}

/**
 * The reference model with only the operations `keep` accepts: empty groups
 * go, and so do the named schemas only removed operations use (their names
 * and fields would otherwise show under Models). Schemas no operation uses
 * stay, as in the full model.
 */
export function pruneModel(model: ReferenceModel, keep: (op: OperationModel) => boolean): ReferenceModel {
  const operations = model.operations.filter(keep);
  if (operations.length === model.operations.length) return model;
  const all = referencedSchemas(model.operations, model.schemas);
  const kept = referencedSchemas(operations, model.schemas);
  const schemas = Object.fromEntries(Object.entries(model.schemas).filter(([name]) => !all.has(name) || kept.has(name)));
  const ids = new Set(operations.map((o) => o.slug));
  const groups = model.groups.map((g) => ({ ...g, operations: g.operations.filter((o) => ids.has(o.slug)) })).filter((g) => g.operations.length);
  return { ...model, operations, groups, schemas };
}

/**
 * A copy of the document with only the operations `keep` accepts (by method
 * and path): path items left empty go, and so do the components and tags only
 * removed operations use. Everything else is unchanged.
 */
export function pruneDocument(doc: Document, keep: (method: string, path: string) => boolean): Document {
  const removed: unknown[] = [];
  const kept: unknown[] = [];
  for (const [path, method, op, item] of operations(doc)) {
    (keep(method, path) ? kept : removed).push(op, item.parameters ?? []);
  }
  if (!removed.length) return doc;
  const out = structuredClone(doc) as Document;
  for (const [path, item] of Object.entries(out.paths ?? {})) {
    for (const method of HTTP_METHODS) if (item[method] && !keep(method, path)) delete item[method];
    if (!HTTP_METHODS.some((m) => item[m])) delete out.paths[path];
  }
  const components = (doc.components ?? {}) as Record<string, Record<string, unknown>>;
  const usedByKept = referencedComponents([...kept, doc.webhooks ?? {}], components);
  const usedByRemoved = referencedComponents(removed, components);
  for (const key of usedByRemoved) {
    if (usedByKept.has(key)) continue;
    const [kind, ...rest] = key.split('/');
    const bucket = (out.components as Record<string, Record<string, unknown>> | undefined)?.[kind!];
    if (bucket && kind !== 'securitySchemes') delete bucket[rest.join('/')];
  }
  const tagsKept = new Set(kept.flatMap((x) => ((x as { tags?: string[] }).tags ?? [])));
  const tagsRemoved = new Set(removed.flatMap((x) => ((x as { tags?: string[] }).tags ?? [])));
  if (out.tags) out.tags = out.tags.filter((t) => tagsKept.has(t.name) || !tagsRemoved.has(t.name));
  return out as Document & Json;
}
