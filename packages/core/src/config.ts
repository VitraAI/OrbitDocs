import { z } from 'zod';

/** A link in the header, sidebar footer or footer. */
const link = z.object({
  text: z.string().min(1),
  url: z.string().min(1),
  /** Opens in a new tab; defaults to true for absolute URLs. */
  external: z.boolean().optional(),
  /** Lucide icon name, e.g. `Github`, `BookOpen`. */
  icon: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Header items, as Fumadocs supports them: plain links, icon links, buttons,
 * and menus with sub-links. `on` limits an item to the navbar or the mobile menu.
 */
const navLink = link.extend({
  on: z.enum(['menu', 'nav', 'all']).optional(),
  /** When the item shows as active: on its exact URL (default), also under it (`nested-url`), or never. */
  active: z.enum(['url', 'nested-url', 'none']).optional(),
});
const headerItem = z.union([
  navLink.extend({ type: z.literal('main').optional() }),
  navLink.extend({ type: z.literal('icon'), icon: z.string() }),
  navLink.extend({ type: z.literal('button'), secondary: z.boolean().optional() }),
  z.object({
    type: z.literal('menu'),
    text: z.string().min(1),
    icon: z.string().optional(),
    items: z.array(link),
    on: z.enum(['menu', 'nav', 'all']).optional(),
  }),
]);

/** Fumadocs colour presets, plus `orbit` (OrbitDocs' neutral HeroUI palette). */
export const THEME_PRESETS = [
  'orbit', 'neutral', 'black', 'vitepress', 'dusk', 'catppuccin', 'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen', 'shadcn',
] as const;

/** Fumadocs page layouts for guides. */
export const LAYOUT_TYPES = ['notebook', 'docs', 'flux', 'glass', 'home'] as const;

const logo = z.union([
  z.string(),
  z.object({ light: z.string(), dark: z.string() }),
]);

const server = z.object({
  url: z.string().min(1),
  description: z.string().optional(),
});

/**
 * How `orbitdocs extract` gets the spec out of a NestJS app. It loads the
 * COMPILED module (so the @nestjs/swagger CLI plugin and decorator metadata
 * are honoured), boots it in preview mode — no provider is instantiated, so
 * nothing connects to a database — and writes the OpenAPI document.
 */
const nestSource = z.object({
  /** Compiled module file, relative to the project root (e.g. `dist/app.module.js`). */
  module: z.string().min(1),
  /** Exported class name. */
  export: z.string().default('AppModule'),
  /**
   * Which routes reach the docs. `opt-in` (default): only routes marked with
   * `@DocsOperation`, so internal and admin routes can't leak. `all`: every
   * route `@nestjs/swagger` documents; hide one with Swagger's
   * `@ApiExcludeEndpoint()` or `@DocsHidden()`. Either way `@ApiOperation`
   * gives the title and `@ApiTags` the group.
   */
  routes: z.enum(['opt-in', 'all']).default('opt-in'),
  /** Command that compiles the app before extraction (e.g. `nest build`). Skipped when omitted. */
  build: z.string().optional(),
  /** Nest project root, relative to the docs app. Defaults to `..`. */
  root: z.string().default('..'),
  /** Mirrors `app.setGlobalPrefix()`. */
  globalPrefix: z.string().optional(),
  /** Mirrors `app.enableVersioning({ type: VersioningType.URI, ... })`. */
  versioning: z
    .object({
      type: z.literal('uri').default('uri'),
      defaultVersion: z.string().optional(),
      prefix: z.string().default('v'),
    })
    .optional(),
  /**
   * Compiled file exporting `configure(app)` for anything else main.ts does
   * that changes routes. `path#exportName`, export defaults to `configure`.
   */
  configure: z.string().optional(),
  /** Environment variables set before the module is loaded (placeholders for required config). */
  env: z.record(z.string(), z.string()).default({}),
});

const apiSource = z.union([
  z.object({ nest: nestSource }),
  z.object({ file: z.string().min(1) }),
  z.object({ url: z.url() }),
]);

const securityScheme = z.record(z.string(), z.unknown());

const api = z.object({
  /** Stable id: used in URLs, `op:<id>/<operationId>` links and the spec file name. */
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
  title: z.string().optional(),
  description: z.string().optional(),
  /** Version shown in the reference header. Defaults to the spec's `info.version`. */
  version: z.string().optional(),
  source: apiSource,
  /** Overrides the spec's servers. */
  servers: z.array(server).optional(),
  /** Security schemes added to the spec (OpenAPI `components.securitySchemes`). */
  securitySchemes: z.record(z.string(), securityScheme).optional(),
  /** Scheme names applied to every documented operation. */
  security: z.array(z.string()).optional(),
  /**
   * Fail extraction when an operation lacks descriptions, examples or typed
   * success responses. `warn` prints the gaps but does not fail.
   */
  completeness: z.enum(['error', 'warn', 'off']).default('warn'),
  /**
   * Error codes added to every operation (see @orbitdocs/openapi `standardResponses`):
   * 400 with input, 401/403 when secured, 404 with a path parameter, 500. The object form
   * adds codes every operation can return (`extra: ['429']` behind a rate limiter) and
   * rewords the defaults (`descriptions: { '429': '…' }`).
   */
  standardErrors: z
    .union([z.boolean(), z.object({ extra: z.array(z.string().regex(/^[45]\d\d$/)).optional(), descriptions: z.record(z.string(), z.string()).optional() })])
    .default(true),
  /**
   * Parameters removed from every operation of this API, e.g. a tenant header that
   * callers using `security` never send. Header names match case-insensitively.
   */
  omitParameters: z.array(z.object({ in: z.enum(['header', 'query', 'path', 'cookie']), name: z.string().min(1) })).default([]),
  /** Access groups that can read this API's reference (private docs). */
  access: z.array(z.string()).optional(),
  /**
   * Whether readers can send this API's requests from the docs (the
   * reference's Test Request and the API client's Send). Off: the reference
   * keeps its code samples and the client still builds, edits and copies
   * requests as code, but nothing is sent.
   */
  send: z.boolean().default(true),
  /** Shown where sending would be when `send` is off. */
  sendDisabledMessage: z.string().min(1).optional(),
});

/** Who belongs to an access group: listed emails, whole email domains, or IdP groups. */
const accessGroup = z.object({
  emails: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  /** Group names from the identity provider or your app's session (its groups claim). */
  idpGroups: z.array(z.string()).default([]),
});

const providerId = z.string().regex(/^[a-z0-9-]+$/);

/** Fields every single-sign-on preset shares (all are OpenID Connect underneath). */
const ssoBase = {
  /** URL-safe id, used in callback URLs (`/_auth/callback/<id>`). Defaults to the type. */
  id: providerId.optional(),
  /** Button label: "Continue with <name>". Defaults to the brand name. */
  name: z.string().optional(),
  clientId: z.string(),
  /** Environment variable that holds the client secret. */
  clientSecretEnv: z.string(),
  scopes: z.array(z.string()).optional(),
  /** Token claim that lists the reader's groups (matched against `idpGroups`). */
  groupsClaim: z.string().optional(),
  /** Override the discovered issuer URL (custom domains, tests). */
  issuer: z.string().url().optional(),
};

/** Sign-in buttons: Google, Microsoft Entra ID, Okta, Auth0, Clerk, Keycloak. */
const authProvider = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('google'),
    ...ssoBase,
    /** Only accept accounts of this Google Workspace domain (e.g. `acme.com`). */
    hostedDomain: z.string().optional(),
  }),
  z.object({
    type: z.literal('microsoft'),
    ...ssoBase,
    /** Directory (tenant) ID of your Microsoft Entra ID (Azure AD). */
    tenantId: z.string(),
  }),
  z.object({
    type: z.literal('okta'),
    ...ssoBase,
    /** Your Okta domain, e.g. `acme.okta.com`. */
    domain: z.string(),
    /** Custom authorization server id (e.g. `default`); omit for the org server. */
    authorizationServer: z.string().optional(),
  }),
  z.object({
    type: z.literal('auth0'),
    ...ssoBase,
    /** Your Auth0 domain, e.g. `acme.us.auth0.com`. */
    domain: z.string(),
  }),
  z.object({
    type: z.literal('clerk'),
    ...ssoBase,
    /** Clerk Frontend API domain, e.g. `clerk.acme.com` (Clerk OAuth application). */
    domain: z.string(),
  }),
  z.object({
    type: z.literal('keycloak'),
    ...ssoBase,
    /** Keycloak base URL, e.g. `https://auth.acme.com`. */
    url: z.string().url(),
    realm: z.string(),
  }),
]);

