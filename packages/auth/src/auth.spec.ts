import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportJWK, generateKeyPair, importPKCS8, SignJWT } from 'jose';
import { OAuth2Server } from 'oauth2-mock-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appCookieName, supabaseAccessToken } from './app-session';
import { buildManifest, markdownPattern, type ManifestInput, resolveProvider } from './build-manifest';
import { createAuth } from './handler';
import type { AccessManifest } from './manifest';
import { canSignIn, isAllowed, matches, requiredGroups, resolveGroups, sitePath, variantPathname, variesByReader } from './match';
import { implies, requirement } from './requirement';
import { planVariants } from './variants';
import { signSession, verifySession } from './session';

const SECRET = 'x'.repeat(40);

const manifest = (over: Partial<AccessManifest> = {}): AccessManifest => ({
  version: 2,
  basePath: '/docs',
  site: { title: 'Acme' },
  mode: 'public',
  groups: {
    staff: { emails: [], domains: ['acme.com'], idpGroups: [] },
    partners: { emails: ['pat@partner.io'], domains: [], idpGroups: ['partner-devs'] },
  },
  rules: [
    { pattern: '/internal/*', groups: ['staff'] },
    { pattern: '/reference/admin/*', groups: ['staff', 'partners'] },
  ],
  providers: [],
  session: { secretEnv: 'SECRET', maxAgeHours: 1 },
  loginPage: {},
  ...over,
});

