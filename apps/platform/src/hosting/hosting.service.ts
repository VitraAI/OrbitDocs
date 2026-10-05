import { createHash, createHmac } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { type AiHandler, createAi } from '@vitra-ai/orbitdocs-ai';
import { type AuthHandler, createAuth } from '@vitra-ai/orbitdocs-auth';
import { sendWebResponse, toWebRequest } from '@vitra-ai/orbitdocs-auth/express';
import { and, eq, isNull } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';

import { CONFIG, DB, type PlatformConfig } from '../config';
import { decrypt } from '../crypto';
import type { Db } from '../db';
import { analyticsEvents, deployments, domains, projects } from '../db/schema';
import { PublishService } from '../projects/publish.service';
import { guardedFetch } from './outbound';
import { hostedAccess, hostedSiteEnv } from './site-env';

type Project = typeof projects.$inferSelect;
type Deployment = typeof deployments.$inferSelect;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};
const INTERNAL = /\/orbitdocs-(access|ai)\.json\/?$/;

/** Served on every site host: page views to /_orbit/e, without cookies. */
const BEACON = `(()=>{const s=()=>navigator.sendBeacon?.("/_orbit/e",JSON.stringify({t:"pageview",p:location.pathname,r:document.referrer}));s();let l=location.pathname;new MutationObserver(()=>{if(location.pathname!==l){l=location.pathname;s()}}).observe(document,{subtree:true,childList:true})})();`;

export interface SiteTarget {
  project: Project;
  deployment: Deployment;
}

