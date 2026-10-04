import * as oidc from 'openid-client';

import { readAppSession, sessionKey, verifyAppSession } from './app-session';
import { audit } from './audit';
import type { AccessManifest, DocsUser, PublicProvider } from './manifest';
import { canSignIn, isAllowed, requiredGroups, resolveGroups, sitePath, variantPathname, variesByReader } from './match';
import { deniedPage, loginPage } from './pages';
import { personalize } from './personalize';
import { assertSecret, cookie, FLOW_COOKIE, readCookie, SESSION_COOKIE, signFlow, signSession, verifyFlow, verifySession } from './session';

export interface AuthOptions {
  manifest: AccessManifest;
  /** Where secrets come from (process.env by default). */
  env?: Record<string, string | undefined>;
  /** Public origin (https://docs.acme.com); defaults to the request's origin (honours X-Forwarded-*). */
  publicUrl?: string;
  /**
   * HTTP client for every outbound request: OpenID Connect discovery, token and userinfo
   * calls, app-session keys and lookups, the personalization hook and the audit webhook.
   * A host can pass one that refuses private addresses (the platform does). Default: fetch.
   */
  fetch?: typeof fetch;
  /** Firebase key URLs (tests). */
  firebaseKeys?: { session: string; id: string };
}

/** Readers signed in through the product's own session. */
export const APP_PROVIDER = 'app';

export type GateResult =
  | {
      allowed: true;
      user?: DocsUser;
      /**
       * Serve this pathname (base path included) instead of the requested one:
       * the most complete variant of a reader-dependent file this reader may
       * open. The URL the reader sees stays the same.
       */
      rewrite?: string;
      /** The response depends on the reader: don't let shared caches keep it (`Vary: Cookie`, `private`). */
      varies?: boolean;
    }
  | { allowed: false; response: Response };

export interface AuthHandler {
  /** Handles `<base>/_auth/*`; returns undefined for any other path. */
  handle(request: Request): Promise<Response | undefined>;
  /** Decides whether a page request may be served. */
  gate(request: Request): Promise<GateResult>;
  /** The signed-in reader, if any. */
  user(request: Request): Promise<DocsUser | undefined>;
}

const html = (body: string, status = 200, headers: HeadersInit = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const redirect = (location: string, setCookies: string[] = []) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of setCookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
};

/** Only same-site paths are valid `next` targets (no open redirects). */
function safeNext(next: string | null, base: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return `${base}/`;
  return next;
}