describe('matching', () => {
  it('normalises paths', () => {
    expect(sitePath('/docs/internal/runbook/', '/docs')).toBe('/internal/runbook');
    expect(sitePath('/docs/internal/runbook/index.html', '/docs')).toBe('/internal/runbook');
    expect(sitePath('/docs', '/docs')).toBe('/');
    // Static export RSC payloads belong to their page.
    expect(sitePath('/docs/internal/runbook/index.txt', '/docs')).toBe('/internal/runbook');
    expect(sitePath('/docs/internal/runbook/__next._full.txt', '/docs')).toBe('/internal/runbook');
    expect(sitePath('/docs/internal/runbook/__next.!KGd1aWRlcyk.$c$slug.__PAGE__.txt', '/docs')).toBe('/internal/runbook');
    expect(sitePath('/docs/index.txt', '/docs')).toBe('/');
    expect(sitePath('/docs/llms.txt', '/docs')).toBe('/llms.txt');
    expect(sitePath('/docs/llms-full.txt', '/docs')).toBe('/llms-full.txt');
  });
  it('gates the RSC payloads of a page restricted to an exact path', () => {
    const m = manifest({ rules: [{ pattern: '/internal/runbook', groups: ['staff'] }] });
    expect(requiredGroups(m, '/docs/internal/runbook/index.txt')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/internal/runbook/__next._full.txt')).toEqual([['staff']]);
  });
  it('matches folders and exact paths', () => {
    expect(matches('/internal/*', '/internal')).toBe(true);
    expect(matches('/internal/*', '/internal/a/b')).toBe(true);
    expect(matches('/internal/*', '/internals')).toBe(false);
    expect(matches('/a', '/a')).toBe(true);
  });
  it('finds required groups', () => {
    const m = manifest();
    expect(requiredGroups(m, '/docs/quickstart/')).toBeNull();
    expect(requiredGroups(m, '/docs/internal/x/')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/_auth/login')).toBeNull();
    expect(requiredGroups(manifest({ mode: 'private' }), '/docs/quickstart/')).toEqual([['*']]);
    expect(requiredGroups(manifest({ mode: 'private' }), '/docs/_next/static/x.js')).toBeNull();
  });
  it('resolves groups from email, domain and IdP groups', () => {
    const m = manifest();
    expect(resolveGroups(m, 'Ada@ACME.com')).toEqual(['staff']);
    expect(resolveGroups(m, 'pat@partner.io')).toEqual(['partners']);
    expect(resolveGroups(m, 'x@other.io', ['partner-devs'])).toEqual(['partners']);
    expect(resolveGroups(m, 'x@other.io')).toEqual([]);
  });
  it('allows by group', () => {
    const u = { email: 'a@acme.com', groups: ['staff'], provider: 'x' };
    expect(isAllowed(u, ['staff'])).toBe(true);
    expect(isAllowed(u, ['partners'])).toBe(false);
    expect(isAllowed(u, ['*'])).toBe(true);
    expect(isAllowed(undefined, ['*'])).toBe(false);
    expect(isAllowed(undefined, null)).toBe(true);
  });
  it('only group members can sign in to private docs', () => {
    expect(canSignIn(manifest({ mode: 'private' }), [])).toBe(false);
    expect(canSignIn(manifest({ mode: 'private' }), ['staff'])).toBe(true);
    expect(canSignIn(manifest({ mode: 'public' }), [])).toBe(true);
  });
});

describe('sessions', () => {
  it('round-trips and rejects tampering', async () => {
    const token = await signSession({ email: 'a@acme.com', groups: ['staff'], provider: 'okta' }, SECRET, 1);
    expect((await verifySession(token, SECRET))?.email).toBe('a@acme.com');
    expect(await verifySession(token, 'y'.repeat(40))).toBeUndefined();
    expect(await verifySession(`${token}x`, SECRET)).toBeUndefined();
  });
});

describe('buildManifest', () => {
  const input = (rules: Array<{ path: string; groups: string[] }>, apis: ManifestInput['apis'] = [], mode: 'public' | 'private' = 'public'): ManifestInput => ({
    site: { title: 'Acme' },
    theme: {},
    output: { basePath: '' },
    client: { enabled: true },
    apis,
    access: { mode, groups: manifest().groups, rules, providers: [], session: { secretEnv: 'S', maxAgeHours: 1 }, loginPage: {} },
  });

  it('collects config rules first-match, and frontmatter and API groups as constraints', () => {
    const m = buildManifest(input([{ path: '/beta/*', groups: ['partners'] }], [{ id: 'public' }, { id: 'admin', access: ['staff'] }]), [
      { url: '/internal/runbook', slugs: ['internal', 'runbook'], groups: ['staff'] },
    ])!;
    expect(m.rules.map((r) => `${r.pattern}=${r.groups.join('|')}`)).toEqual([
      '/orbitdocs-access.json=__never__',
      '/orbitdocs-ai.json=__never__',
      '/md/beta/*=partners',
      '/beta/*=partners',
    ]);
    expect(m.constraints!.map((r) => `${r.pattern}=${r.groups.join('|')}`)).toEqual([
      '/internal/runbook=staff',
      '/md/internal/runbook/content.md=staff',
      '/reference/admin/*=staff',
      '/openapi/admin.json=staff',
      '/reference-samples/admin.json=staff',
    ]);
  });

  it('maps each rule pattern to the Markdown copies of the pages it matches', () => {
    expect(markdownPattern('/internal/*')).toBe('/md/internal/*');
    expect(markdownPattern('/internal*')).toBe('/md/internal*');
    expect(markdownPattern('/changelog')).toBe('/md/changelog/content.md');
    expect(markdownPattern('/changelog/')).toBe('/md/changelog/content.md');
    expect(markdownPattern('/*')).toBe('/md/*');
    expect(markdownPattern('/')).toBe('/md/content.md');
  });

  it('gates the Markdown copy of a page restricted only by a config rule, exactly like the page', () => {
    const m = buildManifest(
      input([
        { path: '/internal/secret', groups: ['staff'] },
        { path: '/internal/*', groups: ['staff', 'partners'] },
        { path: '/beta*', groups: ['partners'] },
        { path: '/changelog', groups: ['*'] },
      ]),
    )!;
    const pages = ['/internal', '/internal/runbook', '/internal/secret', '/internal/a/b', '/beta', '/beta-tools/x', '/changelog', '/quickstart', '/', '/internals'];
    for (const page of pages) {
      const md = page === '/' ? '/md/content.md' : `/md${page}/content.md`;
      expect(requiredGroups(m, md), md).toEqual(requiredGroups(m, page));
    }
    expect(requiredGroups(m, '/md/internal/runbook/content.md')).toEqual([['partners', 'staff']]);
    expect(requiredGroups(m, '/md/internal/secret/content.md')).toEqual([['staff']]);
    expect(requiredGroups(m, '/md/internal/content.md')).toEqual([['partners', 'staff']]);
    expect(requiredGroups(m, '/md/quickstart/content.md')).toBeNull();
  });

  it('stricter wins: a broad `*` rule does not loosen `[staff]` frontmatter, page and Markdown copy alike', () => {
    const m = buildManifest(input([{ path: '/guides/*', groups: ['*'] }]), [{ url: '/guides/admin', slugs: ['guides', 'admin'], groups: ['staff'] }])!;
    expect(requiredGroups(m, '/guides/admin')).toEqual([['staff']]);
    expect(requiredGroups(m, '/md/guides/admin/content.md')).toEqual([['staff']]);
    expect(requiredGroups(m, '/guides/other')).toEqual([['*']]);
    const staff = { email: 'a@acme.com', groups: ['staff'], provider: 'x' };
    const pat = { email: 'pat@partner.io', groups: ['partners'], provider: 'x' };
    expect(isAllowed(staff, requiredGroups(m, '/guides/admin'))).toBe(true);
    expect(isAllowed(pat, requiredGroups(m, '/guides/admin'))).toBe(false);
    expect(isAllowed(pat, requiredGroups(m, '/guides/other'))).toBe(true);
  });

  it('stricter wins: frontmatter `*` under a `[staff]` rule stays staff only', () => {
    const m = buildManifest(input([{ path: '/internal/*', groups: ['staff'] }]), [{ url: '/internal/faq', slugs: ['internal', 'faq'], groups: ['*'] }])!;
    expect(requiredGroups(m, '/internal/faq')).toEqual([['staff']]);
    expect(requiredGroups(m, '/md/internal/faq/content.md')).toEqual([['staff']]);
  });

  it('needs both lists when neither contains the other', () => {
    const m = buildManifest(input([{ path: '/beta/*', groups: ['staff', 'partners'] }]), [{ url: '/beta/x', slugs: ['beta', 'x'], groups: ['staff', 'beta'] }])!;
    expect(requiredGroups(m, '/beta/x')).toEqual([['beta', 'staff'], ['partners', 'staff']]);
    const req = requiredGroups(m, '/beta/x');
    expect(isAllowed({ email: 'a@acme.com', groups: ['staff'], provider: 'x' }, req)).toBe(true);
    expect(isAllowed({ email: 'p@x.io', groups: ['partners'], provider: 'x' }, req)).toBe(false);
    expect(isAllowed({ email: 'p@x.io', groups: ['partners', 'beta'], provider: 'x' }, req)).toBe(true);
  });

  it('keeps config rule order among config rules (first match)', () => {
    const m = buildManifest(input([
      { path: '/internal/open', groups: ['*'] },
      { path: '/internal/*', groups: ['staff'] },
    ]))!;
    expect(requiredGroups(m, '/internal/open')).toEqual([['*']]);
    expect(requiredGroups(m, '/internal/other')).toEqual([['staff']]);
  });

  it('a config rule does not loosen apis[].access', () => {
    const m = buildManifest(input([{ path: '/reference/*', groups: ['*'] }], [{ id: 'admin', access: ['staff'] }]))!;
    expect(requiredGroups(m, '/reference/admin/delete-user/')).toEqual([['staff']]);
    expect(requiredGroups(m, '/openapi/admin.json')).toEqual([['staff']]);
  });

  it('a folder index page restricted by frontmatter only gates itself and its copy', () => {
    const m = buildManifest(input([]), [{ url: '/internal', slugs: ['internal'], groups: ['staff'] }])!;
    expect(requiredGroups(m, '/internal')).toEqual([['staff']]);
    expect(requiredGroups(m, '/md/internal/content.md')).toEqual([['staff']]);
    expect(requiredGroups(m, '/internal/runbook')).toBeNull();
    expect(requiredGroups(m, '/md/internal/runbook/content.md')).toBeNull();
  });

  it('gates the spec, code samples and client of an API restricted by a config rule', () => {
    const m = buildManifest(input([{ path: '/reference/admin/*', groups: ['staff'] }], [{ id: 'public' }, { id: 'admin' }]))!;
    expect(requiredGroups(m, '/reference/admin/delete-user/')).toEqual([['staff']]);
    expect(requiredGroups(m, '/openapi/admin.json')).toEqual([['staff']]);
    expect(requiredGroups(m, '/reference-samples/admin.json')).toEqual([['staff']]);
    // The client page is public: it holds only public operations (restricted ones are in its variants).
    expect(requiredGroups(m, '/client/')).toBeNull();
    expect(requiredGroups(m, '/openapi/public.json')).toBeNull();
  });

  it('leaves the client public when no API is restricted', () => {
    const m = buildManifest(input([{ path: '/internal/*', groups: ['staff'] }], [{ id: 'public' }]))!;
    expect(requiredGroups(m, '/client/')).toBeNull();
    expect(requiredGroups(m, '/openapi/public.json')).toBeNull();
  });
});

describe('requirements', () => {
  it('simplifies: `*` is implied by any group, a list implied by another is dropped', () => {
    expect(requirement(['*'], ['staff'])).toEqual([['staff']]);
    expect(requirement(['staff'], ['*'])).toEqual([['staff']]);
    expect(requirement(['staff', 'partners'], ['staff'])).toEqual([['staff']]);
    expect(requirement(['staff', '*'])).toEqual([['*']]);
    expect(requirement(null, undefined, [])).toBeNull();
    expect(requirement([['b'], ['a']], ['a'])).toEqual([['a'], ['b']]);
  });
  it('implies', () => {
    expect(implies([['staff']], [['*']])).toBe(true);
    expect(implies([['*']], [['staff']])).toBe(false);
    expect(implies([['staff']], [['partners', 'staff']])).toBe(true);
    expect(implies(null, [['*']])).toBe(false);
    expect(implies(null, null)).toBe(true);
    expect(implies([['staff'], ['beta']], [['beta']])).toBe(true);
  });
});

describe('variants', () => {
  const staff = { email: 'a@acme.com', groups: ['staff'], provider: 'x' };
  const pat = { email: 'pat@partner.io', groups: ['partners'], provider: 'x' };
  const both = { email: 'b@acme.com', groups: ['staff', 'partners'], provider: 'x' };
  const anyone = { email: 'x@other.io', groups: [], provider: 'x' };

  it('plans nothing when no item is stricter than the file', () => {
    expect(planVariants(null, [{ id: 'a', requires: null }], 'v').options).toEqual([]);
    expect(planVariants([['staff']], [{ id: 'a', requires: [['staff']] }], 'v').options).toEqual([]);
  });

  it('plans one option per combination a reader can be in, most complete first', () => {
    const plan = planVariants(
      null,
      [
        { id: 'list', requires: null },
        { id: 'me', requires: [['*']] },
        { id: 'delete', requires: [['staff']] },
        { id: 'deals', requires: [['partners']] },
      ],
      'v',
    );
    expect(plan.base).toEqual(['list']);
    // {*}, {*, staff}, {*, partners}, {*, staff, partners}; never {staff} without {*}.
    expect(plan.options.map((o) => [o.key, o.items.join(',')])).toEqual([
      ['v1', 'list,me,delete,deals'],
      ['v2', 'list,me,deals'],
      ['v3', 'list,me,delete'],
      ['v4', 'list,me'],
    ]);
    const pick = (u: typeof staff | undefined) => plan.options.find((o) => isAllowed(u, o.requires))?.key;
    expect(pick(both)).toBe('v1');
    expect(pick(pat)).toBe('v2');
    expect(pick(staff)).toBe('v3');
    expect(pick(anyone)).toBe('v4');
    expect(pick(undefined)).toBeUndefined();
  });

  it('fails when there are too many combinations', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `op${i}`, requires: [[`g${i}`]] }));
    expect(() => planVariants(null, items, 'v')).toThrow(/at most 16/);
  });

  const m = manifest({
    rules: [{ pattern: '/reference/public/delete-user', groups: ['staff'] }],
    constraints: [{ pattern: '/internal/runbook', groups: ['staff'] }],
    variants: [
      {
        scope: 'api:public',
        options: [{ key: 'v1', requires: [['staff']] }],
        routes: [
          { from: '/reference/public', to: '/reference/public~{key}' },
          { from: '/openapi/public.json', to: '/openapi/public~{key}.json' },
        ],
      },
      { scope: 'guides', options: [{ key: 'g1', requires: [['staff']] }], routes: [{ from: '', to: '/~/{key}', paths: ['/', '/quickstart', '/internal/runbook'] }] },
      { scope: 'client', options: [{ key: 'c1', requires: [['staff']] }], routes: [{ from: '/client', to: '/client/{key}', paths: ['/client'] }] },
    ],
  });

  it('gates each variant like its canonical file plus the option', () => {
    expect(requiredGroups(m, '/docs/openapi/public.json')).toBeNull();
    expect(requiredGroups(m, '/docs/openapi/public~v1.json')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/reference/public~v1/sections/users.json')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/~/g1/quickstart/index.txt')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/~/g1/')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/client/c1/')).toEqual([['staff']]);
    expect(requiredGroups(m, '/docs/client/')).toBeNull();
  });

  it('serves each reader the variant they may open, keeping suffixes and leaving bare URLs to the redirect', () => {
    expect(variantPathname(m, staff, '/docs/openapi/public.json')).toBe('/docs/openapi/public~v1.json');
    expect(variantPathname(m, pat, '/docs/openapi/public.json')).toBeUndefined();
    expect(variantPathname(m, undefined, '/docs/openapi/public.json')).toBeUndefined();
    expect(variantPathname(m, staff, '/docs/reference/public/list-pets/')).toBe('/docs/reference/public~v1/list-pets/');
    expect(variantPathname(m, staff, '/docs/reference/public/sections/users.json')).toBe('/docs/reference/public~v1/sections/users.json');
    expect(variantPathname(m, staff, '/docs/quickstart/')).toBe('/docs/~/g1/quickstart/');
    expect(variantPathname(m, staff, '/docs/quickstart/__next._full.txt')).toBe('/docs/~/g1/quickstart/__next._full.txt');
    expect(variantPathname(m, staff, '/docs/')).toBe('/docs/~/g1/');
    expect(variantPathname(m, staff, '/docs/quickstart')).toBeUndefined();
    expect(variantPathname(m, staff, '/docs/payments/')).toBeUndefined();
    expect(variantPathname(m, staff, '/docs/client/')).toBe('/docs/client/c1/');
    expect(variantPathname(m, staff, '/docs/client/c1/')).toBeUndefined();
    expect(variantPathname(m, staff, '/docs/~/g1/quickstart/')).toBeUndefined();
    expect(variesByReader(m, '/docs/quickstart/')).toBe(true);
    expect(variesByReader(m, '/docs/~/g1/quickstart/')).toBe(true);
    expect(variesByReader(m, '/docs/payments/')).toBe(false);
  });

  it('the gate rewrites for allowed readers only', async () => {
    const auth = createAuth({ manifest: m, env: { SECRET } });
    const cookie = async (u: typeof staff) => `od_session=${await signSession(u, SECRET, 1)}`;
    const req = async (path: string, u?: typeof staff) => new Request(`http://localhost${path}`, { headers: u ? { cookie: await cookie(u) } : {} });
    const anon = await auth.gate(await req('/docs/openapi/public.json'));
    expect(anon).toEqual({ allowed: true, user: undefined, varies: true });
    const s = await auth.gate(await req('/docs/openapi/public.json', staff));
    expect(s.allowed && s.rewrite).toBe('/docs/openapi/public~v1.json');
    const direct = await auth.gate(await req('/docs/openapi/public~v1.json', pat));
    expect(direct.allowed).toBe(false);
    const runbook = await auth.gate(await req('/docs/internal/runbook/', staff));
    expect(runbook.allowed && runbook.rewrite).toBe('/docs/~/g1/internal/runbook/');
  });
});

