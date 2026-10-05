import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';

import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';

import { fail, log, resolveFrom } from '../util';
import { outDir } from './build';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

export interface RedirectRule {
  /** Path without the trailing `*` of a wildcard rule. */
  from: string;
  to: string;
  status: number;
  /** `from` ended in `*`: it matches every path below, `:splat` in `to` takes the rest. */
  wildcard: boolean;
}

/** Rules of a `_redirects` file (Netlify format: `from to status`), as `orbitdocs build` writes it. */
export function parseRedirects(text: string): RedirectRule[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .flatMap((line) => {
      const [from, to, status] = line.split(/\s+/);
      if (!from || !to) return [];
      const wildcard = from.endsWith('*');
      return [{ from: wildcard ? from.slice(0, -1) : from, to, status: Number(status) || 301, wildcard }];
    });
}

export interface StaticServerOptions {
  /** The static build to serve (`out/`). */
  root: string;
  /** `output.basePath` the build was made for, e.g. `/docs`; empty for the site root. */
  basePath?: string;
}

/**
 * Serves a static build the way the hosts `orbitdocs deploy` targets do (nginx
 * `try_files $uri $uri/ $uri.html`, Vercel's trailing slashes): `/a/` serves
 * `a/index.html`, `/a` serves `a.html` or redirects to `/a/`, `_redirects`
 * rules apply, and anything else gets `404.html` with status 404.
 */
export function createStaticServer({ root, basePath = '' }: StaticServerOptions): Server {
  const dir = resolve(root);
  const base = basePath.replace(/\/+$/, '');
  const redirectsFile = join(dir, '_redirects');
  const redirects = existsSync(redirectsFile) ? parseRedirects(readFileSync(redirectsFile, 'utf8')) : [];

  /** The file a site path points to, or undefined when it doesn't exist or leaves the build folder. */
  const fileAt = (path: string) => {
    const file = resolve(dir, `.${path}`);
    if (file !== dir && !file.startsWith(dir + sep)) return undefined;
    return existsSync(file) && statSync(file).isFile() ? file : undefined;
  };

  const send = (req: IncomingMessage, res: ServerResponse, file: string, status = 200) => {
    res.writeHead(status, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': statSync(file).size,
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  };

  const notFound = (req: IncomingMessage, res: ServerResponse) => {
    const page = fileAt('/404.html');
    if (page) send(req, res, page, 404);
    else res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  };

  return createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (path.includes('\0')) {
      res.writeHead(400).end();
      return;
    }

    // `_redirects` paths already include the base path.
    const rule = redirects.find((r) => (r.wildcard ? path.startsWith(r.from) : path === r.from));
    if (rule) {
      const location = rule.to.replace(':splat', rule.wildcard ? path.slice(rule.from.length) : '');
      res.writeHead(rule.status, { location: location + url.search }).end();
      return;
    }

    if (base && path !== base && !path.startsWith(`${base}/`)) {
      // Opening the bare host lands on the site; any other path outside it doesn't exist.
      if (path === '/') res.writeHead(308, { location: `${base}/` }).end();
      else notFound(req, res);
      return;
    }
    const sitePath = path.slice(base.length) || '/';

    const file = sitePath.endsWith('/') ? fileAt(`${sitePath}index.html`) : (fileAt(sitePath) ?? fileAt(`${sitePath}.html`));
    if (file) {
      send(req, res, file);
      return;
    }
    // A page folder asked for without its slash: send the reader to the canonical URL.
    if (!sitePath.endsWith('/') && fileAt(`${sitePath}/index.html`)) {
      res.writeHead(308, { location: `${base}${sitePath}/${url.search}` }).end();
      return;
    }
    notFound(req, res);
  });
}

/** What the last `orbitdocs build` made (`.orbitdocs/build.json`). */
function lastBuild(dir: string): { mode: 'static' | 'server'; basePath: string } | undefined {
  const file = join(dir, '.orbitdocs', 'build.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as { mode: 'static' | 'server'; basePath: string };
  } catch {
    return undefined;
  }
}

/**
 * Serves the production build: `out/` for a static build, `next start` for a
 * server build. It serves what the last `orbitdocs build` made, and says so
 * when the config has changed since.
 */
export async function start(loaded: LoadedConfig, options: { port?: string }): Promise<void> {
  const { dir, config } = loaded;
  const built = lastBuild(dir);
  const mode = built?.mode ?? config.output.mode;
  const basePath = built?.basePath ?? config.output.basePath;
  if (built && (built.mode !== config.output.mode || built.basePath !== config.output.basePath)) {
    log.warn('orbitdocs.config.ts changed output since the last build. Run `orbitdocs build` to serve the new settings.');
  }

  const portText = options.port ?? process.env.PORT;
  const port = portText === undefined ? 3000 : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`Invalid port "${portText}".`);

  if (mode === 'server') {
    if (!existsSync(join(dir, '.next', 'BUILD_ID'))) fail('No server build in .next. Run `orbitdocs build` first.');
    const next = spawn(process.execPath, [resolveFrom(dir, 'next/dist/bin/next'), 'start', '-p', String(port)], { cwd: dir, stdio: 'inherit' });
    next.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  const out = outDir(dir);
  if (!existsSync(out)) fail(`No static build in ${relative(process.cwd(), out) || out}. Run \`orbitdocs build\` first.`);
  if (config.access) {
    log.warn('Private docs are not enforced here, just like on a plain static host: every page is served. Use mountOrbitDocs (Nest) or output.mode "server" to protect them.');
  }
  const server = createStaticServer({ root: out, basePath });
  await new Promise<void>((done) => {
    server.once('error', (e: NodeJS.ErrnoException) => {
      fail(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Pick another with -p.` : e.message);
    });
    server.listen(port, () => done());
  });
  log.ok(`Serving ${relative(process.cwd(), out) || out} at http://localhost:${port}${basePath}/`);
}
