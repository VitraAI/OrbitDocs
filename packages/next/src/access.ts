import { buildManifest, implies, type ManifestInput, type Requirement, requiredGroups, requirement, sitePath } from '@vitra-ai/orbitdocs-auth/edge';
import type { OrbitDocsConfig } from '@vitra-ai/orbitdocs-core';

type AccessSettings = Pick<OrbitDocsConfig, 'access' | 'apis'>;

/** The config as the access manifest sees it (base path left out: URLs here have none). */
function manifestInput(config: AccessSettings): ManifestInput {
  return { site: { title: '' }, theme: {}, output: { basePath: '' }, apis: config.apis, client: { enabled: false }, access: config.access };
}

/**
 * What a reader needs to open a page, decided exactly like the docs server
 * decides its URL (`.orbitdocs/access.json`, same code): the first matching
 * `access.rules` entry AND the page's frontmatter `access` AND, for an API
 * reference page, `apis[].access`. The stricter always wins. null = public
 * (no rule; in `private` mode the site default, sign-in, still applies).
 */
export function pageAccess(config: AccessSettings, url: string, frontmatter?: string[]): Requirement | null {
  const path = sitePath(url, '');
  const pages = frontmatter?.length ? [{ url: path, slugs: [], groups: frontmatter }] : [];
  const manifest = buildManifest(manifestInput(config), pages);
  if (!manifest) return requirement(frontmatter);
  // The site default (`private` → sign-in) is not a restriction of this page.
  return requiredGroups({ ...manifest, mode: 'public' }, path);
}

/**
 * Whether a page may go in the files every reader gets: the static search
 * index, `llms.txt` and `llms-full.txt`. Those are one file for everyone, so a
 * page limited to some groups stays out. In `private` mode the files themselves
 * need sign-in, so a page open to any signed-in reader (`*`) can stay in.
 */
export function isPublicPage(config: AccessSettings, url: string, frontmatter?: string[]): boolean {
  const groups = pageAccess(config, url, frontmatter);
  if (!groups) return true;
  return config.access?.mode === 'private' && implies([['*']], groups);
}

/** Whether an API operation's reference page (`/reference/<api>/<slug>/`) may go in the shared files. */
export function isPublicOperation(config: AccessSettings, _apiId: string, url: string): boolean {
  // `apis[].access` and `access.rules` both count, like for the page itself.
  return isPublicPage(config, url);
}