describe('sign-in presets', () => {
  const base = { clientId: 'docs', clientSecretEnv: 'S' };
  it('derives each issuer', () => {
    expect(resolveProvider({ type: 'google', ...base }).issuer).toBe('https://accounts.google.com');
    expect(resolveProvider({ type: 'microsoft', tenantId: 't-1', ...base }).issuer).toBe('https://login.microsoftonline.com/t-1/v2.0');
    expect(resolveProvider({ type: 'okta', domain: 'acme.okta.com', ...base }).issuer).toBe('https://acme.okta.com');
    expect(resolveProvider({ type: 'okta', domain: 'https://acme.okta.com/', authorizationServer: 'default', ...base }).issuer).toBe('https://acme.okta.com/oauth2/default');
    expect(resolveProvider({ type: 'auth0', domain: 'acme.us.auth0.com', ...base }).issuer).toBe('https://acme.us.auth0.com/');
    expect(resolveProvider({ type: 'clerk', domain: 'clerk.acme.com', ...base }).issuer).toBe('https://clerk.acme.com');
    expect(resolveProvider({ type: 'keycloak', url: 'https://auth.acme.com/', realm: 'docs', ...base }).issuer).toBe('https://auth.acme.com/realms/docs');
  });
  it('names, ids and Google hosted domain', () => {
    const g = resolveProvider({ type: 'google', hostedDomain: 'acme.com', ...base });
    expect(g).toMatchObject({ id: 'google', name: 'Google', brand: 'google', authParams: { hd: 'acme.com' }, hostedDomain: 'acme.com' });
    expect(resolveProvider({ type: 'microsoft', tenantId: 't', id: 'entra', name: 'Acme SSO', ...base })).toMatchObject({ id: 'entra', name: 'Acme SSO' });
  });
});

