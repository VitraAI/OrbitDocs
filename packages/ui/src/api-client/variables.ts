import type { Environment, Variable } from './types';

/** Dynamic variables, Postman/Scalar style: {{$guid}}, {{$timestamp}}, {{$randomInt}}… */
const DYNAMIC: Record<string, () => string> = {
  $guid: () => crypto.randomUUID(),
  $uuid: () => crypto.randomUUID(),
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(Math.floor(Math.random() * 1000)),
  $randomEmail: () => `user${Math.floor(Math.random() * 1e6)}@example.com`,
  $randomFirstName: () => ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus'][Math.floor(Math.random() * 5)]!,
};

/** Resolution order: request-scoped (scripts) → active environment → globals. */
export function scope(globals: Variable[], env: Environment | undefined, local: Record<string, string> = {}) {
  const map: Record<string, string> = {};
  for (const v of globals) if (v.enabled) map[v.key] = v.value;
  for (const v of env?.variables ?? []) if (v.enabled) map[v.key] = v.value;
  return { ...map, ...local };
}

/** Replaces `{{name}}` with its value; unknown names are left as written. */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (match, name: string) => {
    if (name in vars) return vars[name]!;
    const dyn = DYNAMIC[name];
    return dyn ? dyn() : match;
  });
}

/** Names used in `text` that have no value. */
export function missingVariables(text: string, vars: Record<string, string>): string[] {
  return [...text.matchAll(/\{\{\s*([$\w.-]+)\s*\}\}/g)].map((m) => m[1]!).filter((n) => !(n in vars) && !(n in DYNAMIC));
}
