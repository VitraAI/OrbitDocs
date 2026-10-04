import { BadRequestException } from '@nestjs/common';
import type { AiManifest } from '@orbitdocs/ai';
import type { AccessManifest } from '@orbitdocs/auth';

/** One stored variable: build variables and site variables alike. */
export interface StoredEnvVar {
  key: string;
  /** AES-GCM with PLATFORM_SECRET. */
  valueEncrypted: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/**
 * Applies `changes` to stored variables: a string sets one (sealed with `seal`),
 * null removes it, and names left out stay as they are. Returns the sorted list
 * and the changes for the audit log (`+NAME`, `-NAME`), never values.
 */
export function applyEnvChanges(
  current: StoredEnvVar[],
  changes: Record<string, string | null>,
  opts: { seal: (value: string) => string; reserved?: string[]; max: number; what: string },
): { vars: StoredEnvVar[]; changed: string[] } {
  const env = new Map(current.map((v) => [v.key, v.valueEncrypted]));
  const changed: string[] = [];
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (!NAME.test(key)) throw new BadRequestException(`"${key}" is not a valid variable name (letters, digits and _, not starting with a digit)`);
    if (opts.reserved?.includes(key)) throw new BadRequestException(`${key} is set by the platform and cannot be changed`);
    if (value === null) {
      if (env.delete(key)) changed.push(`-${key}`);
      continue;
    }
    if (typeof value !== 'string' || value.length > 16_384) throw new BadRequestException(`${key}: the value is a string of at most 16 KB`);
    env.set(key, opts.seal(value));
    changed.push(`+${key}`);
  }
  if (env.size > opts.max) throw new BadRequestException(`At most ${opts.max} ${opts.what}`);
  return { vars: [...env].sort(([a], [b]) => a.localeCompare(b)).map(([key, valueEncrypted]) => ({ key, valueEncrypted })), changed };
}

/**
 * The variables a site's build reads secrets from, and what for. The session
 * secret is left out: the platform derives one per project.
 */
export function siteEnvNames(access: AccessManifest | null, ai: AiManifest | null): Array<{ key: string; usedBy: string }> {
  const names: Array<{ key: string; usedBy: string }> = [];
  for (const p of access?.providers ?? []) names.push({ key: p.clientSecretEnv, usedBy: `${p.name} sign-in (client secret)` });
  const app = access?.appSession;
  if (app?.type === 'supabase' && app.jwtSecretEnv) names.push({ key: app.jwtSecretEnv, usedBy: 'Supabase session (JWT secret)' });
  if (app?.type === 'clerk' && app.secretKeyEnv) names.push({ key: app.secretKeyEnv, usedBy: 'Clerk session (secret key)' });
  if (access?.personalization) names.push({ key: access.personalization.secretEnv, usedBy: 'Personalization hook (signing secret)' });
  if (ai?.ai.askAi.enabled) names.push({ key: ai.ai.apiKeyEnv, usedBy: `Ask AI (${ai.ai.provider} API key)` });
  const seen = new Set<string>();
  return names.filter((n) => n.key !== access?.session.secretEnv && !seen.has(n.key) && seen.add(n.key));
}

/**
 * What a hosted site's handlers see as their environment: the project's own
 * site variables and the derived session key. Never the platform's
 * process.env, because the site's manifests name the variables they read and
 * where the values are sent (an AI `baseUrl`, an OIDC issuer).
 */
export function hostedSiteEnv(vars: Record<string, string>, access: AccessManifest | null, sessionKey: string): Record<string, string> {
  return { ...vars, ...(access ? { [access.session.secretEnv]: sessionKey } : {}) };
}

/** A hosted site may not write files on the platform host: its audit trail goes to `webhookUrl` only. */
export function hostedAccess(access: AccessManifest): AccessManifest {
  if (!access.audit?.file) return access;
  const { file: _file, ...audit } = access.audit;
  return { ...access, audit };
}