/** Shared by every app-session adapter. */
const appSessionBase = {
  /** Button label on the login page: "Continue with <name>". Defaults to "<site title> account". */
  name: z.string().optional(),
  /** Your product's sign-in page. Readers without a session go there and come back. */
  loginUrl: z.string().url(),
  /** Query parameter your sign-in page reads to send the reader back. */
  returnParam: z.string().default('redirect_to'),
  /** Where "Sign out" goes (your product's sign-out). */
  logoutUrl: z.string().url().optional(),
  /** Cookie that holds the session. Defaults to the product's own cookie name. */
  cookie: z.string().optional(),
  /** Claim (dot path) that lists the reader's groups. */
  groupsClaim: z.string().optional(),
};

/**
 * Reuse the sign-in of your own product: the docs read its session cookie and
 * verify it, so readers already signed in to your app never sign in twice.
 * The docs must be served where that cookie is sent (same site, or a cookie
 * set on the parent domain).
 */
const appSession = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('supabase'),
    ...appSessionBase,
    /** https://<ref>.supabase.co (or your custom domain). */
    projectUrl: z.string().url(),
    /** Legacy projects with a shared JWT secret: environment variable that holds it. Otherwise the project's public keys are used. */
    jwtSecretEnv: z.string().optional(),
  }),
  z.object({
    type: z.literal('clerk'),
    ...appSessionBase,
    /** Clerk Frontend API domain, e.g. `clerk.acme.com`. */
    domain: z.string(),
    /** Environment variable with the Clerk secret key, to look up the email when the session token has none. */
    secretKeyEnv: z.string().optional(),
  }),
  z.object({
    type: z.literal('firebase'),
    ...appSessionBase,
    projectId: z.string(),
  }),
  z.object({
    type: z.literal('appwrite'),
    ...appSessionBase,
    /** API endpoint, e.g. https://cloud.appwrite.io/v1. */
    endpoint: z.string().url(),
    projectId: z.string(),
  }),
]);

