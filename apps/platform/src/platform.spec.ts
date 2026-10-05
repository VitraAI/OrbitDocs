import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AiManifest, createAi } from '@vitra-ai/orbitdocs-ai';
import { type AccessManifest, createAuth } from '@vitra-ai/orbitdocs-auth';
import { afterAll, describe, expect, it } from 'vitest';

import { decrypt, encrypt, hashPassword, verifyPassword } from './crypto';
import type { GitSettings } from './db/schema';
import { parseWebhook, previewComment, redactor } from './git/git.service';
import { autoInstall, buildEnv, cloneUrl, gitAuthEnv, repoWebUrl } from './git/repo';
import { guardedFetch, isBlockedAddress, parseOutboundAllow } from './hosting/outbound';
import { applyEnvChanges, hostedAccess, hostedSiteEnv, siteEnvNames } from './hosting/site-env';

const git = (provider: 'github' | 'gitlab'): GitSettings => ({
  provider,
  repo: 'acme/docs',
  branch: 'main',
  apiUrl: provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com/api/v4',
  webhookSecret: 'shh-secret',
  docsDir: 'docs',
  installCommand: '',
  buildCommand: 'npx orbitdocs build',
  outputDir: 'out',
});

const raw = (o: unknown) => Buffer.from(JSON.stringify(o));
const sha = 'a'.repeat(40);

