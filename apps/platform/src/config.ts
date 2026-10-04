import { resolve } from 'node:path';

import type { PublicProvider } from '@orbitdocs/auth';
import { resolveProvider } from '@orbitdocs/auth';

import { type OutboundAllow, parseOutboundAllow } from './hosting/outbound';

/** Platform settings, all from the environment. */
export interface PlatformConfig {
  databaseUrl: string;
  /** Signs sessions and encrypts stored Git tokens. */
  secret: string;
  /** `localhost:8080` or `docs.acme.com`: dashboard here, sites at `<project>.<domain>`. */
  domain: string;
  /** Public origin of the dashboard (`https://docs.acme.com`). */
  publicUrl: string;
  port: number;
  dataDir: string;
  admin?: { email: string; password: string };
  sso: PublicProvider[];
  scimToken?: string;
  /** SITE_OUTBOUND_ALLOW: private hosts and addresses hosted sites may still reach (an internal IdP). */
  outboundAllow: OutboundAllow;
}

export function loadConfig(env = process.env): PlatformConfig {
  const secret = env.PLATFORM_SECRET ?? '';
  if (secret.length < 32) throw new Error('PLATFORM_SECRET must be a random string of at least 32 characters (openssl rand -hex 32).');
  const port = Number(env.PORT ?? 8080);
  const domain = (env.PLATFORM_DOMAIN ?? `localhost:${port}`).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(domain);
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://orbitdocs:orbitdocs@localhost:5433/orbitdocs',
    secret,
    domain,
    publicUrl: env.PLATFORM_URL ?? `${local ? 'http' : 'https'}://${domain}`,
    port,
    dataDir: resolve(env.DATA_DIR ?? './data'),
    admin: env.ADMIN_EMAIL && env.ADMIN_PASSWORD ? { email: env.ADMIN_EMAIL.toLowerCase(), password: env.ADMIN_PASSWORD } : undefined,
    // The same sign-in presets as private docs, e.g. [{"type":"okta","domain":"acme.okta.com","clientId":"…","clientSecretEnv":"OKTA_SECRET"}]
    sso: env.PLATFORM_SSO ? (JSON.parse(env.PLATFORM_SSO) as Parameters<typeof resolveProvider>[0][]).map(resolveProvider) : [],
    scimToken: env.SCIM_TOKEN || undefined,
    outboundAllow: parseOutboundAllow(env.SITE_OUTBOUND_ALLOW),
  };
}

export const CONFIG = Symbol('CONFIG');
export const DB = Symbol('DB');