/**
 * Private docs: who can read what, and how they sign in. Enforced by the
 * server that serves the docs (mountOrbitDocs in Nest, or Next server mode).
 */
const access = z.object({
  /** `private`: every page needs sign-in. `public`: only pages matched by rules or `access` frontmatter do. */
  mode: z.enum(['public', 'private']).default('public'),
  groups: z.record(z.string(), accessGroup).default({}),
  /** Paths (with `*`) that only some groups can read. `*` in groups = any signed-in reader. */
  rules: z.array(z.object({ path: z.string().startsWith('/'), groups: z.array(z.string()).min(1) })).default([]),
  /** Single sign-on buttons on the login page. */
  providers: z.array(authProvider).default([]),
  /** Reuse your product's existing sign-in (Supabase, Clerk, Firebase or Appwrite). */
  appSession: appSession.optional(),
  session: z
    .object({ secretEnv: z.string().default('ORBITDOCS_AUTH_SECRET'), maxAgeHours: z.number().positive().default(12) })
    .default({ secretEnv: 'ORBITDOCS_AUTH_SECRET', maxAgeHours: 12 }),
  loginPage: z.object({ title: z.string().optional(), description: z.string().optional() }).default({}),
  /** Called after sign-in with the reader; may return extra groups and values (e.g. their API key) to pre-fill. */
  personalization: z.object({ url: z.string().url(), secretEnv: z.string() }).optional(),
  /** Sign-ins, sign-outs and denials: JSON lines to a file and/or POSTed to a webhook. */
  audit: z.object({ file: z.string().optional(), webhookUrl: z.string().url().optional() }).optional(),
});

