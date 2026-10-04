import { createHmac } from 'node:crypto';

import type { AccessManifest, DocsUser } from './manifest';

interface HookResponse {
  groups?: string[];
  credentials?: Record<string, string>;
  variables?: Record<string, string>;
}

/**
 * Calls the site's personalization hook after sign-in. The body is signed with
 * HMAC-SHA256 (`x-orbitdocs-signature: sha256=<hex>`) so the hook can trust it.
 * Failures never block sign-in.
 */
export async function personalize(manifest: AccessManifest, user: DocsUser, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): Promise<DocsUser> {
  const p = manifest.personalization;
  if (!p) return user;
  const secret = env[p.secretEnv];
  if (!secret) return user;
  const body = JSON.stringify({ email: user.email, name: user.name, groups: user.groups, provider: user.provider });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  try {
    const res = await fetcher(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-orbitdocs-signature': `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return user;
    const extra = (await res.json()) as HookResponse;
    return {
      ...user,
      groups: [...new Set([...user.groups, ...(extra.groups ?? []).filter((g) => g in manifest.groups)])],
      credentials: extra.credentials,
      variables: extra.variables,
    };
  } catch {
    return user;
  }
}
