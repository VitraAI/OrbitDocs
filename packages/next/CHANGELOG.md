# @orbitdocs/next

## 0.2.0

### Minor Changes

- 0e20543: New `send` option on each API (`apis[].send`, default `true`): set it to `false` to stop readers from sending that API's requests from the docs, for example for a demo API with no live server. Test Request and Send are disabled with a short reason (`sendDisabledMessage`), while code samples and Copy as cURL keep working.
- f0bd3ea: - New `navigation.apiSwitcher` option (default `sidebar`): with several APIs, the reference sidebar's title is a select of the APIs, and "API Reference" in the top bar links to the first API. `menu` keeps the top-bar menu of every API.
  - The API client's collections are a tree: each collection and folder opens and closes, shows its number of requests, and remembers its state in the browser. Only the open request's folder is expanded at first; a search expands every match, and one button collapses or expands every folder.
  - Browsers and password managers no longer autofill the reference filter or the API client's search fields. API keys and other secrets are masked with CSS instead of password fields, which made browsers treat the page as a login form.
  - The API client seeds one environment per server, shared by every API on it, instead of one copy per API. Copies saved by earlier versions fold into it, keeping the values the reader typed.
  - Long examples and inline code (tokens, keys, URLs) wrap in the reference instead of making the page scroll sideways.

### Patch Changes

- Updated dependencies [f0882a8]
- Updated dependencies [0e20543]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0882a8]
  - @orbitdocs/core@0.2.0
  - @orbitdocs/openapi@0.2.0
  - @orbitdocs/ui@0.2.0
  - @orbitdocs/ai@0.2.0
  - @orbitdocs/auth@0.2.0

## 0.1.0

### Initial release

- `withOrbitDocs()` Next.js plugin and the docs app's routes: guides (MDX), API reference, API client, `llms.txt`, Markdown twins of every page; static export, server mode (`proxy.ts`) or served by Nest.
- Fumadocs layouts (docs, notebook, flux, glass, home) driven by the config, and `lib/overrides.tsx` (`OrbitOverrides`) for React-only options.
- Animated landing-page components: `Hero` (with `logo` and `footnote`), `Section`, `Features`, `Bento`, `CodeShowcase`, `Terminal`, `Flow`, `Stats`, `Logos`, `Showcase`, `BrowserFrame`, `Comparison`, `CallToAction` and `SiteFooter` (columns, social links and a "Built by" credit).
- Reference pages render one operation and load the rest by group, so large APIs stay small per page.
- Private docs in static builds: reader variants of the sidebar, search index, API menu and specs.
- GitHub-style alerts and extra content per API operation (`content/reference/<api>/<op>.mdx`).