/**
 * AI: Ask-AI over your docs with your own LLM key, a docs MCP server and an
 * MCP server per API. Runs on the server that serves the docs (mountOrbitDocs
 * or Next server mode); keys stay in environment variables.
 */
const ai = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'openai-compatible']),
  /** Model id, e.g. gpt-5-mini, claude-sonnet-5-5, gemini-3-flash. */
  model: z.string(),
  /** Environment variable that holds the API key. */
  apiKeyEnv: z.string(),
  /** Base URL for `openai-compatible` (Ollama, vLLM, OpenRouter, Azure OpenAI…), or a proxy for the others. */
  baseUrl: z.string().url().optional(),
  askAi: z
    .object({
      enabled: z.boolean().default(true),
      /** Shown before the first question. */
      greeting: z.string().optional(),
      /** Starter questions. */
      suggestions: z.array(z.string()).default([]),
      /** Extra instructions for the assistant (tone, product names, what not to answer). */
      instructions: z.string().optional(),
      /** Most passages sent with each question. */
      maxSources: z.number().int().min(1).max(20).default(6),
    })
    .default({ enabled: true, suggestions: [], maxSources: 6 }),
  mcp: z
    .object({
      /** Docs MCP at <base>/mcp: search and read guides and API references. */
      docs: z.boolean().default(true),
      /** API MCP at <base>/mcp/<api id>: one tool per operation, calling your API with the client's credentials. */
      apis: z.union([z.boolean(), z.array(z.string())]).default(true),
      /** `per-operation`: a tool for each operation. `search-execute`: two tools, for large APIs. */
      tools: z.enum(['per-operation', 'search-execute']).default('per-operation'),
    })
    .default({ docs: true, apis: true, tools: 'per-operation' }),
});

/**
 * SDKs: TypeScript with @hey-api/openapi-ts, the rest with openapi-generator
 * (needs Java 11+). Code samples for each SDK appear in the API reference.
 */
const sdkLanguage = {
  /**
   * Folder for this SDK, relative to the docs app. Default `sdks/<api id>/<language>`.
   * `{api}` is replaced by the API id (also in package names, e.g. `@acme/{api}-sdk`);
   * without it, several APIs each get `<out>/<api id>`.
   */
  out: z.string().optional(),
  /** Package version written into the SDK. */
  version: z.string().optional(),
};
const sdks = z.object({
  /** APIs to build SDKs for. Default: every API. */
  apis: z.array(z.string()).optional(),
  typescript: z.object({ ...sdkLanguage, package: z.string() }).optional(),
  python: z.object({ ...sdkLanguage, package: z.string(), project: z.string().optional() }).optional(),
  go: z.object({ ...sdkLanguage, module: z.string(), package: z.string().optional() }).optional(),
  java: z.object({ ...sdkLanguage, groupId: z.string(), artifactId: z.string(), package: z.string() }).optional(),
  csharp: z.object({ ...sdkLanguage, package: z.string() }).optional(),
  php: z.object({ ...sdkLanguage, namespace: z.string(), package: z.string().optional() }).optional(),
  /** Show SDK samples in the API reference. */
  samples: z.boolean().default(true),
});

/** `orbitdocs mock`: a mock server for each API, validating requests against the spec. */
const mock = z.object({
  port: z.number().int().default(4010),
  /** Reject requests that don't match the spec with 422 (Prism-style). */
  validate: z.boolean().default(true),
  /**
   * Custom responses by operation (`<api>/<operation slug>` or `<operation slug>`): JavaScript run in a
   * sandbox with `store`, `faker`, `req` and `res`, e.g. `return store.create('bookings', req.body)`.
   */
  handlers: z.record(z.string(), z.string()).default({}),
  /** Add a "Mock server" environment to the API client and the reference (in `orbitdocs dev`, or always when `url` is set). */
  client: z.boolean().default(true),
  /** Where readers reach the mock (a hosted mock). Default `http://localhost:<port>` in development only. */
  url: z.string().url().optional(),
});

