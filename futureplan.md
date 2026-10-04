# OrbitDocs future plan

Work that was deferred or left as a stopgap. Each item says why it waits, what "done" looks like, and where the code lives. Remove an item when it ships.

| Item | Area | Status | Added |
| --- | --- | --- | --- |
| [Translated guides (i18n)](#translated-guides-i18n) | Docs site (M2b) | Deferred | 2026-10-04 |
| [Social preview (OG) images](#social-preview-og-images) | Docs site (M2b) | Deferred | 2026-10-04 |
| [RSS feed](#rss-feed) | Docs site (M2b) | Deferred | 2026-10-04 |
| [Reference pages for very large APIs](#reference-pages-for-very-large-apis) | Performance | Open | 2026-10-04 |
| [SDK samples for Go, Java, C# and PHP](#sdk-samples-for-go-java-c-and-php) | SDKs | Open | 2026-10-04 |
| [Render OpenAPI webhooks](#render-openapi-webhooks) | API reference | Open | 2026-10-04 |
| [Show each oneOf variant's fields](#show-each-oneof-variants-fields) | API reference | Open | 2026-10-04 |
| [TOC style in the glass layout](#toc-style-in-the-glass-layout) | Customization | Waiting on Fumadocs | 2026-10-04 |
| [Turn Turbopack scope hoisting back on](#turn-turbopack-scope-hoisting-back-on) | Build workaround | Waiting on Next.js | 2026-10-04 |

## Translated guides (i18n)

Guides in more than one language, with a language switcher in the navbar.

- **Why it waits:** static export (`output.mode: "static"`) has no middleware to pick a language, so every page needs a `[lang]`-prefixed route generated at build time. That touches the guides route, the search index, `llms.txt` and the sidebar.
- **Done when:**
  - `i18n: { defaultLanguage, languages }` in `orbitdocs.config.ts`.
  - Guides live in `content/<lang>/…` (or `page.<lang>.mdx`) and build to `/<lang>/…`; the default language also builds at `/`.
  - A language switcher in the navbar; search and Ask AI stay per language.
  - Works in static, server and Nest modes.
- **Where:** `packages/core/src/config.ts`, `packages/next/src/source.ts`, `packages/next/src/layout.tsx`, the guides routes in the CLI template.

## Social preview (OG) images

A generated image per page, shown when a link is shared in Slack, X or LinkedIn.

- **Why it waits:** not needed for the docs to work; it was the lowest item in M2b.
- **Done when:**
  - Every guide and operation page gets `og:image` / `twitter:image` from a `/og/<path>.png` route built with `next/og` (`ImageResponse`).
  - The image shows the site logo, the page title and its section; colours follow the theme.
  - `site.og: false` turns it off, and a page's frontmatter `image:` overrides it.
  - Pre-rendered at build time in static mode.
- **Where:** a new route in the CLI template and `apps/docs`, plus metadata in `packages/next`.

## RSS feed

A feed of guide pages (changelog-style pages most of all) at `/rss.xml`.

- **Why it waits:** most useful once teams keep a changelog section; the M5 decision keeps changelogs hand-written, so this feed is how readers follow them.
- **Done when:**
  - `/rss.xml` lists pages from the folders named in config (`rss: { folders: ['changelog'] }`), newest first by frontmatter `date`.
  - Each entry has title, description, link and date; an `<link rel="alternate">` in the page head.
  - Built statically.
- **Where:** a new route in the CLI template, a helper in `packages/next`.

## Reference pages for very large APIs

Shipped 2026-10-04: each operation URL renders its own operation and loads the rest from `reference/<api>/sections/<group>.json`. Sample API (33 operations): 4.87 MB → ~227 KB per page, export 462 MB → 25 MB; `apps/docs` export 492 MB → 58 MB. What's left:

- **Floor per page:** about 160 KB plus ~2 KB per operation (sidebar, placeholders, the API client seed). A 500-operation API would pass 400 KB. Done when placeholders are one per group (expanded on load) and the client seed is fetched lazily.
- **Models:** fields load after the page even on `/models/` (rendering them inline doubled the page). Names and descriptions are in the HTML.
- **Robustness:** a failed section fetch leaves its placeholder; add a retry and an inline "Couldn't load — retry" state.
- **Slug clash:** in server mode an operation whose slug is exactly `sections` competes with the new route segment; reserve it in slug generation.
- **Where:** `packages/ui/src/reference` (`server/sections.ts`, `client/sections.tsx`), `packages/next/src/reference.tsx`.

## Render OpenAPI webhooks

`@nestjs/swagger` can emit the OpenAPI 3.1 `webhooks` section and the filter keeps it, but the reference UI never shows it. The demo API documents its five events through the Event model instead.

- **Done when:** a "Webhooks" group in the reference lists each event with its payload schema and an example, linked from the sidebar; `<Endpoint>`-style links work for events.
- **Where:** `packages/openapi` (model), `packages/ui/src/reference`.

## Show each oneOf variant's fields

A polymorphic body (`oneOf` card | wallet | bank_transfer with a discriminator) shows as a union type label; the variants are only under Models.

- **Done when:** the request body shows a variant switcher (tabs or a select keyed by the discriminator) with each variant's fields and example; the API client's body example follows the chosen variant.
- **Where:** `packages/ui/src/reference` (schema view), `packages/ui/src/api-client` (body seed).

## TOC style in the glass layout

Shipped 2026-10-04: the other Fumadocs options that were missing are config keys or overrides in the docs app's `lib/overrides.tsx` (see `/customization/fumadocs-options`). `layout.toc.style` and `layout.toc.single` still can't reach the `glass` layout.

- **Why it waits:** Fumadocs 16.15's glass `DocsPage` takes only `tableOfContent: { container, header, footer }`; its TOC has no style and its provider no `single`. `layoutWarnings()` says so.
- **Done when:** a Fumadocs release accepts them; pass them in `GuidePage` (`packages/next/src/guides.tsx`) and drop the warning in `packages/core/src/config.ts`.

## SDK samples for Go, Java, C# and PHP

TypeScript and Python samples are built per operation (the operation's own security scheme, a filled request model). Go, Java, C# and PHP samples are still OpenAPI Generator's README text with comments removed.

- **Done when:** each uses the operation's security scheme and env var (`API_KEY`, `BEARER_TOKEN`), builds its client once and fills the request from the operation's example, like `pythonSample()` in `packages/cli/src/commands/sdk.ts`.

## Turn Turbopack scope hoisting back on

`withOrbitDocs` sets `experimental.turbopackScopeHoisting: false`.

- **Why:** Next.js 16.3.8 production builds with scope hoisting bound a react-aria module's exports to the wrong module, so `useOverlayTrigger` (used by HeroUI's Modal and Drawer) was undefined while prerendering `/client` in `apps/docs`. Turning hoisting off fixed it; dev mode was never affected.
- **Done when:** a Next.js release builds `apps/docs` and `examples/nest-sample/docs` with hoisting on. Then remove the setting and its comment.
- **How to check:** delete the line in `packages/next/src/plugin.ts`, rebuild `packages/next`, run `pnpm build` in both apps. Both must export every page, `/client` included.
- **Where:** `packages/next/src/plugin.ts`. An app can already opt back in through its own `next.experimental`.
