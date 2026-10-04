import { createHash } from 'node:crypto';

import { createRemoteJWKSet, customFetch, decodeProtectedHeader, importX509, type JWTPayload, jwtVerify } from 'jose';

import type { AppSession } from './manifest';
import { readCookie } from './session';

/** Who the product's session belongs to. */
export interface AppIdentity {
  email?: string;
  name?: string;
  groups: string[];
  /** When the session stops being valid (ms), if the token says. */
  expiresAt?: number;
}

const expiry = (p: JWTPayload) => (p.exp ? p.exp * 1000 : undefined);

type Fetch = typeof fetch;

/** The cookie each product sets by default. */
export function appCookieName(s: AppSession): string {
  if (s.cookie) return s.cookie;
  switch (s.type) {
    case 'supabase':
      // @supabase/ssr: sb-<project ref>-auth-token
      return `sb-${new URL(s.projectUrl).hostname.split('.')[0]}-auth-token`;
    case 'clerk':
      return '__session';
    case 'firebase':
      return '__session';
    case 'appwrite':
      return `a_session_${s.projectId.toLowerCase()}`;
  }
}

/**
 * The raw session value from the request. Supabase splits large sessions into
 * `<name>.0`, `<name>.1`, … cookies.
 */
export function readAppSession(s: AppSession, cookieHeader: string | null): string | undefined {
  const name = appCookieName(s);
  const whole = readCookie(cookieHeader, name);
  if (whole || s.type !== 'supabase') return whole;
  const parts: string[] = [];
  for (let i = 0; ; i++) {
    const part = readCookie(cookieHeader, `${name}.${i}`);
    if (part === undefined) break;
    parts.push(part);
  }
  return parts.length ? parts.join('') : undefined;
}

/** Dot-path claim lookup (`app_metadata.groups`). */
function claim(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), payload);
}

const asGroups = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Supabase stores `base64-<json>` (or plain JSON); the access token is inside. */
export function supabaseAccessToken(raw: string): string | undefined {
  let text = raw;
  if (text.startsWith('base64-')) text = Buffer.from(text.slice(7), 'base64url').toString('utf8');
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(text)) return text;
  try {
    const data = JSON.parse(text) as unknown;
    if (Array.isArray(data)) return typeof data[0] === 'string' ? data[0] : undefined;
    return (data as { access_token?: string }).access_token;
  } catch {
    return undefined;
  }
}

/** Key sets per HTTP client, so a guarded client never reuses keys fetched without it. */
const jwksCache = new WeakMap<Fetch, Map<string, ReturnType<typeof createRemoteJWKSet>>>();
function jwks(url: string, fetcher: Fetch) {
  let sets = jwksCache.get(fetcher);
  if (!sets) jwksCache.set(fetcher, (sets = new Map()));
  let set = sets.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url), { [customFetch]: fetcher });
    sets.set(url, set);
  }
  return set;
}

/** Google publishes Firebase keys as X.509 certificates by key id. */
const certCache = new Map<string, { at: number; keys: Record<string, string> }>();
async function googleCert(url: string, kid: string | undefined, fetcher: Fetch): Promise<CryptoKey> {
  let entry = certCache.get(url);
  if (!entry || Date.now() - entry.at > 3600_000 || (kid && !entry.keys[kid])) {
    const res = await fetcher(url);
    if (!res.ok) throw new Error(`Could not load Firebase keys (${res.status})`);
    entry = { at: Date.now(), keys: (await res.json()) as Record<string, string> };
    certCache.set(url, entry);
  }
  const pem = kid ? entry.keys[kid] : undefined;
  if (!pem) throw new Error('Unknown Firebase signing key');
  return importX509(pem, 'RS256');
}

const FIREBASE_SESSION_KEYS = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys';
const FIREBASE_ID_KEYS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface VerifyOptions {
  env: Record<string, string | undefined>;
  fetch?: Fetch;
  /** Firebase key URLs (tests). */
  firebaseKeys?: { session: string; id: string };
}