/** `orbitdocs lint`: Spectral's OpenAPI rules, plus your own ruleset. */
const lint = z.object({
  /** A Spectral ruleset (`.spectral.yaml`), relative to the docs app. Used instead of the built-in rules. */
  ruleset: z.string().optional(),
  /** Severity that fails the command. */
  failOn: z.enum(['error', 'warn', 'info', 'hint']).default('error'),
});

/** Defaults for the API client; every reader can change them in the client's settings. */
const client = z
  .object({
    enabled: z.boolean().default(true),
    layout: z.enum(['stacked', 'side-by-side']).default('side-by-side'),
    density: z.enum(['compact', 'comfortable']).default('comfortable'),
    /** Accent colour of the client (hex). Defaults to the site accent. */
    accent: z.string().optional(),
    /** Features readers can use. */
    features: z
      .object({
        scripts: z.boolean().default(true),
        runner: z.boolean().default(true),
        history: z.boolean().default(true),
        import: z.boolean().default(true),
        environments: z.boolean().default(true),
      })
      .default({ scripts: true, runner: true, history: true, import: true, environments: true }),
  })
  .default({
    enabled: true,
    layout: 'side-by-side',
    density: 'comfortable',
    features: { scripts: true, runner: true, history: true, import: true, environments: true },
  });