describe('OIDC sign-in (mock IdP)', () => {
  const idp = new OAuth2Server();
  let issuer = '';
  beforeAll(async () => {
    await idp.issuer.keys.generate('RS256');
    await idp.start(0, '127.0.0.1');
    issuer = idp.issuer.url!;
  });
  afterAll(() => idp.stop());

  const setup = (email: string, idpGroups: string[] = []) => {
    idp.service.removeAllListeners('beforeTokenSigning');
    idp.service.on('beforeTokenSigning', (token) => {
      token.payload.email = email;
      token.payload.name = 'Ada';
      token.payload.groups = idpGroups;
    });
    return createAuth({
      manifest: manifest({
        mode: 'private',
        providers: [resolveProvider({ type: 'okta', id: 'okta', domain: 'acme.okta.com', issuer, clientId: 'docs', clientSecretEnv: 'OKTA_SECRET' })],
      }),
      env: { SECRET, OKTA_SECRET: 'shh' },
    });
  };

  /** Follows start → IdP authorize → callback, returning the final response. */
  async function signIn(auth: ReturnType<typeof createAuth>, next = '/docs/internal/runbook/') {
    const start = await auth.handle(new Request(`http://docs.test/docs/_auth/start/okta?next=${encodeURIComponent(next)}`));
    expect(start?.status).toBe(302);
    const flowCookie = start!.headers.getSetCookie()[0]!.split(';')[0]!;
    const idpRes = await fetch(start!.headers.get('location')!, { redirect: 'manual' });
    const callback = idpRes.headers.get('location')!;
    expect(callback).toContain('/docs/_auth/callback/okta?code=');
    return (await auth.handle(new Request(callback.replace(/^http:\/\/[^/]+/, 'http://docs.test'), { headers: { cookie: flowCookie } })))!;
  }

  it('signs in a staff member and opens gated pages', async () => {
    const auth = setup('ada@acme.com');
    const done = await signIn(auth);
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe('/docs/internal/runbook/');
    const session = done.headers.getSetCookie().find((c) => c.startsWith('od_session='))!.split(';')[0]!;
    const page = new Request('http://docs.test/docs/internal/runbook/', { headers: { cookie: session, accept: 'text/html' } });
    expect((await auth.gate(page)).allowed).toBe(true);
    const me = await auth.handle(new Request('http://docs.test/docs/_auth/me', { headers: { cookie: session } }));
    expect(await me!.json()).toMatchObject({ user: { email: 'ada@acme.com', groups: ['staff'] } });
  });

  it('maps IdP groups and denies pages outside them', async () => {
    const auth = setup('pat@else.io', ['partner-devs']);
    const done = await signIn(auth, '/docs/reference/admin/');
    const session = done.headers.getSetCookie().find((c) => c.startsWith('od_session='))!.split(';')[0]!;
    expect((await auth.gate(new Request('http://docs.test/docs/reference/admin/x/', { headers: { cookie: session } }))).allowed).toBe(true);
    const denied = await auth.gate(new Request('http://docs.test/docs/internal/runbook/', { headers: { cookie: session, accept: 'text/html' } }));
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.response.status).toBe(403);
  });

  it('refuses people outside every group in private mode', async () => {
    const auth = setup('mallory@evil.io');
    const done = await signIn(auth);
    expect(done.status).toBe(403);
    expect(await done.text()).toContain('have access to these docs');
  });

  it('sends anonymous readers to the login page, and data requests get 401', async () => {
    const auth = setup('ada@acme.com');
    const page = await auth.gate(new Request('http://docs.test/docs/quickstart/', { headers: { accept: 'text/html' } }));
    expect(!page.allowed && page.response.headers.get('location')).toBe('/docs/_auth/login?next=%2Fdocs%2Fquickstart%2F');
    const data = await auth.gate(new Request('http://docs.test/docs/api/search'));
    expect(!data.allowed && data.response.status).toBe(401);
  });

  it('rejects open redirects', async () => {
    const auth = setup('ada@acme.com');
    const done = await signIn(auth, 'https://evil.example/steal');
    expect(done.headers.get('location')).toBe('/docs/');
  });

  it('Google: only accepts the hosted domain', async () => {
    const google = (hd?: string) => {
      idp.service.removeAllListeners('beforeTokenSigning');
      idp.service.on('beforeTokenSigning', (token) => {
        token.payload.email = 'ada@acme.com';
        if (hd) token.payload.hd = hd;
      });
      return createAuth({
        manifest: manifest({ mode: 'private', providers: [resolveProvider({ type: 'google', id: 'okta', hostedDomain: 'acme.com', issuer, clientId: 'docs', clientSecretEnv: 'OKTA_SECRET' })] }),
        env: { SECRET, OKTA_SECRET: 'shh' },
      });
    };
    const start = await google().handle(new Request('http://docs.test/docs/_auth/start/okta'));
    expect(new URL(start!.headers.get('location')!).searchParams.get('hd')).toBe('acme.com');
    expect((await signIn(google('gmail.com'))).status).toBe(403);
    expect((await signIn(google('acme.com'))).status).toBe(302);
  });
});