/** Verifies the product's session and returns who it belongs to; undefined if invalid or expired. */
export async function verifyAppSession(s: AppSession, raw: string, opts: VerifyOptions): Promise<AppIdentity | undefined> {
  const fetcher = opts.fetch ?? fetch;
  try {
    switch (s.type) {
      case 'supabase': {
        const token = supabaseAccessToken(raw);
        if (!token) return undefined;
        const base = s.projectUrl.replace(/\/+$/, '');
        const secret = s.jwtSecretEnv ? opts.env[s.jwtSecretEnv] : undefined;
        const { payload } = secret
          ? await jwtVerify(token, new TextEncoder().encode(secret), { audience: 'authenticated' })
          : await jwtVerify(token, jwks(`${base}/auth/v1/.well-known/jwks.json`, fetcher), { issuer: `${base}/auth/v1`, audience: 'authenticated' });
        const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
        return {
          email: payload.email as string | undefined,
          name: (meta.full_name ?? meta.name) as string | undefined,
          groups: asGroups(claim(payload, s.groupsClaim ?? 'app_metadata.groups')),
          expiresAt: expiry(payload),
        };
      }
      case 'clerk': {
        const domain = s.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const origin = domain.startsWith('localhost') || domain.startsWith('127.') ? `http://${domain}` : `https://${domain}`;
        const { payload } = await jwtVerify(raw, jwks(`${origin}/.well-known/jwks.json`, fetcher), { issuer: origin });
        let email = (payload.email ?? payload.primary_email) as string | undefined;
        let name = payload.name as string | undefined;
        const key = s.secretKeyEnv ? opts.env[s.secretKeyEnv] : undefined;
        if (!email && key && payload.sub) {
          // The default session token has no email: ask Clerk's Backend API.
          const res = await fetcher(`https://api.clerk.com/v1/users/${encodeURIComponent(payload.sub)}`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const u = (await res.json()) as { primary_email_address_id?: string; email_addresses?: Array<{ id: string; email_address: string }>; first_name?: string; last_name?: string };
            email = u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address;
            name ??= [u.first_name, u.last_name].filter(Boolean).join(' ') || undefined;
          }
        }
        return { email, name, groups: asGroups(claim(payload, s.groupsClaim ?? 'groups')), expiresAt: expiry(payload) };
      }
      case 'firebase': {
        // Admin SDK session cookies and client ID tokens are both accepted.
        const keys = opts.firebaseKeys ?? { session: FIREBASE_SESSION_KEYS, id: FIREBASE_ID_KEYS };
        const { kid } = decodeProtectedHeader(raw);
        const unverified = JSON.parse(Buffer.from(raw.split('.')[1] ?? '', 'base64url').toString('utf8')) as JWTPayload;
        const isSession = unverified.iss === `https://session.firebase.google.com/${s.projectId}`;
        const issuer = isSession ? `https://session.firebase.google.com/${s.projectId}` : `https://securetoken.google.com/${s.projectId}`;
        const key = await googleCert(isSession ? keys.session : keys.id, kid, fetcher);
        const { payload } = await jwtVerify(raw, key, { issuer, audience: s.projectId, algorithms: ['RS256'] });
        if (payload.email_verified === false) return undefined;
        return {
          email: payload.email as string | undefined,
          name: payload.name as string | undefined,
          groups: asGroups(claim(payload, s.groupsClaim ?? 'groups')),
          expiresAt: expiry(payload),
        };
      }
      case 'appwrite': {
        // Appwrite sessions are opaque: ask Appwrite who it belongs to.
        const res = await fetcher(`${s.endpoint.replace(/\/+$/, '')}/account`, {
          headers: { 'X-Appwrite-Project': s.projectId, 'X-Appwrite-Session': raw },
        });
        if (!res.ok) return undefined;
        const u = (await res.json()) as { email?: string; name?: string; labels?: string[] } & Record<string, unknown>;
        return { email: u.email, name: u.name || undefined, groups: s.groupsClaim ? asGroups(claim(u, s.groupsClaim)) : (u.labels ?? []) };
      }
    }
  } catch {
    return undefined;
  }
}

/** Short fingerprint of a session value, for caching without keeping the value. */
export const sessionKey = (raw: string) => createHash('sha256').update(raw).digest('base64url');
