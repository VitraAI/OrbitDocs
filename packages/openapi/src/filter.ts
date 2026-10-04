import {
  HANDLER_EXTENSION,
  ORBIT_EXTENSION,
  ORDER_EXTENSION,
  type OrbitMarker,
  STABILITY_EXTENSION,
} from './marker';
import { referencedSchemas } from './refs';
import { uniqueSlug } from './slug';
import { applyStandardResponses, STANDARD_ERROR_SCHEMAS } from './standard-responses';
import {
  type Document,
  type Json,
  operations,
  type Operation,
  type Parameter,
  type PathItem,
  type Schema,
  type SecurityRequirement,
  type Server,
  type Tag,
} from './types';

export interface FilterOptions {
  /**
   * `opt-in` (default): only operations carrying the `x-orbitdocs` marker are
   * kept, so internal routes never leak. `opt-out`: every operation is kept
   * unless marked `hidden`.
   */
  mode?: 'opt-in' | 'opt-out';
  info?: Partial<Document['info']>;
  servers?: Server[];
  /** Merged into `components.securitySchemes`. */
  securitySchemes?: Record<string, Json>;
  /** Scheme names required by every kept operation (replaces the operation's own security). */
  security?: string[];
  /** Add 400/401/403/404/500 and the shared error schema (default true). */
  standardErrors?: boolean | { descriptions?: Record<string, string>; extra?: string[] };
  /** Keep the original operationId instead of a readable slug. */
  keepOperationIds?: boolean;
  /** This API's id: operations marked for other APIs (`@DocsOperation({ api })`) are left out. */
  api?: string;
  /**
   * Parameters removed from every kept operation, e.g. a tenant header that API-key
   * callers never send. Header names match case-insensitively.
   */
  omitParameters?: Array<{ in: 'header' | 'query' | 'path' | 'cookie'; name: string }>;
  /** Group (tag) names in the order to list them. Groups not listed follow, in first-seen order. */
  groupOrder?: string[];
}

export class DanglingReferenceError extends Error {
  constructor(public readonly names: string[]) {
    super(
      `Schemas are referenced but not defined: ${names.join(', ')}. In NestJS, register them with @ApiExtraModels() or type the property.`,
    );
    this.name = 'DanglingReferenceError';
  }
}

/**
 * Header names are case-insensitive, and Nest emits one parameter for
 * `@Headers('x')` and another for `@ApiHeader({ name: 'X' })`. Merge them,
 * the documented one winning.
 */