export const configSchema = z.object({
  site: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    /** Public URL of the deployed site (sitemap, OG images, llms.txt). */
    url: z.url().optional(),
    logo: logo.optional(),
    /** Browser tab icon, from public/ (e.g. `/favicon.svg`). Defaults to `/icon.png`. */
    favicon: z.string().optional(),
    /** Repository link shown in the header. */
    github: z.url().optional(),
    /** Text direction. `rtl` for right-to-left languages (Arabic, Hebrew…). */
    dir: z.enum(['ltr', 'rtl']).default('ltr'),
  }),
  theme: z
    .object({
      /** Colour preset. `orbit` (default) uses the HeroUI palette everywhere; the others are Fumadocs presets. */
      preset: z.enum(THEME_PRESETS).default('orbit'),
      /** Accent colour (any CSS colour). Overrides the preset's primary. */
      accent: z.string().optional(),
      /** Default colour scheme. */
      defaultMode: z.enum(['light', 'dark', 'system']).default('system'),
      /** Theme switch in the header. */
      switch: z
        .object({ enabled: z.boolean().default(true), mode: z.enum(['light-dark', 'light-dark-system']).default('light-dark') })
        .default({ enabled: true, mode: 'light-dark' }),
      /** Layout widths (any CSS length). */
      widths: z
        .object({ layout: z.string().optional(), sidebar: z.string().optional(), toc: z.string().optional() })
        .default({}),
      /** Key that toggles light and dark mode (pressed on its own); `false` turns it off. */
      hotKey: z.union([z.string().length(1), z.literal(false)]).default('d'),
    })
    .default({ preset: 'orbit', defaultMode: 'system', switch: { enabled: true, mode: 'light-dark' }, widths: {}, hotKey: 'd' }),
  apis: z.array(api).default([]),
  navigation: z
    .object({
      /** The "Guides" link in the top bar. Point it at your first guide when the home page is a landing page; `false` hides it. */
      guides: z
        .union([z.literal(false), z.object({ text: z.string().default('Guides'), url: z.string().default('/') })])
        .default({ text: 'Guides', url: '/' }),
      /** Where the logo (or site title) in the top bar links to. */
      titleUrl: z.string().default('/'),
      /** Items in the top bar: links, icon links, buttons and menus. */
      header: z.array(headerItem).default([]),
      /** Links at the bottom of the guides sidebar. */
      sidebar: z.array(link).default([]),
      /**
       * The footer under landing pages: a list of links (one row), or columns
       * with a tagline, social icons, bottom links and a copyright line.
       */
      footer: z
        .union([
          z.array(link),
          z.object({
            /** Sentence under the logo. Defaults to `site.description`. */
            description: z.string().optional(),
            /** Titled columns of links. */
            columns: z.array(z.object({ title: z.string().min(1), links: z.array(link) })).default([]),
            /** Icon links (`icon` is a Lucide or Simple Icons name, e.g. `SiGithub`). `site.github` is added automatically. */
            social: z.array(link.extend({ icon: z.string() })).default([]),
            /** Small links in the bottom row, e.g. Privacy, Terms. */
            links: z.array(link).default([]),
            /** Bottom-row text. Defaults to `© <year> <site.title>`; `false` hides it. */
            copyright: z.union([z.string(), z.literal(false)]).optional(),
            /** "Built with OrbitDocs" in the bottom row. */
            poweredBy: z.boolean().default(true),
            /** Credit the team behind the site in the bottom row: "Built by <logo>", linked. */
            builtBy: z
              .object({
                name: z.string().min(1),
                url: z.string(),
                /** Shown instead of the name (which becomes its alt text); `light`/`dark` follow the theme. */
                logo: z.union([z.string(), z.object({ light: z.string(), dark: z.string() })]).optional(),
                /** Words before the name or logo. */
                text: z.string().default('Built by'),
              })
              .optional(),
          }),
        ])
        .default([]),
    })
    .default({ guides: { text: 'Guides', url: '/' }, titleUrl: '/', header: [], sidebar: [], footer: [] }),
  search: z
    .object({
      enabled: z.boolean().default(true),
      /** `k` = ⌘/Ctrl+K (default). Any other key opens search when pressed on its own, e.g. `/`. */
      hotKey: z.string().length(1).default('k'),
      /** Suggested links shown before the reader types. */
      links: z.array(z.object({ text: z.string(), url: z.string() })).default([]),
      /** Wait this long (ms) after the reader stops typing before searching. */
      delayMs: z.number().int().min(0).optional(),
      /** Filters under the search box: Guides and one per API. */
      tags: z.boolean().default(false),
      /** With `tags`: the reader can clear the filter and search everything. */
      allowClear: z.boolean().default(true),
    })
    .default({ enabled: true, hotKey: 'k', links: [], tags: false, allowClear: true }),
  banner: z
    .object({
      content: z.string().min(1),
      /** Bump to show a dismissed banner again. */
      id: z.string().default('banner'),
      dismissible: z.boolean().default(true),
      variant: z.enum(['normal', 'rainbow']).default('normal'),
      /** Link the whole banner points to. */
      url: z.string().optional(),
      /** Banner height (any CSS length). */
      height: z.string().default('3rem'),
      /** Colours of the `rainbow` variant's gradient. */
      rainbowColors: z.array(z.string()).optional(),
      /** Push the sticky navbar and sidebar down by the banner's height, so the banner never covers them. */
      changeLayout: z.boolean().default(true),
    })
    .optional(),
  redirects: z
    .array(
      z.object({
        from: z.string().startsWith('/'),
        to: z.string().min(1),
        permanent: z.boolean().default(true),
      }),
    )
    .default([]),
  layout: z
    .object({
      /** Fumadocs layout for guides. */
      type: z.enum(LAYOUT_TYPES).default('notebook'),
      /** Notebook: navbar on top of everything or beside the sidebar. */
      navMode: z.enum(['top', 'auto']).default('top'),
      /** Root folders as tabs: notebook `navbar` | `sidebar`; docs `top` | `auto`. */
      tabMode: z.enum(['navbar', 'sidebar', 'top', 'auto']).default('navbar'),
      /**
       * The tabs themselves. Default: one per root folder (`"root": true` in its meta.json).
       * A list replaces them; `false` shows none.
       */
      tabs: z
        .union([
          z.literal(false),
          z.array(
            z.object({
              title: z.string().min(1),
              url: z.string().min(1),
              description: z.string().optional(),
              /** Lucide or Simple Icons name. */
              icon: z.string().optional(),
            }),
          ),
        ])
        .optional(),
      /** Transparent navbar: always, only at the top of the page, or never. */
      transparentNav: z.enum(['always', 'top', 'none']).default('none'),
      sidebar: z
        .object({
          enabled: z.boolean().default(true),
          collapsible: z.boolean().default(true),
          /** Folders open by default down to this depth. */
          defaultOpenLevel: z.number().int().min(0).default(0),
          prefetch: z.boolean().default(true),
          /** Markdown-free text shown above the page tree. */
          banner: z.string().optional(),
        })
        .default({ enabled: true, collapsible: true, defaultOpenLevel: 0, prefetch: true }),
      toc: z
        .object({
          enabled: z.boolean().default(true),
          style: z.enum(['normal', 'clerk', 'block']).default('clerk'),
          /** Only highlight one heading at a time. */
          single: z.boolean().default(false),
        })
        .default({ enabled: true, style: 'clerk', single: false }),
      breadcrumb: z
        .object({
          enabled: z.boolean().default(true),
          includeRoot: z.boolean().default(false),
          includePage: z.boolean().default(false),
          /** Show the sidebar separator a page sits under as a breadcrumb item. */
          includeSeparator: z.boolean().default(false),
        })
        .default({ enabled: true, includeRoot: false, includePage: false, includeSeparator: false }),
      /** Previous / next links at the bottom of guide pages. */
      footer: z.boolean().default(true),
      /** Pages use the full width (no TOC column). */
      full: z.boolean().default(false),
      /** "Last updated" date from git. */
      lastUpdated: z.boolean().default(true),
      /** "Edit on GitHub" link. */
      editOnGithub: z
        .object({ owner: z.string(), repo: z.string(), branch: z.string().default('main'), dir: z.string().default('docs/content') })
        .optional(),
      /** Buttons on every guide page. */
      pageActions: z
        .array(z.enum(['copy-markdown', 'open-in-chatgpt', 'open-in-claude']))
        .default(['copy-markdown', 'open-in-chatgpt', 'open-in-claude']),
    })
    .default({
      type: 'notebook',
      navMode: 'top',
      tabMode: 'navbar',
      transparentNav: 'none',
      sidebar: { enabled: true, collapsible: true, defaultOpenLevel: 0, prefetch: true },
      toc: { enabled: true, style: 'clerk', single: false },
      breadcrumb: { enabled: true, includeRoot: false, includePage: false, includeSeparator: false },
      footer: true,
      full: false,
      lastUpdated: true,
      pageActions: ['copy-markdown', 'open-in-chatgpt', 'open-in-claude'],
    }),
  /** Syntax highlighting of code blocks in MDX (guides and `reference/` content), with Shiki. */
  codeBlocks: z
    .object({
      /** Shiki themes for light and dark mode, e.g. `{ light: 'vitesse-light', dark: 'vitesse-dark' }`. Default GitHub light / dark. */
      themes: z.object({ light: z.string(), dark: z.string() }).optional(),
      /** Language of a code block without one. Default `plaintext`. */
      defaultLanguage: z.string().optional(),
    })
    .default({}),
  client,
  access: access.optional(),
  ai: ai.optional(),
  sdks: sdks.optional(),
  mock: mock.optional(),
  lint: lint.default({ failOn: 'error' }),
  output: z
    .object({
      /** `static` = plain files for any host; `server` = a Next server (needed for private docs later). */
      mode: z.enum(['static', 'server']).default('static'),
      /** Path the site is served under, e.g. `/docs` when Nest serves it. */
      basePath: z.string().regex(/^(\/[^/]+)*$/, 'empty or /segment[/segment]').default(''),
    })
    .default({ mode: 'static', basePath: '' }),
});