describe('app sessions', () => {
  let server: Server;
  let origin = '';
  let sign: (claims: Record<string, unknown>, opts?: { issuer?: string; audience?: string; kid?: string }) => Promise<string>;
  let signFirebase: (claims: Record<string, unknown>, issuer: string) => Promise<string>;
  let firebaseCert = '';

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    // Firebase publishes X.509 certificates: make a self-signed one.
    const dir = mkdtempSync(join(tmpdir(), 'od-fb-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=fb'], { stdio: 'ignore' });
    firebaseCert = readFileSync(join(dir, 'c.pem'), 'utf8');
    const fbKey = await importPKCS8(readFileSync(join(dir, 'k.pem'), 'utf8'), 'RS256');

    server = createServer((req, res) => {
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url === '/auth/v1/.well-known/jwks.json' || req.url === '/.well-known/jwks.json') return json(200, { keys: [jwk] });
      if (req.url === '/fb/keys') return json(200, { fb1: firebaseCert });
      if (req.url === '/v1/account') {
        if (req.headers['x-appwrite-project'] === 'p1' && req.headers['x-appwrite-session'] === 'good-secret') {
          return json(200, { email: 'ann@acme.com', name: 'Ann', labels: ['partner-devs'] });
        }
        return json(401, { message: 'unauthorized' });
      }
      json(404, {});
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    sign = (claims, o = {}) => {
      let jwt = new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: o.kid ?? 'k1' }).setIssuedAt().setExpirationTime('1h').setSubject('user_1');
      if (o.issuer) jwt = jwt.setIssuer(o.issuer);
      if (o.audience) jwt = jwt.setAudience(o.audience);
      return jwt.sign(privateKey);
    };
    signFirebase = (claims, issuer) =>
      new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'fb1' }).setIssuedAt().setExpirationTime('1h').setIssuer(issuer).setAudience('proj').setSubject('u').sign(fbKey);
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const appAuth = (appSession: AccessManifest['appSession']) =>
    createAuth({
      manifest: manifest({ mode: 'private', appSession }),
      env: { SECRET },
      firebaseKeys: { session: `${origin}/fb/keys`, id: `${origin}/fb/keys` },
    });
  const page = (cookie: string) => new Request('http://docs.test/docs/internal/runbook/', { headers: { cookie, accept: 'text/html' } });

  it('reads default cookie names and Supabase token formats', () => {
    expect(appCookieName({ type: 'supabase', projectUrl: 'https://abcd.supabase.co', loginUrl: 'x', returnParam: 'r' })).toBe('sb-abcd-auth-token');
    expect(appCookieName({ type: 'appwrite', endpoint: 'x', projectId: 'P1', loginUrl: 'x', returnParam: 'r' })).toBe('a_session_p1');
    const json = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r' });
    expect(supabaseAccessToken(`base64-${Buffer.from(json).toString('base64url')}`)).toBe('a.b.c');
    expect(supabaseAccessToken(json)).toBe('a.b.c');
    expect(supabaseAccessToken('["a.b.c","r"]')).toBe('a.b.c');
  });

  it('Supabase: verifies the session against the project keys, chunked cookies included', async () => {
    const auth = appAuth({ type: 'supabase', projectUrl: origin, cookie: 'sb-t-auth-token', loginUrl: 'https://app.acme.com/login', returnParam: 'redirect_to' });
    const token = await sign({ email: 'ada@acme.com', app_metadata: { groups: [] } }, { issuer: `${origin}/auth/v1`, audience: 'authenticated' });
    const value = `base64-${Buffer.from(JSON.stringify({ access_token: token })).toString('base64url')}`;
    expect((await auth.gate(page(`sb-t-auth-token=${value}`))).allowed).toBe(true);
    const half = Math.floor(value.length / 2);
    expect((await auth.gate(page(`sb-t-auth-token.0=${value.slice(0, half)}; sb-t-auth-token.1=${value.slice(half)}`))).allowed).toBe(true);
    // Wrong issuer: someone else's project.
    const other = await sign({ email: 'ada@acme.com' }, { issuer: 'https://evil.supabase.co/auth/v1', audience: 'authenticated' });
    expect((await auth.gate(page(`sb-t-auth-token=${other}`))).allowed).toBe(false);
  });

  it('Clerk: verifies __session and maps groups', async () => {
    const auth = appAuth({ type: 'clerk', domain: origin.replace('http://', ''), loginUrl: 'https://app.acme.com/sign-in', returnParam: 'redirect_url' });
    const token = await sign({ email: 'pat@else.io', groups: ['partner-devs'] }, { issuer: origin });
    const cookie = `__session=${token}`;
    expect((await auth.gate(new Request('http://docs.test/docs/reference/admin/x/', { headers: { cookie } }))).allowed).toBe(true);
    const denied = await auth.gate(page(cookie));
    expect(!denied.allowed && denied.response.status).toBe(403);
  });

  it('Firebase: accepts ID tokens and session cookies of the project', async () => {
    const auth = appAuth({ type: 'firebase', projectId: 'proj', loginUrl: 'https://app.acme.com/login', returnParam: 'redirect_to' });
    const id = await signFirebase({ email: 'ada@acme.com', email_verified: true }, 'https://securetoken.google.com/proj');
    expect((await auth.gate(page(`__session=${id}`))).allowed).toBe(true);
    const session = await signFirebase({ email: 'bob@acme.com', email_verified: true }, 'https://session.firebase.google.com/proj');
    expect((await auth.gate(page(`__session=${session}`))).allowed).toBe(true);
    const unverified = await signFirebase({ email: 'eve@acme.com', email_verified: false }, 'https://securetoken.google.com/proj');
    expect((await auth.gate(page(`__session=${unverified}`))).allowed).toBe(false);
  });

  it('Appwrite: asks Appwrite who the session belongs to; labels are groups', async () => {
    const auth = appAuth({ type: 'appwrite', endpoint: `${origin}/v1`, projectId: 'p1', loginUrl: 'https://app.acme.com/login', returnParam: 'redirect_to' });
    expect((await auth.gate(new Request('http://docs.test/docs/reference/admin/x/', { headers: { cookie: 'a_session_p1=good-secret' } }))).allowed).toBe(true);
    expect((await auth.gate(new Request('http://docs.test/docs/reference/admin/x/', { headers: { cookie: 'a_session_p1=bad' } }))).allowed).toBe(false);
  });

  it('login hands off to the product and comes back; sign-out ends in the product', async () => {
    const appSession = { type: 'clerk' as const, domain: origin.replace('http://', ''), loginUrl: 'https://app.acme.com/sign-in', returnParam: 'redirect_url', logoutUrl: 'https://app.acme.com/sign-out' };
    const auth = appAuth(appSession);
    const login = await auth.handle(new Request('http://docs.test/docs/_auth/login?next=%2Fdocs%2Finternal%2F'));
    expect(await login!.text()).toContain('Continue with Acme account');
    const go = await auth.handle(new Request('https://docs.acme.com/docs/_auth/app?next=%2Fdocs%2Finternal%2F'));
    expect(go!.headers.get('location')).toBe('https://app.acme.com/sign-in?redirect_url=https%3A%2F%2Fdocs.acme.com%2Fdocs%2Finternal%2F');
    const cookie = `__session=${await sign({ email: 'ada@acme.com' }, { issuer: origin })}`;
    const back = await auth.handle(new Request('http://docs.test/docs/_auth/login?next=%2Fdocs%2Finternal%2F', { headers: { cookie } }));
    expect(back!.headers.get('location')).toBe('/docs/internal/');
    const out = await auth.handle(new Request('http://docs.test/docs/_auth/logout', { headers: { cookie } }));
    expect(out!.headers.get('location')).toBe('https://app.acme.com/sign-out');
  });
});