export function mergeParameters(params: Parameter[]): Parameter[] {
  const out: Parameter[] = [];
  const index = new Map<string, number>();
  for (const p of params) {
    if (p.$ref) {
      out.push(p);
      continue;
    }
    const key = `${p.in}:${p.in === 'header' ? p.name.toLowerCase() : p.name}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(p);
      continue;
    }
    const prev = out[at]!;
    const [weak, strong] = prev.description && !p.description ? [p, prev] : [prev, p];
    out[at] = { ...weak, ...strong, schema: { ...weak.schema, ...strong.schema } };
  }
  return out;
}

/** Drops the parameters `omitParameters` names (header names case-insensitively). */
function omit(params: Parameter[], names: FilterOptions['omitParameters']): Parameter[] {
  if (!names?.length) return params;
  const same = (a: string, b: string, header: boolean) => (header ? a.toLowerCase() === b.toLowerCase() : a === b);
  return params.filter((p) => p.$ref || !names.some((n) => n.in === p.in && same(n.name, p.name, p.in === 'header')));
}

const markerOf = (op: Operation): OrbitMarker | false | undefined =>
  op[ORBIT_EXTENSION] as OrbitMarker | false | undefined;

/**
 * Builds the public document from a full one: keeps documented operations,
 * applies their markers (group, title, order, stability), gives them readable
 * operationIds, adds standard errors, and prunes unused schemas. Throws
 * DanglingReferenceError when a kept operation references a missing schema.
 */
export function filterDocument(full: Document, options: FilterOptions = {}): Document {
  const mode = options.mode ?? 'opt-in';
  const standard = options.standardErrors ?? true;
  const allSchemas: Record<string, Schema> = {
    ...(standard ? STANDARD_ERROR_SCHEMAS : {}),
    ...(full.components?.schemas ?? {}),
  };
  const securitySchemes = { ...(full.components?.securitySchemes ?? {}), ...options.securitySchemes };
  const security: SecurityRequirement[] | undefined = options.security?.map((name) => ({ [name]: [] }));

  const paths: Record<string, PathItem> = {};
  const usedSlugs = new Set<string>();
  const groupOrder: string[] = [];

  for (const [path, method, op, item] of operations(full)) {
    const marker = markerOf(op);
    const include = mode === 'opt-in' ? Boolean(marker) && !(marker && marker.hidden) : marker !== false && !(marker && marker.hidden);
    if (!include) continue;
    const m: OrbitMarker = marker || {};
    if (options.api && m.api !== undefined && !(Array.isArray(m.api) ? m.api : [m.api]).includes(options.api)) continue;

    const out: Operation = structuredClone(op);
    delete out[ORBIT_EXTENSION];
    // With introspectComments the method's doc comment lands in `summary`; keep it as the description.
    if (m.title && out.summary && out.summary !== m.title && !out.description && !m.description) {
      out.description = out.summary;
    }
    if (m.title) out.summary = m.title;
    if (m.description) out.description = m.description;
    if (out.parameters) out.parameters = omit(mergeParameters(out.parameters), options.omitParameters);
    if (m.group) out.tags = [m.group];
    if (m.order !== undefined) out[ORDER_EXTENSION] = m.order;
    if (m.stability) out[STABILITY_EXTENSION] = m.stability;
    if (m.stability === 'deprecated') out.deprecated = true;
    if (security) out.security = security;
    if (!options.keepOperationIds) {
      if (op.operationId) out[HANDLER_EXTENSION] = op.operationId;
      out.operationId = uniqueSlug(String(out.summary ?? op.operationId ?? `${method} ${path}`), usedSlugs);
    }
    if (standard) {
      const effective = out.security ?? full.security ?? [];
      const secured = effective.some((req) => Object.keys(req).length > 0);
      applyStandardResponses(out, path, {
        secured,
        ...(typeof standard === 'object' ? standard : {}),
      });
    }
    for (const tag of out.tags ?? []) if (!groupOrder.includes(tag)) groupOrder.push(tag);

    const target = (paths[path] ??= {} as PathItem);
    if (item.parameters) target.parameters = omit(item.parameters, options.omitParameters);
    target[method] = out;
  }

  const used = referencedSchemas({ paths, webhooks: full.webhooks }, allSchemas);
  const dangling = [...used].filter((name) => !allSchemas[name]).sort();
  if (dangling.length) throw new DanglingReferenceError(dangling);

  const declaredTags = new Map((full.tags ?? []).map((t) => [t.name, t] as const));
  const tags: Tag[] = [
    ...(full.tags ?? []).filter((t) => groupOrder.includes(t.name)),
    ...groupOrder.filter((name) => !declaredTags.has(name)).map((name) => ({ name })),
  ];
  if (options.groupOrder?.length) {
    const rank = (name: string) => {
      const i = options.groupOrder!.indexOf(name);
      return i === -1 ? options.groupOrder!.length : i;
    };
    // Array.prototype.sort is stable, so unlisted groups keep their order.
    tags.sort((a, b) => rank(a.name) - rank(b.name));
  }

  const schemas: Record<string, Schema> = {};
  for (const name of [...used].sort()) schemas[name] = allSchemas[name]!;

  const doc: Document = {
    openapi: full.openapi,
    info: { ...full.info, ...options.info } as Document['info'],
    ...(options.servers ?? full.servers ? { servers: options.servers ?? full.servers } : {}),
    tags,
    paths,
    ...(full.webhooks ? { webhooks: full.webhooks } : {}),
    components: {
      ...(Object.keys(securitySchemes).length ? { securitySchemes } : {}),
      schemas,
    },
    ...(security ? { security } : full.security ? { security: full.security } : {}),
  };
  return doc;
}