@Injectable()
export class HostingService {
  private readonly handlers = new Map<string, { auth: AuthHandler | null; ai: AiHandler | null }>();
  /** Every request a hosted site makes (sign-in, hooks, Ask AI, API MCP): no private addresses. */
  private readonly siteFetch: typeof fetch;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: PlatformConfig,
    private readonly publish: PublishService,
  ) {
    this.siteFetch = guardedFetch({ allow: config.outboundAllow, platformDomain: config.domain });
  }

  private hostOf(req: Request): string {
    return String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').toLowerCase();
  }

  isDashboard(host: string) {
    return host === this.config.domain || host === `www.${this.config.domain}`;
  }

  /** Which project and deployment a host serves. */
  async resolve(host: string): Promise<SiteTarget | null> {
    let project: Project | undefined;
    let label: string | null = null;
    if (host.endsWith(`.${this.config.domain}`)) {
      const sub = host.slice(0, -(this.config.domain.length + 1));
      const [slug, preview] = sub.split('--');
      label = preview ?? null;
      [project] = await this.db.select().from(projects).where(eq(projects.slug, slug!));
    } else {
      const [row] = await this.db
        .select({ project: projects })
        .from(domains)
        .innerJoin(projects, eq(projects.id, domains.projectId))
        .where(and(eq(domains.hostname, host), eq(domains.verified, true)));
      project = row?.project;
    }
    if (!project) return null;
    let deployment: Deployment | undefined;
    if (label) {
      [deployment] = await this.db
        .select()
        .from(deployments)
        .where(and(eq(deployments.projectId, project.id), eq(deployments.kind, 'preview'), eq(deployments.label, label), isNull(deployments.removedAt)));
    } else if (project.productionDeploymentId) {
      [deployment] = await this.db.select().from(deployments).where(eq(deployments.id, project.productionDeploymentId));
    }
    return deployment && !deployment.removedAt ? { project, deployment } : null;
  }

  /** Whether Caddy may get a certificate for this host. */
  async allowed(host: string): Promise<boolean> {
    if (this.isDashboard(host)) return true;
    if (host.endsWith(`.${this.config.domain}`)) {
      const slug = host.slice(0, -(this.config.domain.length + 1)).split('--')[0]!;
      return (await this.db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug))).length > 0;
    }
    return (await this.db.select({ id: domains.id }).from(domains).where(and(eq(domains.hostname, host), eq(domains.verified, true)))).length > 0;
  }

  /** Private docs and Ask AI for one deployment, from the manifests in its build. */
  private siteHandlers(target: SiteTarget) {
    // Keyed by the site variables too, so a changed secret applies to the next request.
    const cacheKey = `${target.deployment.id}:${createHash('sha256').update(JSON.stringify(target.project.siteEnv)).digest('hex').slice(0, 16)}`;
    const cached = this.handlers.get(cacheKey);
    if (cached) return cached;
    const manifests = this.publish.manifests(target.deployment.id);
    const access = manifests.access ? hostedAccess(manifests.access) : null;
    const aiManifest = manifests.ai;
    // Each hosted site signs its reader sessions with its own key, derived from the
    // platform secret, so private docs work without configuring one per project.
    const sessionKey = createHmac('sha256', this.config.secret).update(`site-session:${target.project.id}`).digest('hex');
    const vars = Object.fromEntries(target.project.siteEnv.map((v) => [v.key, decrypt(v.valueEncrypted, this.config.secret)]));
    // Only the project's own variables: never the platform's process.env (see hostedSiteEnv).
    const env = hostedSiteEnv(vars, access, sessionKey);
    const auth = access ? createAuth({ manifest: access, env, fetch: this.siteFetch }) : null;
    const ai = aiManifest
      ? createAi({
          manifest: aiManifest,
          access,
          auth: auth ?? undefined,
          env,
          fetch: this.siteFetch,
          onAsk: ({ question, sources, request }) => {
            void this.record(target.project.id, { type: 'ask', query: question.slice(0, 500), results: sources }, request.headers.get('x-forwarded-for') ?? '', request.headers.get('user-agent') ?? '');
          },
        })
      : null;
    const entry = { auth, ai };
    for (const k of this.handlers.keys()) if (k.startsWith(`${target.deployment.id}:`)) this.handlers.delete(k);
    this.handlers.set(cacheKey, entry);
    if (this.handlers.size > 200) this.handlers.delete(this.handlers.keys().next().value as string);
    return entry;
  }

  /** The page for a host with no published site, with the OrbitDocs logo from the dashboard. */
  private notFoundPage(host: string): string {
    const esc = (v: string) => v.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
    const base = this.config.publicUrl.replace(/\/$/, '');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No site here · OrbitDocs</title>
<link rel="icon" href="${base}/icon.png"><link rel="apple-touch-icon" href="${base}/apple-icon.png"><meta name="robots" content="noindex">
<style>
:root{color-scheme:light dark;--bg:#fafafa;--card:#fff;--fg:#171717;--muted:#666;--border:#ebebeb}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--card:#111;--fg:#ededed;--muted:#a1a1a1;--border:#242424}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.6 Geist,Inter,ui-sans-serif,system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{width:100%;max-width:440px;padding:36px 32px;border:1px solid var(--border);border-radius:16px;background:var(--card);text-align:center}
img{height:34px;width:auto;margin-bottom:22px}.dark{display:none}
@media (prefers-color-scheme:dark){.light{display:none}.dark{display:inline}}
h1{margin:0 0 8px;font-size:20px;letter-spacing:-.01em}p{margin:0;color:var(--muted)}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--fg);word-break:break-all}
</style></head><body><main>
<img class="light" src="${base}/logo-light.png" alt="OrbitDocs"><img class="dark" src="${base}/logo-dark.png" alt="OrbitDocs">
<h1>No site is published here</h1>
<p>Nothing is live at <code>${esc(host)}</code> yet. The project may not be published, the preview may have been removed, or the domain isn't verified.</p>
</main></body></html>`;
  }

  /** Express middleware: site hosts are served here; the dashboard host passes through. */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const host = this.hostOf(req);
      // Caddy asks on its internal hostname (http://platform:8080), which is no site.
      if (!host || this.isDashboard(host) || req.path === '/api/domains/allowed') return next();
      try {
        const target = await this.resolve(host);
        if (!target) {
          res.status(404).type('html').send(this.notFoundPage(host));
          return;
        }
        await this.serve(target, req, res);
      } catch (err) {
        next(err);
      }
    };
  }

  private async serve({ project, deployment }: SiteTarget, req: Request, res: Response) {
    const url = new URL(req.originalUrl, 'http://x');
    let path = decodeURIComponent(url.pathname);
    /** Set when the reader gets their own variant of the page (private docs). */
    let varies = false;
    if (deployment.kind === 'preview') res.setHeader('X-Robots-Tag', 'noindex');

    // Built-in analytics, before any gate.
    if (path === '/_orbit/a.js') {
      res.type('text/javascript').setHeader('Cache-Control', 'public, max-age=3600');
      res.send(BEACON);
      return;
    }
    if (path === '/_orbit/e' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { t?: string; p?: string; r?: string };
      if (body.t === 'pageview') await this.record(project.id, { type: 'pageview', path: String(body.p ?? '/').slice(0, 300), referrer: externalReferrer(body.r, req.headers.host) }, String(req.headers['x-forwarded-for'] ?? req.ip ?? ''), String(req.headers['user-agent'] ?? ''));
      res.status(204).end();
      return;
    }
    if (INTERNAL.test(path)) {
      res.status(404).end();
      return;
    }

    const base = deployment.basePath;
    if (base && (path === '/' || path === '')) {
      res.redirect(302, `${base}/`);
      return;
    }

    // Ask AI, MCP, sign-in and the access gate: the same handlers as mountOrbitDocs.
    const { auth, ai } = this.siteHandlers({ project, deployment });
    if (ai || auth) {
      const request = await toWebRequest(req);
      const answered = (await ai?.handle(request)) ?? (await auth?.handle(request));
      if (answered) return void (await sendWebResponse(res, answered));
      if (auth) {
        const gate = await auth.gate(request);
        if (!gate.allowed) return void (await sendWebResponse(res, gate.response));
        // Serve the copy of this page made for the reader's groups (filtered sidebar,
        // operations, spec and samples); the browser URL stays the same.
        if (gate.varies) varies = true;
        if (gate.rewrite) path = decodeURIComponent(new URL(gate.rewrite, 'http://x').pathname);
      }
    }

    if (base && !(path === base || path.startsWith(`${base}/`))) return this.notFound(project, deployment, res);
    const rel = base ? path.slice(base.length) : path;
    const file = this.findFile(this.publish.dir(deployment.id), rel);
    if (!file) return this.notFound(project, deployment, res);
    if (!rel.endsWith('/') && file.endsWith(`${sep}index.html`) && !rel.endsWith('.html')) {
      res.redirect(301, `${path}/${url.search}`);
      return;
    }
    this.send(project, file, res, 200, rel.includes('/_next/static/'), varies);
  }

  /** `rel` → a file inside `root` (no escaping it): exact, `.html`, or `index.html`. */
  private findFile(root: string, rel: string): string | null {
    const clean = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidates = [join(root, clean), join(root, `${clean.replace(/\/$/, '')}.html`), join(root, clean, 'index.html')];
    for (const c of candidates) {
      if (!c.startsWith(root + sep) && c !== root) continue;
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
  }

  private notFound(project: Project, deployment: Deployment, res: Response) {
    const page = join(this.publish.dir(deployment.id), '404.html');
    if (existsSync(page)) return this.send(project, page, res, 404, false);
    res.status(404).type('text').send('Not found');
  }

  /** `perReader`: the content depends on who is signed in, so shared caches must not keep it. */
  private send(project: Project, file: string, res: Response, status: number, immutable: boolean, perReader = false) {
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.status(status).setHeader('Content-Type', type);
    if (perReader) {
      res.setHeader('Vary', 'Cookie');
      res.setHeader('Cache-Control', 'private, no-cache');
    } else res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
    if (type.startsWith('text/html')) {
      const html = readFileSync(file, 'utf8').replace('</head>', `${this.analyticsTags(project)}</head>`);
      res.send(html);
      return;
    }
    createReadStream(file).pipe(res);
  }

  /** The project's analytics: built-in beacon, Plausible, Umami or PostHog. */
  analyticsTags(project: Project): string {
    const a = project.analytics;
    const esc = (s = '') => s.replace(/["<>&]/g, '');
    switch (a.provider) {
      case 'plausible':
        return `<script defer data-domain="${esc(a.siteId)}" src="${esc(a.host || 'https://plausible.io')}/js/script.js"></script>`;
      case 'umami':
        return `<script defer data-website-id="${esc(a.siteId)}" src="${esc(a.host || 'https://cloud.umami.is')}/script.js"></script>`;
      case 'posthog':
        return `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},o="capture identify alias people.set reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init("${esc(a.siteId)}",{api_host:"${esc(a.host || 'https://us.i.posthog.com')}"})</script>`;
      default:
        return '<script defer src="/_orbit/a.js"></script>';
    }
  }

  /** Built-in analytics; the visitor is a daily hash of IP and browser, never stored raw. */
  async record(projectId: string, e: { type: string; path?: string; query?: string; results?: number; referrer?: string | null }, ip: string, ua: string) {
    const day = new Date().toISOString().slice(0, 10);
    const visitor = createHash('sha256').update(`${this.config.secret}:${day}:${ip.split(',')[0]?.trim()}:${ua}`).digest('hex').slice(0, 16);
    await this.db.insert(analyticsEvents).values({ projectId, type: e.type, path: e.path, query: e.query, results: e.results, referrer: e.referrer ?? null, visitor });
  }
}

/** Only referrers from other sites count. */
function externalReferrer(referrer: string | undefined, host: string | undefined): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    return u.host === host ? null : u.host;
  } catch {
    return null;
  }
}