describe('login page icons', () => {
  it('renders react-icons as SVG markup without react-dom', async () => {
    const { iconHtml } = await import('./icon-html');
    const { SiGoogle } = await import('react-icons/si');
    const { LuKeyRound } = await import('react-icons/lu');
    const google = iconHtml(SiGoogle);
    expect(google).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*width="18"/);
    expect(google).toContain('<path d="M12.48');
    const key = iconHtml(LuKeyRound, 16);
    expect(key).toContain('stroke-width="2"');
    expect(key).toContain('stroke-linecap="round"');
  });
});

describe('site logo and icons on the sign-in pages', () => {
  const site = (logo?: ManifestInput['site']['logo'], mode: 'public' | 'private' = 'private') =>
    buildManifest({
      site: { title: 'Orbit & Co', logo },
      theme: {},
      output: { basePath: '/docs' },
      client: { enabled: true },
      apis: [],
      access: { mode, groups: {}, rules: [], providers: [], session: { secretEnv: 'S', maxAgeHours: 1 }, loginPage: {} },
    })!;

  it('puts the logo (base path added to local paths) and icons in the manifest', () => {
    expect(site({ light: '/logo-light.png', dark: 'https://cdn.example/dark.png' }).site).toMatchObject({
      logo: { light: '/docs/logo-light.png', dark: 'https://cdn.example/dark.png' },
      icon: '/docs/icon.png',
      appleIcon: '/docs/apple-icon.png',
    });
    expect(site('/logo.svg').site.logo).toEqual({ light: '/docs/logo.svg', dark: '/docs/logo.svg' });
    expect(site().site.logo).toBeUndefined();
  });

  it('renders the light and dark logo, the favicon and touch icon, and no raw SVG of its own', async () => {
    const { deniedPage, loginPage } = await import('./pages');
    const page = loginPage(site({ light: '/logo-light.png', dark: '/logo-dark.png' }), { base: '/docs', next: '/docs/' });
    expect(page).toContain('<link rel="icon" href="/docs/icon.png">');
    expect(page).toContain('<link rel="apple-touch-icon" href="/docs/apple-icon.png">');
    expect(page).toContain('<img class="light" src="/docs/logo-light.png" alt="Orbit &amp; Co">');
    expect(page).toContain('<img class="dark" src="/docs/logo-dark.png" alt="Orbit &amp; Co">');
    expect(page).toContain('prefers-color-scheme:dark){.site .light{display:none}');
    expect(deniedPage(site('/logo.svg'), { base: '/docs', email: 'a@b.c' })).toContain('<div class="site"><img src="/docs/logo.svg" alt="Orbit &amp; Co"></div>');
    // Without a logo: the title.
    expect(loginPage(site(), { base: '/docs', next: '/docs/' })).toContain('<div class="site">Orbit &amp; Co</div>');
  });

  it('serves the logo and icons to signed-out readers, even in private mode', () => {
    const m = site({ light: '/logo-light.png', dark: '/logo-dark.png' });
    expect(requiredGroups(m, '/docs/logo-light.png')).toBeNull();
    expect(requiredGroups(m, '/docs/logo-dark.png')).toBeNull();
    expect(requiredGroups(m, '/docs/icon.png')).toBeNull();
    expect(requiredGroups(m, '/docs/apple-icon.png')).toBeNull();
    expect(requiredGroups(m, '/docs/other.png')).toEqual([['*']]);
  });
});
