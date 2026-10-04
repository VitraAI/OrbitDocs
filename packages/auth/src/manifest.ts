/**
 * What the server needs to enforce private docs, without any secret: written
 * by `orbitdocs build` to `.orbitdocs/access.json` and served nowhere.
 */
export interface AccessManifest {
  version: 2;
  /** Site path prefix (`/docs`), or ''. */
  basePath: string;
  site: {
    title: string;
    accent?: string;
    /** Logo for the sign-in and access pages, base path included (`light`/`dark` follow the system theme). */
    logo?: { light: string; dark: string };
    /** Favicon and Apple touch icon, base path included. */
    icon?: string;
    appleIcon?: string;
  };
  mode: 'public' | 'private';
  groups: Record<string, { emails: string[]; domains: string[]; idpGroups: string[] }>;
  /** Config rules (and their Markdown twins): first match wins. `groups: ['*']` = any signed-in reader. */
  rules: Array<{ pattern: string; groups: string[]; source?: string }>;
  /**
   * Page frontmatter `access` and `apis[].access` (and the files derived from
   * them): every matching entry applies on top of the first matching rule, so
   * the stricter of the two always wins.
   */
  constraints?: Array<{ pattern: string; groups: string[]; source?: string }>;
  /** Files whose content depends on the reader (sidebar, partially restricted APIs, the client). */
  variants?: VariantSet[];
  /** Single sign-on buttons, resolved to OpenID Connect settings. */
  providers: PublicProvider[];
  /** Reuse of the product's own session. */
  appSession?: AppSession;
  session: { secretEnv: string; maxAgeHours: number };
  loginPage: { title?: string; description?: string };
  personalization?: { url: string; secretEnv: string };
  audit?: { file?: string; webhookUrl?: string };
}

/**
 * What a reader needs: one group from EACH list (`*` = any signed-in reader).
 * `[['staff', 'partners']]` = staff or partners; `[['staff'], ['beta']]` = staff and beta.
 */
export type Requirement = string[][];

/**
 * One set of reader-dependent files, built by `orbitdocs build`. The
 * canonical files hold only what every reader who may open them can see;
 * each option is a copy with more in it, served in place of the canonical
 * file to readers who satisfy its `requires`.
 */
export interface VariantSet {
  /** `guides` (the sidebar), `client` or `api:<id>`. */
  scope: string;
  /** Most complete first: a reader gets the first option they satisfy, else the canonical file. */
  options: Array<{ key: string; requires: Requirement }>;
  /**
   * Canonical path (or path prefix) → the same path in each option (`{key}`
   * is the option key). With `paths`, only those exact pages are served from
   * a variant; otherwise `from` and everything under it.
   */
  routes: Array<{ from: string; to: string; paths?: string[] }>;
}

export type ProviderBrand = 'google' | 'microsoft' | 'okta' | 'auth0' | 'clerk' | 'keycloak';

export interface PublicProvider {
  type: 'oidc';
  brand: ProviderBrand;
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecretEnv: string;
  scopes: string[];
  groupsClaim: string;
  /** Extra authorization parameters (e.g. Google's `hd`). */
  authParams?: Record<string, string>;
  /** Google: only accept this Workspace domain (checked against the `hd` claim). */
  hostedDomain?: string;
}

interface AppSessionBase {
  name?: string;
  loginUrl: string;
  returnParam: string;
  logoutUrl?: string;
  cookie?: string;
  groupsClaim?: string;
}

export type AppSession =
  | (AppSessionBase & { type: 'supabase'; projectUrl: string; jwtSecretEnv?: string })
  | (AppSessionBase & { type: 'clerk'; domain: string; secretKeyEnv?: string })
  | (AppSessionBase & { type: 'firebase'; projectId: string })
  | (AppSessionBase & { type: 'appwrite'; endpoint: string; projectId: string });

export interface DocsUser {
  email: string;
  name?: string;
  groups: string[];
  provider: string;
  /** From the personalization hook: credentials by security scheme, and client variables. */
  credentials?: Record<string, string>;
  variables?: Record<string, string>;
}
