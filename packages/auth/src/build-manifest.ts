import type { AccessManifest, AppSession, ProviderBrand, PublicProvider } from './manifest';
import { matches } from './match';

/** The subset of the OrbitDocs config the manifest needs (kept structural to avoid a core dependency here). */
export interface ManifestInput {
  site: { title: string; logo?: string | { light: string; dark: string }; favicon?: string };
  theme: { accent?: string };
  output: { basePath: string };
  apis: Array<{ id: string; access?: string[] }>;
  client: { enabled: boolean };
  access?: {
    mode: 'public' | 'private';
    groups: AccessManifest['groups'];
    rules: Array<{ path: string; groups: string[] }>;
    providers: ProviderInput[];
    appSession?: AppSession;
    session: AccessManifest['session'];
    loginPage: AccessManifest['loginPage'];
    personalization?: AccessManifest['personalization'];
    audit?: AccessManifest['audit'];
  };
}

/** A sign-in preset as written in the config. */
export type ProviderInput = {
  id?: string;
  name?: string;
  clientId: string;
  clientSecretEnv: string;
  scopes?: string[];
  groupsClaim?: string;
  issuer?: string;
} & (
  | { type: 'google'; hostedDomain?: string }
  | { type: 'microsoft'; tenantId: string }
  | { type: 'okta'; domain: string; authorizationServer?: string }
  | { type: 'auth0'; domain: string }
  | { type: 'clerk'; domain: string }
  | { type: 'keycloak'; url: string; realm: string }
);

const BRAND_NAME: Record<ProviderBrand, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  okta: 'Okta',
  auth0: 'Auth0',
  clerk: 'Clerk',
  keycloak: 'Keycloak',
};

const host = (domain: string) => domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

/** The OpenID Connect issuer of each preset. */
function issuerOf(p: ProviderInput): string {
  switch (p.type) {
    case 'google':
      return 'https://accounts.google.com';
    case 'microsoft':
      return `https://login.microsoftonline.com/${p.tenantId}/v2.0`;
    case 'okta':
      return `https://${host(p.domain)}${p.authorizationServer ? `/oauth2/${p.authorizationServer}` : ''}`;
    case 'auth0':
      return `https://${host(p.domain)}/`;
    case 'clerk':
      return `https://${host(p.domain)}`;
    case 'keycloak':
      return `${p.url.replace(/\/+$/, '')}/realms/${p.realm}`;
  }
}

/** Resolves a preset to the OpenID Connect settings the server uses. */
export function resolveProvider(p: ProviderInput): PublicProvider {
  return {
    type: 'oidc',
    brand: p.type,
    id: p.id ?? p.type,
    name: p.name ?? BRAND_NAME[p.type],
    issuer: p.issuer ?? issuerOf(p),
    clientId: p.clientId,
    clientSecretEnv: p.clientSecretEnv,
    scopes: p.scopes ?? ['openid', 'email', 'profile'],
    // Entra puts group object ids in `groups`; app roles in `roles`.
    groupsClaim: p.groupsClaim ?? 'groups',
    ...(p.type === 'google' && p.hostedDomain ? { authParams: { hd: p.hostedDomain }, hostedDomain: p.hostedDomain } : {}),
  };
}

/** Local paths (`/logo.svg`) get the base path; URLs stay as they are. */
const withBase = (path: string, base: string) => (path.startsWith('/') && !path.startsWith('//') ? `${base}${path}` : path);

/**
 * The site's logo and icons for the sign-in pages: `site.logo` (one image, or
 * light and dark), `site.favicon` or the app's `icon.png`, and `apple-icon.png`
 * (the files Next serves from `app/icon.png` and `app/apple-icon.png`, or `public/`).
 */
export function siteAssets(site: ManifestInput['site'], base: string): Pick<AccessManifest['site'], 'logo' | 'icon' | 'appleIcon'> {
  const logo = typeof site.logo === 'string' ? { light: site.logo, dark: site.logo } : site.logo;
  return {
    ...(logo ? { logo: { light: withBase(logo.light, base), dark: withBase(logo.dark, base) } } : {}),
    icon: withBase(site.favicon ?? '/icon.png', base),
    appleIcon: `${base}/apple-icon.png`,
  };
}

