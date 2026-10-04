import type { DocsUser, Requirement } from './manifest';

type Loose = string[] | Requirement | null | undefined;

/** `['a', 'b']` → `[['a', 'b']]`; a requirement stays as it is. */
function clauses(part: Loose): string[][] {
  if (!part?.length) return [];
  return Array.isArray(part[0]) ? (part as string[][]) : [part as string[]];
}

const subset = (a: string[], b: string[]) => a.every((g) => b.includes(g));

/**
 * Every part at once (the reader must satisfy all of them), simplified:
 * a list with `*` becomes `['*']`, a list implied by another one is dropped
 * (`[staff]` makes `[staff, partners]` and `[*]` redundant). null = public.
 */
export function requirement(...parts: Loose[]): Requirement | null {
  let all = parts.flatMap(clauses).map((c) => (c.includes('*') ? ['*'] : [...new Set(c)].sort()));
  all = all.filter((c) => c.length);
  // Any group implies being signed in.
  if (all.some((c) => c[0] !== '*')) all = all.filter((c) => c[0] !== '*');
  const out: string[][] = [];
  for (const c of all.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()))) {
    if (!out.some((kept) => subset(kept, c))) out.push(c);
  }
  return out.length ? out.sort((a, b) => a.join().localeCompare(b.join())) : null;
}

/** Whether `user` satisfies a requirement (a plain group list = one of these groups). */
export function isAllowed(user: DocsUser | undefined, required: Loose): boolean {
  const all = clauses(required);
  if (!all.length) return true;
  if (!user) return false;
  return all.every((c) => c.includes('*') || c.some((g) => user.groups.includes(g)));
}

/** Whether every reader who satisfies `a` also satisfies `b` (null = public). */
export function implies(a: Loose, b: Loose): boolean {
  const need = requirement(b);
  if (!need) return true;
  const have = requirement(a);
  if (!have) return false;
  return need.every((c) => c[0] === '*' || have.some((h) => h[0] !== '*' && subset(h, c)));
}

/** A stable key for a requirement (`staff|partners&beta`), '' when public. */
export function requirementKey(r: Loose): string {
  return (requirement(r) ?? []).map((c) => c.join('|')).join('&');
}