/** What you write in `orbitdocs.config.ts`. */
export type OrbitDocsConfigInput = z.input<typeof configSchema>;
/** The config after defaults are applied. */
export type OrbitDocsConfig = z.output<typeof configSchema>;
export type ApiConfig = OrbitDocsConfig['apis'][number];
export type NestSourceConfig = z.output<typeof nestSource>;
export type ClientConfig = OrbitDocsConfig['client'];
export type AccessConfig = NonNullable<OrbitDocsConfig['access']>;
export type AuthProviderConfig = AccessConfig['providers'][number];
export type SdksConfig = NonNullable<OrbitDocsConfig['sdks']>;
export type MockConfig = NonNullable<OrbitDocsConfig['mock']>;
export type AiConfig = NonNullable<OrbitDocsConfig['ai']>;
export type AppSessionConfig = NonNullable<AccessConfig['appSession']>;

export const DEFAULT_SEND_DISABLED_MESSAGE = 'Sending requests is turned off for this API. Copy the request as code and run it yourself.';

/** Why readers can't send this API's requests from the docs; undefined when they can. */
export function sendDisabledReason(api: Pick<ApiConfig, 'send' | 'sendDisabledMessage'>): string | undefined {
  return api.send ? undefined : (api.sendDisabledMessage ?? DEFAULT_SEND_DISABLED_MESSAGE);
}