describe('webhooks', () => {
  it('GitLab: checks the token and reads pushes and merge requests', () => {
    const push = raw({ ref: 'refs/heads/main', after: sha, checkout_sha: sha, commits: [{ message: 'Docs' }] });
    expect(() => parseWebhook(git('gitlab'), { 'x-gitlab-event': 'Push Hook', 'x-gitlab-token': 'wrong' }, push)).toThrow(/X-Gitlab-Token/);
    expect(parseWebhook(git('gitlab'), { 'x-gitlab-event': 'Push Hook', 'x-gitlab-token': 'shh-secret' }, push)).toEqual({ type: 'push', branch: 'main', commit: sha, message: 'Docs' });
    const mr = (action: string, extra = {}) =>
      parseWebhook(git('gitlab'), { 'x-gitlab-event': 'Merge Request Hook', 'x-gitlab-token': 'shh-secret' }, raw({ object_attributes: { iid: 7, action, source_branch: 'feat', last_commit: { id: sha }, title: 'T', ...extra } }));
    expect(mr('open')).toMatchObject({ type: 'request', action: 'open', number: 7, branch: 'feat' });
    expect(mr('update')).toMatchObject({ type: 'ignore' });
    expect(mr('update', { oldrev: 'b'.repeat(40) })).toMatchObject({ type: 'request', action: 'update' });
    expect(mr('merge')).toMatchObject({ action: 'merge' });
    expect(mr('approved')).toMatchObject({ type: 'ignore' });
  });

  it('GitHub: checks the HMAC signature and reads pull requests', () => {
    const body = raw({ action: 'closed', number: 3, pull_request: { merged: true, head: { ref: 'feat', sha } } });
    const sign = (secret: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(() => parseWebhook(git('github'), { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign('nope') }, body)).toThrow(/Signature/);
    expect(parseWebhook(git('github'), { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign('shh-secret') }, body)).toMatchObject({ type: 'request', action: 'merge', number: 3 });
    const ping = raw({ zen: 'hi' });
    expect(parseWebhook(git('github'), { 'x-github-event': 'ping', 'x-hub-signature-256': `sha256=${createHmac('sha256', 'shh-secret').update(ping).digest('hex')}` }, ping)).toMatchObject({ type: 'ignore' });
  });

  it('derives clone URLs without credentials, for GitHub Enterprise too', () => {
    expect(cloneUrl(git('github'))).toBe('https://github.com/acme/docs.git');
    expect(cloneUrl(git('gitlab'))).toBe('https://gitlab.com/acme/docs.git');
    expect(cloneUrl({ ...git('gitlab'), apiUrl: 'https://git.acme.com/api/v4' })).toBe('https://git.acme.com/acme/docs.git');
    expect(cloneUrl({ ...git('gitlab'), apiUrl: 'https://acme.com/gitlab/api/v4' })).toBe('https://acme.com/gitlab/acme/docs.git');
    expect(cloneUrl({ ...git('github'), apiUrl: 'https://github.acme.com/api/v3' })).toBe('https://github.acme.com/acme/docs.git');
    expect(cloneUrl({ ...git('github'), apiUrl: 'https://api.acme.ghe.com' })).toBe('https://acme.ghe.com/acme/docs.git');
    expect(cloneUrl({ ...git('gitlab'), cloneUrl: '/srv/repos/docs.git' })).toBe('/srv/repos/docs.git');
    expect(cloneUrl({ ...git('github'), cloneUrl: 'https://mirror.acme.com/docs.git' })).toBe('https://mirror.acme.com/docs.git');
  });

  it('derives the repository page for the dashboard', () => {
    expect(repoWebUrl(git('github'))).toBe('https://github.com/acme/docs');
    expect(repoWebUrl({ ...git('github'), apiUrl: 'https://github.acme.com/api/v3' })).toBe('https://github.acme.com/acme/docs');
    expect(repoWebUrl({ ...git('gitlab'), apiUrl: 'https://git.acme.com/api/v4' })).toBe('https://git.acme.com/acme/docs');
    expect(repoWebUrl({ ...git('gitlab'), cloneUrl: 'https://u:p@git.acme.com/acme/docs.git' })).toBe('https://git.acme.com/acme/docs');
    expect(repoWebUrl({ ...git('gitlab'), cloneUrl: '/srv/repos/docs.git' })).toBeNull();
  });

  it('gives Git the token through its environment only', () => {
    const env = gitAuthEnv(git('github'), 'tok', 'https://github.com/acme/docs.git');
    expect(env).toMatchObject({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader' });
    expect(Buffer.from(env.GIT_CONFIG_VALUE_0!.replace('Authorization: Basic ', ''), 'base64').toString()).toBe('x-access-token:tok');
    expect(Buffer.from(gitAuthEnv(git('gitlab'), 'tok', 'https://gitlab.com/a/b.git').GIT_CONFIG_VALUE_0!.slice(21), 'base64').toString()).toBe('oauth2:tok');
    expect(gitAuthEnv(git('gitlab'), 'tok', '/srv/repos/docs.git')).toEqual({});
    expect(gitAuthEnv(git('gitlab'), undefined, 'https://gitlab.com/a/b.git')).toEqual({});
  });
});

describe('build environment', () => {
  const platform = { PATH: '/usr/bin:/bin', HOME: '/home/node', LANG: 'C.UTF-8', NODE_ENV: 'production', PLATFORM_SECRET: 's'.repeat(40), DATABASE_URL: 'postgres://u:p@db/x', OKTA_CLIENT_SECRET: 'okta', ADMIN_PASSWORD: 'pw', npm_config_cache: '/cache', NODE_EXTRA_CA_CERTS: '/ca.pem', HTTPS_PROXY: 'http://proxy:3128' };

  it('passes an allowlist, never the platform secrets', () => {
    const env = buildEnv(platform);
    expect(env).toEqual({ PATH: '/usr/bin:/bin', HOME: '/home/node', LANG: 'C.UTF-8', npm_config_cache: '/cache', NODE_EXTRA_CA_CERTS: '/ca.pem', HTTPS_PROXY: 'http://proxy:3128', CI: 'true', ORBITDOCS_PLATFORM_BUILD: '1', GIT_TERMINAL_PROMPT: '0' });
  });

  it('adds project variables but keeps the fixed ones', () => {
    const env = buildEnv(platform, { API_BASE: 'https://api.acme.com', NODE_ENV: 'production', CI: 'false', PATH: '/evil' });
    expect(env).toMatchObject({ API_BASE: 'https://api.acme.com', NODE_ENV: 'production', CI: 'true', PATH: '/usr/bin:/bin' });
  });

  it('is exactly what a build command sees', () => {
    const seen = execFileSync('sh', ['-c', 'env'], { env: buildEnv({ ...process.env, PLATFORM_SECRET: 'never-in-a-build' }, { DOCS_FLAG: 'on' }) }).toString();
    expect(seen).toContain('DOCS_FLAG=on');
    expect(seen).toContain('ORBITDOCS_PLATFORM_BUILD=1');
    expect(seen).not.toContain('never-in-a-build');
    expect(seen).not.toMatch(/^DATABASE_URL=/m);
  });

  it('masks tokens and variable values in the log', () => {
    const mask = redactor(['glpat-abcdef', 'short', 'sk-live-123456']);
    expect(mask('clone https://oauth2:glpat-abcdef@gitlab.com/x; key sk-live-123456; short')).toBe('clone https://***@gitlab.com/x; key ***; short');
  });
});

describe('automatic install', () => {
  const root = mkdtempSync(join(tmpdir(), 'od-install-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const repo = (name: string, files: Record<string, string>) => {
    const dir = join(root, name);
    for (const [f, content] of Object.entries(files)) {
      mkdirSync(join(dir, f, '..'), { recursive: true });
      writeFileSync(join(dir, f), content);
    }
    return dir;
  };

  it('installs the Nest app and the docs app from their lockfiles', () => {
    const dir = repo('npm', { 'package.json': '{}', 'package-lock.json': '{}', 'docs/package.json': '{}', 'docs/package-lock.json': '{}' });
    expect(autoInstall(dir, join(dir, 'docs'))).toEqual([
      ['.', 'npm ci'],
      ['docs', 'npm ci'],
    ]);
  });

  it('installs a workspace once, at its root', () => {
    const dir = repo('pnpm', { 'package.json': '{}', 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': '', 'apps/api/package.json': '{}', 'apps/api/docs/package.json': '{}' });
    expect(autoInstall(dir, join(dir, 'apps/api/docs'))).toEqual([['.', 'pnpm install --frozen-lockfile']]);
  });

  it('detects yarn, yarn berry and bun', () => {
    const yarn = repo('yarn', { 'package.json': '{}', 'yarn.lock': '', 'docs/package.json': '{}', 'docs/bun.lock': '' });
    expect(autoInstall(yarn, join(yarn, 'docs'))).toEqual([
      ['.', 'yarn install --frozen-lockfile'],
      ['docs', 'bun install --frozen-lockfile'],
    ]);
    const berry = repo('berry', { 'package.json': '{"workspaces":["docs"]}', 'yarn.lock': '', '.yarnrc.yml': '', 'docs/package.json': '{}' });
    expect(autoInstall(berry, join(berry, 'docs'))).toEqual([['.', 'yarn install --immutable']]);
  });

  it('falls back to npm install without a lockfile', () => {
    const dir = repo('none', { 'service/package.json': '{}', 'service/docs/package.json': '{}' });
    expect(autoInstall(dir, join(dir, 'service/docs'))).toEqual([
      ['service', 'npm install'],
      ['service/docs', 'npm install'],
    ]);
  });
});

describe('preview comments', () => {
  it('lists every spec with its lint counts', () => {
    const body = previewComment('a'.repeat(40), 'https://travel--pr-3.docs.acme.com/', [
      { apiId: 'payments', title: 'Payments', version: '2.0.0', revision: null, errors: 2, warnings: 1, problems: [] },
      { apiId: 'users', title: 'Users', version: '1.0.0', revision: 4, errors: 0, warnings: 0, problems: [] },
    ], true);
    expect(body).toContain('https://travel--pr-3.docs.acme.com/');
    expect(body).toContain('| `payments` v2.0.0 | ✗ 2 errors, 1 warning | changed |');
    expect(body).toContain('| `users` v1.0.0 | ✓ No problems | r4 (unchanged) |');
    expect(body).toContain('lint gate is on');
    expect(previewComment('b'.repeat(40), 'https://x/', [], false)).not.toContain('| API');
  });
});

describe('crypto', () => {
  it('hashes passwords and encrypts secrets', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
    const sealed = encrypt('glpat-secret', 'k'.repeat(40));
    expect(sealed).not.toContain('glpat');
    expect(decrypt(sealed, 'k'.repeat(40))).toBe('glpat-secret');
    expect(() => decrypt(sealed, 'z'.repeat(40))).toThrow();
  });
});

const access = (over: Partial<AccessManifest> = {}): AccessManifest => ({
  version: 2,
  basePath: '',
  site: { title: 'Docs' },
  mode: 'private',
  groups: {},
  rules: [],
  providers: [{ type: 'oidc', brand: 'okta', id: 'okta', name: 'Okta', issuer: 'https://acme.okta.com', clientId: 'docs', clientSecretEnv: 'OKTA_SECRET', scopes: ['openid'], groupsClaim: 'groups' }],
  session: { secretEnv: 'ORBITDOCS_AUTH_SECRET', maxAgeHours: 8 },
  loginPage: {},
  ...over,
});
const ai = (apiKeyEnv: string, baseUrl?: string): AiManifest => ({
  version: 1,
  basePath: '',
  site: { title: 'Docs' },
  ai: { provider: 'openai-compatible', model: 'm', apiKeyEnv, baseUrl, askAi: { enabled: true, suggestions: [], maxSources: 4 }, mcp: { docs: false, apis: false, tools: 'per-operation' } },
  pages: [{ url: '/', title: 'Home', kind: 'guide', markdown: 'Hello' }],
  apis: [],
});


describe('hosted site environment', () => {
  it('gives a site its own variables and session key, never the platform environment', () => {
    process.env.PLATFORM_SECRET_FOR_TEST = 'platform-only';
    const env = hostedSiteEnv({ OKTA_SECRET: 's1' }, access(), 'derived');
    expect(env).toEqual({ OKTA_SECRET: 's1', ORBITDOCS_AUTH_SECRET: 'derived' });
    // The derived key wins over a site variable of the same name.
    expect(hostedSiteEnv({ ORBITDOCS_AUTH_SECRET: 'mine' }, access(), 'derived').ORBITDOCS_AUTH_SECRET).toBe('derived');
    delete process.env.PLATFORM_SECRET_FOR_TEST;
  });

  it('never sends a platform secret named by a site to the site’s AI base URL', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(String(req.headers.authorization));
      res.writeHead(500).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    process.env.PLATFORM_SECRET_FOR_TEST = 'platform-only';
    try {
      const handler = createAi({ manifest: ai('PLATFORM_SECRET_FOR_TEST', `http://127.0.0.1:${port}/v1`), env: hostedSiteEnv({}, null, 'k') });
      const res = await handler.handle(new Request('http://site.test/_ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
      expect(await res!.text()).toContain('PLATFORM_SECRET_FOR_TEST is not set');
      expect(seen).toEqual([]);
    } finally {
      delete process.env.PLATFORM_SECRET_FOR_TEST;
      server.close();
    }
  });

  it('lists the variables a build reads, without the session secret', () => {
    const names = siteEnvNames(access({ personalization: { url: 'https://hook', secretEnv: 'HOOK_SECRET' }, appSession: { type: 'clerk', domain: 'c', secretKeyEnv: 'CLERK_SECRET_KEY' } as AccessManifest['appSession'] }), ai('OPENAI_API_KEY'));
    expect(names.map((n) => n.key)).toEqual(['OKTA_SECRET', 'CLERK_SECRET_KEY', 'HOOK_SECRET', 'OPENAI_API_KEY']);
    expect(siteEnvNames(access({ providers: [] }), null)).toEqual([]);
  });

  it('drops a hosted site’s audit file but keeps its webhook', () => {
    expect(hostedAccess(access({ audit: { file: '/etc/cron.d/x', webhookUrl: 'https://hook' } })).audit).toEqual({ webhookUrl: 'https://hook' });
  });

  it('validates and seals variable changes', () => {
    const seal = (v: string) => `sealed:${v}`;
    const { vars, changed } = applyEnvChanges([{ key: 'B', valueEncrypted: 'x' }], { A: '1', B: null }, { seal, max: 5, what: 'site variables' });
    expect(vars).toEqual([{ key: 'A', valueEncrypted: 'sealed:1' }]);
    expect(changed).toEqual(['+A', '-B']);
    expect(() => applyEnvChanges([], { '1BAD': 'x' }, { seal, max: 5, what: 'v' })).toThrow(/not a valid variable name/);
    expect(() => applyEnvChanges([], { PATH: 'x' }, { seal, reserved: ['PATH'], max: 5, what: 'v' })).toThrow(/set by the platform/);
    expect(() => applyEnvChanges([], { A: '1', B: '2' }, { seal, max: 1, what: 'site variables' })).toThrow('At most 1 site variables');
  });
});

describe('outbound requests of hosted sites', () => {
  /** A local server standing in for an internal service; it records every hit. */
  async function internalService() {
    const hits: string[] = [];
    const server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      if (req.url === '/to-metadata') return void res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
      if (req.url === '/to-self') return void res.writeHead(302, { location: '/ok' }).end();
      res.writeHead(200, { 'content-type': 'text/plain' }).end('internal');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return { hits, port: (server.address() as AddressInfo).port, close: () => server.close() };
  }
  /** Resolves made-up names to fixed addresses, like a hostile DNS record would. */
  const fakeDns = (table: Record<string, string>) =>
    ((host: string, _opts: unknown, cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void) => {
      const address = table[host];
      if (!address) return cb(Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' }), []);
      cb(null, [{ address, family: address.includes(':') ? 6 : 4 }]);
    }) as unknown as typeof import('node:dns').lookup;

  it('knows private, loopback, link-local and reserved addresses', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:a00:1', '64:ff9b::7f00:1'])
      expect(isBlockedAddress(a), a).toBe(true);
    for (const a of ['8.8.8.8', '93.184.215.14', '2606:4700::1111', '::ffff:8.8.8.8']) expect(isBlockedAddress(a), a).toBe(false);
  });

  it('refuses literal private addresses, localhost and the platform’s own hosts', async () => {
    const svc = await internalService();
    try {
      const f = guardedFetch({ allow: parseOutboundAllow(''), platformDomain: 'docs.acme.com' });
      await expect(f(`http://127.0.0.1:${svc.port}/`)).rejects.toThrow(/private or reserved/);
      await expect(f(`http://localhost:${svc.port}/`)).rejects.toThrow(/this machine/);
      await expect(f('https://travel.docs.acme.com/')).rejects.toThrow(/the platform itself/);
      await expect(f('file:///etc/passwd')).rejects.toThrow(/only http and https/);
      expect(svc.hits).toEqual([]);
    } finally {
      svc.close();
    }
  });

  it('checks the address a name resolves to when connecting', async () => {
    const svc = await internalService();
    try {
      const f = guardedFetch({ allow: parseOutboundAllow(''), platformDomain: 'docs.acme.com', lookup: fakeDns({ 'idp.attacker.test': '127.0.0.1' }) });
      const err = await f(`http://idp.attacker.test:${svc.port}/`).catch((e: Error) => e);
      expect(String((err as Error & { cause?: Error }).cause?.message ?? (err as Error).message)).toMatch(/resolves to 127\.0\.0\.1/);
      expect(svc.hits).toEqual([]);
    } finally {
      svc.close();
    }
  });

  it('follows redirects itself and checks every hop', async () => {
    const svc = await internalService();
    try {
      // The operator allowed this internal host; it redirects to the metadata service.
      const f = guardedFetch({ allow: parseOutboundAllow('idp.internal'), platformDomain: 'docs.acme.com', lookup: fakeDns({ 'idp.internal': '127.0.0.1' }) });
      await expect(f(`http://idp.internal:${svc.port}/to-metadata`)).rejects.toThrow(/169\.254\.169\.254/);
      const ok = await f(`http://idp.internal:${svc.port}/to-self`);
      expect([ok.status, await ok.text()]).toEqual([200, 'internal']);
      expect(svc.hits).toEqual(['GET /to-metadata', 'GET /to-self', 'GET /ok']);
    } finally {
      svc.close();
    }
  });

  it('lets SITE_OUTBOUND_ALLOW open hosts, suffixes, addresses and ranges', async () => {
    const svc = await internalService();
    try {
      for (const allow of ['127.0.0.1', '127.0.0.0/8', 'localhost', '*.corp.test']) {
        const f = guardedFetch({ allow: parseOutboundAllow(allow), platformDomain: 'docs.acme.com', lookup: fakeDns({ localhost: '127.0.0.1', 'kc.corp.test': '127.0.0.1' }) });
        const host = allow === 'localhost' ? 'localhost' : allow === '*.corp.test' ? 'kc.corp.test' : '127.0.0.1';
        expect((await f(`http://${host}:${svc.port}/`)).status, allow).toBe(200);
      }
    } finally {
      svc.close();
    }
  });

  it('stops Ask AI and SSO sign-in from reaching internal services', async () => {
    const svc = await internalService();
    try {
      const f = guardedFetch({ allow: parseOutboundAllow(''), platformDomain: 'docs.acme.com' });
      const handler = createAi({ manifest: ai('KEY', `http://127.0.0.1:${svc.port}/v1`), env: { KEY: 'k' }, fetch: f });
      const res = await handler.handle(new Request('http://site.test/_ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
      expect(await res!.text()).toContain('"type":"error"');
      // Starting SSO makes the platform fetch the issuer's discovery document.
      const providers = [{ ...access().providers[0]!, issuer: `http://127.0.0.1:${svc.port}/realms/x` }];
      const auth = createAuth({ manifest: access({ providers }), env: { OKTA_SECRET: 's', ORBITDOCS_AUTH_SECRET: 'x'.repeat(32) }, fetch: f });
      const start = await auth.handle(new Request('http://site.test/_auth/start/okta'));
      expect(start!.status).toBeGreaterThanOrEqual(400);
      expect(svc.hits).toEqual([]);
    } finally {
      svc.close();
    }
  });
});
