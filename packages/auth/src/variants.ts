import type { Requirement } from './manifest';
import { implies, requirement, requirementKey } from './requirement';

/** Something reader-dependent files may hold: a guide page, an operation. */
export interface VariantItem {
  id: string;
  /** What a reader needs to open it (null = public). */
  requires: Requirement | null;
}

export interface VariantPlan {
  /** Items in the canonical file: every reader who can open it may see them. */
  base: string[];
  /** Most complete first; empty when the canonical file already holds everything. */
  options: Array<{ key: string; requires: Requirement; items: string[] }>;
}

/** More options than this per file set fails the build: split the content instead. */
export const MAX_VARIANTS = 16;

/**
 * Plans the variants of files that hold several items readers may or may not
 * see (the sidebar, an API's spec): the canonical file holds the items every
 * reader who can open it (`base`) may see; each option adds the items of one
 * combination of the stricter requirements. Only combinations a reader can
 * actually be in are kept (closed under implication: whoever satisfies
 * `[[staff]]` also satisfies `[['*']]`), so the first option a reader
 * satisfies, most complete first, is exactly what they may see.
 *
 * No option when no item is stricter than `base` (nothing to vary).
 */
export function planVariants(base: Requirement | null, items: VariantItem[], prefix: string, max = MAX_VARIANTS): VariantPlan {
  const visible = (who: Requirement | null) => items.filter((i) => implies(who, requirement(base, i.requires))).map((i) => i.id);
  const stricter = new Map<string, Requirement>();
  for (const item of items) {
    const r = requirement(base, item.requires);
    if (r && !implies(base, r)) stricter.set(requirementKey(r), r);
  }
  const distinct = [...stricter.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
  if (distinct.length > 10) throw new Error(tooMany(distinct.length, max));
  const options: VariantPlan['options'] = [];
  for (let mask = 1; mask < 1 << distinct.length; mask++) {
    const chosen = distinct.filter((_, i) => mask & (1 << i));
    const requires = requirement(base, ...chosen)!;
    // Skip combinations no reader can be in: whoever satisfies them satisfies a requirement left out.
    if (distinct.some((r, i) => !(mask & (1 << i)) && implies(requires, r))) continue;
    options.push({ key: '', requires, items: visible(requires) });
  }
  if (options.length > max) throw new Error(tooMany(options.length, max));
  options.sort((a, b) => b.items.length - a.items.length || requirementKey(a.requires).localeCompare(requirementKey(b.requires)));
  options.forEach((o, i) => (o.key = `${prefix}${i + 1}`));
  return { base: visible(base), options };
}

function tooMany(n: number, max: number) {
  return `${n} different access combinations; at most ${max} are supported. Restrict whole folders or a separate API (apis[].access) instead of many single pages or operations.`;
}
