import type { AccessManifest, DocsUser, Requirement, VariantSet } from './manifest';
import { isAllowed, requirement } from './requirement';

export { isAllowed };

/** Paths that are never gated: auth routes, framework assets, icons. */
const ALWAYS_PUBLIC = [/^\/_auth(\/|$)/, /^\/_next\//, /^\/(favicon\.ico|icon\.svg|robots\.txt)$/];

/** Path relative to the site (base path and trailing slash removed). */
export function sitePath(pathname: string, basePath: string): string {
  let p = pathname;
  if (basePath && (p === basePath || p.startsWith(`${basePath}/`))) p = p.slice(basePath.length) || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p.endsWith('/index.html')) p = p.slice(0, -'/index.html'.length) || '/';
  else if (p.endsWith('.html')) p = p.slice(0, -'.html'.length);
  // A static export writes each page's React Server Components payloads next to its HTML
  // (`/x/index.txt`, `/x/__next._full.txt`, …). They hold the page's content, so they are the page.
  else {
    const rsc = /\/(index|__next\.[^/]*)\.txt$/.exec(p);
    if (rsc) p = p.slice(0, rsc.index) || '/';
  }
  return p || '/';
}

/** `/reference/admin/*` matches the folder and everything under it; otherwise exact. */
export function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(`${base}/`);
  }
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return path === pattern || path === pattern.replace(/\/$/, '');
}

/**
 * What a reader needs to open `pathname`: null = public. The first matching
 * rule (config rules, in order) and every matching constraint (page
 * frontmatter, `apis[].access`) all apply, so the stricter one always wins.
 * With neither, `private` mode needs sign-in (`[['*']]`). A variant of a
 * reader-dependent file needs its option's groups on top of what its
 * canonical file needs.
 */
export function requiredGroups(manifest: AccessManifest, pathname: string): Requirement | null {
  const path = sitePath(pathname, manifest.basePath);
  if (ALWAYS_PUBLIC.some((re) => re.test(path)) || isSiteAsset(manifest, pathname)) return null;
  const variant = variantOf(manifest, path);
  if (variant) return requirement(variant.requires, requiredAt(manifest, variant.canonical));
  return requiredAt(manifest, path);
}

/** The logo and icons the sign-in pages show: readers see them before they sign in. */
function isSiteAsset(manifest: AccessManifest, pathname: string): boolean {
  const { logo, icon, appleIcon } = manifest.site;
  return [logo?.light, logo?.dark, icon, appleIcon].some((asset) => asset?.startsWith('/') && asset === pathname);
}

function requiredAt(manifest: AccessManifest, path: string): Requirement | null {
  const rule = manifest.rules.find((r) => matches(r.pattern, path));
  const constraints = (manifest.constraints ?? []).filter((c) => matches(c.pattern, path)).map((c) => c.groups);
  if (!rule && !constraints.length) return manifest.mode === 'private' ? [['*']] : null;
  return requirement(rule?.groups, ...constraints);
}

const expand = (to: string, key: string) => to.replace('{key}', key);

/** Whether `path` is `prefix` or under it. */
const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix === '/' || prefix === '' ? '/' : `${prefix}/`);

/** A site path that is an option of a variant set: which one, and its canonical path. */
function variantOf(manifest: AccessManifest, path: string): { requires: Requirement; canonical: string } | undefined {
  for (const set of manifest.variants ?? []) {
    for (const route of set.routes) {
      for (const option of set.options) {
        const to = expand(route.to, option.key);
        if (!under(path, to)) continue;
        return { requires: option.requires, canonical: `${route.from}${path.slice(to.length)}` || '/' };
      }
    }
  }
  return undefined;
}

/** The variant route that serves canonical `path` (site path), if any. */
function variantRoute(manifest: AccessManifest, path: string): { set: VariantSet; route: VariantSet['routes'][number] } | undefined {
  if (!manifest.variants?.length || variantOf(manifest, path)) return undefined;
  for (const set of manifest.variants) {
    for (const route of set.routes) {
      if (route.paths ? route.paths.includes(path) : under(path, route.from)) return { set, route };
    }
  }
  return undefined;
}

/** Whether the content at `pathname` depends on who reads it (responses must not be shared between readers). */
export function variesByReader(manifest: AccessManifest, pathname: string): boolean {
  const path = sitePath(pathname, manifest.basePath);
  return Boolean(variantRoute(manifest, path) ?? variantOf(manifest, path));
}

/**
 * The file to serve instead of `pathname` for this reader: the most complete
 * variant they may open, as a full pathname (base path included). undefined =
 * serve `pathname` itself. A page URL without its trailing slash is left
 * alone, so the server's own redirect keeps the canonical URL.
 */
export function variantPathname(manifest: AccessManifest, user: DocsUser | undefined, pathname: string): string | undefined {
  const base = manifest.basePath;
  const path = sitePath(pathname, base);
  const found = variantRoute(manifest, path);
  if (!found) return undefined;
  let rel = base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) : pathname;
  if (!rel.endsWith('/') && !/\.[^/]+$/.test(rel)) return undefined;
  if (!rel) rel = '/';
  const option = found.set.options.find((o) => isAllowed(user, o.requires));
  if (!option || !rel.startsWith(found.route.from)) return undefined;
  return `${base}${expand(found.route.to, option.key)}${rel.slice(found.route.from.length)}`;
}

/** Access groups a reader belongs to, from their email and IdP groups. */
export function resolveGroups(manifest: AccessManifest, email: string, idpGroups: string[] = []): string[] {
  const lower = email.toLowerCase();
  const domain = lower.split('@')[1] ?? '';
  return Object.entries(manifest.groups)
    .filter(
      ([, g]) =>
        g.emails.some((e) => e.toLowerCase() === lower) ||
        g.domains.some((d) => d.toLowerCase().replace(/^@/, '') === domain) ||
        g.idpGroups.some((x) => idpGroups.includes(x)),
    )
    .map(([name]) => name);
}

/**
 * Whether a reader may sign in at all. In private mode with groups defined,
 * only members of some group can; otherwise any verified identity can.
 */
export function canSignIn(manifest: AccessManifest, groups: string[]): boolean {
  if (manifest.mode !== 'private') return true;
  return Object.keys(manifest.groups).length === 0 || groups.length > 0;
}