/** Typed helper for `orbitdocs.config.ts`. Returns the input unchanged. */
export function defineConfig(config: OrbitDocsConfigInput): OrbitDocsConfigInput {
  return config;
}

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid orbitdocs config:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Validates and applies defaults. Throws ConfigError listing every problem. */
export function resolveConfig(input: unknown): OrbitDocsConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const known = new Set(['*', ...Object.keys(parsed.data.access?.groups ?? {})]);
  const unknownGroups = [
    ...(parsed.data.access?.rules ?? []).flatMap((r) => r.groups),
    ...parsed.data.apis.flatMap((a) => a.access ?? []),
  ].filter((g) => !known.has(g));
  if (unknownGroups.length) throw new ConfigError([`access: unknown group(s) ${[...new Set(unknownGroups)].join(', ')}`]);
  if (parsed.data.access && !parsed.data.access.providers.length && !parsed.data.access.appSession) {
    throw new ConfigError(['access: add at least one sign-in provider, or an appSession']);
  }
  const ids = parsed.data.apis.map((a) => a.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new ConfigError([`apis: duplicate id ${[...new Set(dupes)].join(', ')}`]);
  return parsed.data;
}

/**
 * Layout options that a layout can't honour as written, as readable warnings
 * (`orbitdocs check` prints them; the docs app logs them once).
 */
export function layoutWarnings(config: Pick<OrbitDocsConfig, 'layout'>): string[] {
  const l = config.layout;
  const warnings: string[] = [];
  if (!l.sidebar.enabled) {
    if (l.type === 'docs' || l.type === 'glass') {
      warnings.push(
        `layout.sidebar.enabled: false with layout.type '${l.type}': this layout keeps the site title, header links and search in the sidebar on wide screens, so they are hidden too (small screens keep the menu). For a top navbar without a sidebar use type 'notebook' (navMode 'top').`,
      );
    }
    if (l.type === 'flux') {
      warnings.push(`layout.sidebar.enabled: false with layout.type 'flux': flux opens the page tree and header links from its menu button, which is removed, so pages are only reachable by links and search.`);
    }
    if (l.type === 'notebook' && l.navMode === 'auto') warnings.push(`layout.navMode 'auto' puts the site title in the sidebar; with layout.sidebar.enabled: false the navbar spans the page ('top').`);
    if (l.type === 'notebook' && l.tabMode === 'sidebar') warnings.push(`layout.tabMode 'sidebar' shows tabs in the sidebar; with layout.sidebar.enabled: false they move to the navbar.`);
  }
  if (l.type === 'glass') {
    const ignored = [
      l.toc.style !== 'clerk' ? `toc.style '${l.toc.style}'` : undefined,
      l.toc.single ? 'toc.single' : undefined,
      !l.breadcrumb.enabled || l.breadcrumb.includeRoot || l.breadcrumb.includePage || l.breadcrumb.includeSeparator ? 'breadcrumb' : undefined,
      !l.footer ? 'footer: false' : undefined,
    ].filter(Boolean);
    if (ignored.length) warnings.push(`layout.type 'glass' draws its own table of contents, breadcrumb and page footer; ${ignored.join(', ')} ${ignored.length === 1 ? 'is' : 'are'} ignored.`);
  }
  return warnings;
}