export function createAuth(options: AuthOptions): AuthHandler {
  const { manifest } = options;
  const env = options.env ?? process.env;
  const fetcher = options.fetch ?? fetch;
  const log = (event: Parameters<typeof audit>[1]) => audit(manifest, event, fetcher);
  const base = manifest.basePath;
  const secret = () => assertSecret(env[manifest.session.secretEnv], manifest.session.secretEnv);
  const oidcConfigs = new Map<string, Promise<oidc.Configuration>>();

  const origin = (req: Request) => {
    if (options.publicUrl) return options.publicUrl.replace(/\/$/, '');
    const url = new URL(req.url);
    const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
    return `${proto}://${host}`;
  };
  const secure = (req: Request) => origin(req).startsWith('https://');
  const cookiePath = base || '/';
  const callbackUrl = (req: Request, id: string) => `${origin(req)}${base}/_auth/callback/${id}`;
  const ip = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  function provider(id: string): PublicProvider | undefined {
    return manifest.providers.find((p) => p.id === id);
  }

  function oidcConfig(p: PublicProvider) {
    let pending = oidcConfigs.get(p.id);
    if (!pending) {
      const clientSecret = env[p.clientSecretEnv];
      if (!clientSecret) throw new Error(`${p.clientSecretEnv} is not set (client secret for ${p.name})`);
      const insecure = p.issuer.startsWith('http://');
      pending = oidc
        .discovery(new URL(p.issuer), p.clientId, clientSecret, undefined, {
          ...(insecure ? { execute: [oidc.allowInsecureRequests] } : {}),
          ...(options.fetch ? { [oidc.customFetch]: options.fetch as oidc.CustomFetch } : {}),
        })
        .then((config) => {
          // Token and userinfo calls go through the same client as discovery.
          if (options.fetch) config[oidc.customFetch] = options.fetch as oidc.CustomFetch;
          return config;
        });
      pending.catch(() => oidcConfigs.delete(p.id));
      oidcConfigs.set(p.id, pending);
    }
    return pending;
  }

  /** Finishes any sign-in: groups, allow-list check, personalization, session cookie. */
  async function complete(req: Request, providerId: string, identity: { email?: string; name?: string; idpGroups?: string[] }, next: string) {
    const email = identity.email?.toLowerCase();
    if (!email) {
      await log({ type: 'sign_in_failed', provider: providerId, ip: ip(req), reason: 'no email in identity' });
      return html(loginPage(manifest, { base, next, error: 'Your account has no email address. Ask your administrator.' }), 400);
    }
    const groups = resolveGroups(manifest, email, identity.idpGroups);
    if (!canSignIn(manifest, groups)) {
      await log({ type: 'sign_in_failed', email, provider: providerId, ip: ip(req), reason: 'not in any access group' });
      return html(loginPage(manifest, { base, next, error: `${email} doesn't have access to these docs.` }), 403);
    }
    let user: DocsUser = { email, name: identity.name, groups, provider: providerId };
    user = await personalize(manifest, user, env, fetcher);
    const token = await signSession(user, secret(), manifest.session.maxAgeHours);
    await log({ type: 'sign_in', email, provider: providerId, ip: ip(req) });
    return redirect(next, [
      cookie(SESSION_COOKIE, token, { path: cookiePath, maxAge: manifest.session.maxAgeHours * 3600, secure: secure(req) }),
      cookie(FLOW_COOKIE, '', { path: cookiePath, maxAge: 0, secure: secure(req) }),
    ]);
  }

  /** Verified app sessions by fingerprint, so pages don't re-verify on every request. */
  const appCache = new Map<string, { user: DocsUser | null; until: number }>();

  /** The reader behind the product's own session cookie, if it is valid and allowed. */
  async function appUser(req: Request): Promise<DocsUser | undefined> {
    const s = manifest.appSession;
    if (!s) return undefined;
    const raw = readAppSession(s, req.headers.get('cookie'));
    if (!raw) return undefined;
    const key = sessionKey(raw);
    const hit = appCache.get(key);
    if (hit && hit.until > Date.now()) return hit.user ?? undefined;

    const identity = await verifyAppSession(s, raw, { env, fetch: options.fetch, firebaseKeys: options.firebaseKeys });
    const email = identity?.email?.toLowerCase();
    let found: DocsUser | undefined;
    if (identity && email) {
      const groups = resolveGroups(manifest, email, identity.groups);
      if (canSignIn(manifest, groups)) {
        found = await personalize(manifest, { email, name: identity.name, groups, provider: APP_PROVIDER }, env, fetcher);
        await log({ type: 'sign_in', email, provider: `app:${s.type}`, ip: ip(req) });
      } else {
        await log({ type: 'sign_in_failed', email, provider: `app:${s.type}`, ip: ip(req), reason: 'not in any access group' });
      }
    }
    // Opaque sessions (Appwrite) are re-checked every minute; tokens until they expire, at most 5 minutes.
    const until = Math.min(identity?.expiresAt ?? Date.now() + 60_000, Date.now() + 5 * 60_000);
    if (appCache.size > 1000) appCache.delete(appCache.keys().next().value as string);
    appCache.set(key, { user: found ?? null, until });
    return found;
  }

  async function user(req: Request) {
    // No session cookie, nothing to verify: anonymous readers never need the secret.
    const session = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
    return (session ? await verifySession(session, secret()) : null) ?? (await appUser(req));
  }

  async function handle(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url);
    const path = sitePath(url.pathname, base);
    if (!path.startsWith('/_auth')) return undefined;
    const [, , action, id] = path.split('/');
    const next = safeNext(url.searchParams.get('next'), base);

    try {
      if (action === 'login') {
        // Already signed in to the product: straight back to the page.
        if (manifest.appSession && (await appUser(req))) return redirect(next);
        return html(loginPage(manifest, { base, next }));
      }

      if (action === 'app') {
        const s = manifest.appSession;
        if (!s) return new Response('Not found', { status: 404 });
        const target = new URL(s.loginUrl);
        target.searchParams.set(s.returnParam, `${origin(req)}${next}`);
        return redirect(target.href);
      }

      if (action === 'logout') {
        const u = await user(req);
        if (u) await log({ type: 'sign_out', email: u.email, ip: ip(req) });
        const clear = [cookie(SESSION_COOKIE, '', { path: cookiePath, maxAge: 0, secure: secure(req) })];
        // Product sessions end in the product.
        if (u?.provider === APP_PROVIDER && manifest.appSession) {
          return redirect(manifest.appSession.logoutUrl ?? manifest.appSession.loginUrl, clear);
        }
        return redirect(`${base}/_auth/login`, clear);
      }

      if (action === 'me') {
        const u = await user(req);
        return new Response(JSON.stringify(u ? { user: { email: u.email, name: u.name, groups: u.groups }, credentials: u.credentials ?? {}, variables: u.variables ?? {} } : { user: null }), {
          status: u ? 200 : 401,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }

      if (action === 'start' && id) {
        const p = provider(id);
        if (!p) return html(loginPage(manifest, { base, next, error: 'Unknown sign-in method.' }), 404);
        const config = await oidcConfig(p);
        const verifier = oidc.randomPKCECodeVerifier();
        const state = oidc.randomState();
        const nonce = oidc.randomNonce();
        const target = oidc.buildAuthorizationUrl(config, {
          redirect_uri: callbackUrl(req, p.id),
          scope: p.scopes.join(' '),
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: 'S256',
          state,
          nonce,
          ...p.authParams,
        });
        const flow = await signFlow({ provider: p.id, verifier, state, nonce, next }, secret());
        return redirect(target.href, [cookie(FLOW_COOKIE, flow, { path: cookiePath, maxAge: 600, secure: secure(req) })]);
      }

      if (action === 'callback' && id) {
        const p = provider(id);
        if (!p) return html(loginPage(manifest, { base, next, error: 'Unknown sign-in method.' }), 404);
        const flow = await verifyFlow(readCookie(req.headers.get('cookie'), FLOW_COOKIE), secret());
        if (!flow || flow.provider !== p.id) return html(loginPage(manifest, { base, next, error: 'Your sign-in expired. Please try again.' }), 400);
        const config = await oidcConfig(p);
        // The callback URL as the IdP sent it, on the public origin.
        const current = new URL(`${origin(req)}${url.pathname}${url.search}`);
        const tokens = await oidc.authorizationCodeGrant(config, current, {
          pkceCodeVerifier: flow.verifier,
          expectedState: flow.state,
          expectedNonce: flow.nonce,
        });
        const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
        if (p.hostedDomain && claims.hd !== p.hostedDomain) {
          await log({ type: 'sign_in_failed', email: claims.email as string | undefined, provider: p.id, ip: ip(req), reason: `not a ${p.hostedDomain} account` });
          return html(loginPage(manifest, { base, next, error: `Sign in with your ${p.hostedDomain} account.` }), 403);
        }
        let email = (claims.email ?? claims.preferred_username) as string | undefined;
        let name = claims.name as string | undefined;
        let groups = claims[p.groupsClaim] as string[] | undefined;
        if (!email?.includes('@')) {
          const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub as string);
          email = info.email;
          name ??= info.name;
          groups ??= info[p.groupsClaim] as string[] | undefined;
        }
        return complete(req, p.id, { email, name, idpGroups: Array.isArray(groups) ? groups : [] }, flow.next ?? next);
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      await log({ type: 'sign_in_failed', provider: id, ip: ip(req), reason: (err as Error).message });
      return html(loginPage(manifest, { base, next, error: `Sign-in failed: ${(err as Error).message}` }), 500);
    }
  }

  async function gate(req: Request): Promise<GateResult> {
    const url = new URL(req.url);
    const groups = requiredGroups(manifest, url.pathname);
    const varies = variesByReader(manifest, url.pathname);
    if (!groups && !varies) return { allowed: true };
    const u = await user(req);
    if (isAllowed(u, groups)) {
      const rewrite = varies ? variantPathname(manifest, u, url.pathname) : undefined;
      return { allowed: true, user: u, ...(rewrite ? { rewrite } : {}), ...(varies ? { varies } : {}) };
    }
    if (!u) {
      // Pages go to the login screen; data requests (search index, specs) get a plain 401.
      const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html');
      if (!wantsHtml) return { allowed: false, response: new Response('Sign in required', { status: 401 }) };
      return { allowed: false, response: redirect(`${base}/_auth/login?next=${encodeURIComponent(url.pathname + url.search)}`) };
    }
    await log({ type: 'denied', email: u.email, path: url.pathname, ip: ip(req) });
    return { allowed: false, response: html(deniedPage(manifest, { base, email: u.email }), 403) };
  }

  return { handle, gate, user };
}
