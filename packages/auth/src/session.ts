import { jwtVerify, SignJWT } from 'jose';

import type { DocsUser } from './manifest';

export const SESSION_COOKIE = 'od_session';
export const FLOW_COOKIE = 'od_flow';

const key = (secret: string) => new TextEncoder().encode(secret);

export function assertSecret(secret: string | undefined, name: string): string {
  if (!secret || secret.length < 32) {
    throw new Error(`${name} must be set to a random string of at least 32 characters (e.g. \`openssl rand -hex 32\`).`);
  }
  return secret;
}

/** Signed, short claims about the reader (HS256). */
export async function signSession(user: DocsUser, secret: string, maxAgeHours: number): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeHours}h`)
    .setAudience('orbitdocs:session')
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<DocsUser | undefined> {
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: 'orbitdocs:session', algorithms: ['HS256'] });
    return (payload as { user?: DocsUser }).user;
  } catch {
    return undefined;
  }
}

/** Short-lived signed state for a sign-in round trip (PKCE verifier, nonce, return path). */
export async function signFlow(data: Record<string, string>, secret: string, minutes = 10): Promise<string> {
  return new SignJWT(data).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${minutes}m`).setAudience('orbitdocs:flow').sign(key(secret));
}

export async function verifyFlow(token: string | undefined, secret: string): Promise<Record<string, string> | undefined> {
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: 'orbitdocs:flow', algorithms: ['HS256'] });
    return payload as Record<string, string>;
  } catch {
    return undefined;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

export function cookie(name: string, value: string, opts: { path: string; maxAge: number; secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path || '/'}`,
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ');
}