/** Guide pages with an `access` list in their frontmatter. */
export interface RestrictedPage {
  /** Page URL without base path (`/internal/runbook`). */
  url: string;
  /** Slugs, for the page's Markdown route. */
  slugs: string[];
  groups: string[];
}

/** URL of a guide's Markdown copy (`/internal/runbook` → `/md/internal/runbook/content.md`). */
export function markdownPath(url: string): string {
  const path = url.replace(/\/+$/, '');
  return `/md${path}/content.md`;
}

/**
 * The pattern that matches the Markdown copies of exactly the guides `pattern`
 * matches. Every guide `/x` has its copy at `/md/x/content.md`, so a folder or
 * prefix pattern keeps its shape under `/md` and an exact path maps to one file.
 */
export function markdownPattern(pattern: string): string {
  if (pattern.endsWith('/*')) return `/md${pattern.slice(0, -2)}/*`;
  if (pattern.endsWith('*')) return `/md${pattern.slice(0, -1)}*`;
  return markdownPath(pattern);
}

/**
 * Builds the access manifest.
 *
 * `rules` (first match wins): the manifests themselves (never served), then
 * every config rule after its Markdown twin (`/md/…/content.md`), in config
 * order. `constraints` (every match applies on top of that rule): frontmatter
 * `access` for each page and its Markdown twin, and the groups of restricted
 * APIs for their reference, spec download and code samples. So a page needs
 * both its config rule and its frontmatter, and the stricter one always wins.
 *
 * Reader-dependent files (`variants`) are added by the CLI once the specs are
 * extracted (see `planVariants`).
 */
export function buildManifest(config: ManifestInput, pages: RestrictedPage[] = []): AccessManifest | null {
  const a = config.access;
  if (!a) return null;
  const rules: AccessManifest['rules'] = [
    // The manifests themselves are never served.
    { pattern: '/orbitdocs-access.json', groups: ['__never__'], source: 'internal' },
    { pattern: '/orbitdocs-ai.json', groups: ['__never__'], source: 'internal' },
    // A guide's Markdown copy is decided exactly like the guide.
    ...a.rules.map((r) => ({ pattern: markdownPattern(r.path), groups: r.groups, source: 'config:markdown' })),
    ...a.rules.map((r) => ({ pattern: r.path, groups: r.groups, source: 'config' })),
  ];
  const constraints: NonNullable<AccessManifest['constraints']> = pages.flatMap((p) => [
    { pattern: p.url, groups: p.groups, source: 'frontmatter' },
    { pattern: `/md/${[...p.slugs, 'content.md'].join('/')}`, groups: p.groups, source: 'frontmatter' },
  ]);
  for (const api of config.apis) {
    if (api.access?.length) {
      const source = `api:${api.id}`;
      constraints.push(
        { pattern: `/reference/${api.id}/*`, groups: api.access, source },
        { pattern: `/openapi/${api.id}.json`, groups: api.access, source },
        { pattern: `/reference-samples/${api.id}.json`, groups: api.access, source },
      );
    }
    // A config rule over the API's reference (`/reference/admin/*`): its spec download and
    // code samples file hold the same operations, so they need the same groups.
    const byRule = a.rules.find((r) => matches(r.path, `/reference/${api.id}`));
    if (byRule) {
      const source = `config:api:${api.id}`;
      constraints.push(
        { pattern: `/openapi/${api.id}.json`, groups: byRule.groups, source },
        { pattern: `/reference-samples/${api.id}.json`, groups: byRule.groups, source },
      );
    }
  }
  return {
    version: 2,
    basePath: config.output.basePath,
    site: {
      title: config.site.title,
      accent: config.theme.accent,
      ...siteAssets(config.site, config.output.basePath),
    },
    mode: a.mode,
    groups: a.groups,
    rules,
    constraints,
    providers: a.providers.map(resolveProvider),
    appSession: a.appSession,
    session: a.session,
    loginPage: a.loginPage,
    personalization: a.personalization,
    audit: a.audit,
  };
}
