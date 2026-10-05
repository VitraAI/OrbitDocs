import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStaticServer, parseRedirects } from './start';

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** A static build in `<tmp>/out` (its parent holds a file the server must never reach). */
function build(files: Record<string, string>): string {
  const parent = mkdtempSync(join(tmpdir(), 'orbitdocs-start-'));
  writeFileSync(join(parent, 'secret.txt'), 'secret');
  const out = join(parent, 'out');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), body);
  }
  return out;
}

async function serve(root: string, basePath?: string) {
  const server = createStaticServer({ root, basePath });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  const { port } = server.address() as AddressInfo;
  return (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual', ...init });
}

const SITE = {
  'index.html': 'home',
  'guide/index.html': 'guide',
  'about.html': 'about',
  '404.html': 'missing',
  '_next/app.css': 'body{}',
  '_redirects': '/old /guide/ 301\n/blog/* /news/:splat 302\n',
};

describe('parseRedirects', () => {
  it('reads plain and wildcard rules, skipping comments', () => {
    expect(parseRedirects('# moved\n/old /guide/ 301\n/blog/* /news/:splat 302\n/bare /new\n')).toEqual([
      { from: '/old', to: '/guide/', status: 301, wildcard: false },
      { from: '/blog/', to: '/news/:splat', status: 302, wildcard: true },
      { from: '/bare', to: '/new', status: 301, wildcard: false },
    ]);
  });
});

describe('createStaticServer', () => {
  it('serves pages, folders and assets like a static host', async () => {
    const get = await serve(build(SITE));
    const home = await get('/');
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await home.text()).toBe('home');
    expect(await (await get('/guide/')).text()).toBe('guide');
    expect(await (await get('/about')).text()).toBe('about');
    expect((await get('/_next/app.css')).headers.get('content-type')).toBe('text/css; charset=utf-8');
    const bare = await get('/guide?tab=2');
    expect(bare.status).toBe(308);
    expect(bare.headers.get('location')).toBe('/guide/?tab=2');
  });

  it('answers unknown paths with 404.html', async () => {
    const res = await (await serve(build(SITE)))('/nope/');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('missing');
  });

  it('applies _redirects', async () => {
    const get = await serve(build(SITE));
    const old = await get('/old');
    expect([old.status, old.headers.get('location')]).toEqual([301, '/guide/']);
    const post = await get('/blog/2026/hello');
    expect([post.status, post.headers.get('location')]).toEqual([302, '/news/2026/hello']);
  });

  it('serves the site under its base path', async () => {
    const get = await serve(build(SITE), '/docs');
    expect(await (await get('/docs/')).text()).toBe('home');
    expect(await (await get('/docs/guide/')).text()).toBe('guide');
    const root = await get('/');
    expect([root.status, root.headers.get('location')]).toEqual([308, '/docs/']);
    const folder = await get('/docs/guide');
    expect([folder.status, folder.headers.get('location')]).toEqual([308, '/docs/guide/']);
    expect((await get('/guide/')).status).toBe(404);
  });

  it('never serves files outside the build', async () => {
    const res = await (await serve(build(SITE)))('/..%2fsecret.txt');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('missing');
  });

  it('answers HEAD without a body and refuses other methods', async () => {
    const get = await serve(build(SITE));
    const head = await get('/', { method: 'HEAD' });
    expect([head.status, head.headers.get('content-length'), await head.text()]).toEqual([200, '4', '']);
    const post = await get('/', { method: 'POST' });
    expect([post.status, post.headers.get('allow')]).toEqual([405, 'GET, HEAD']);
  });
});
