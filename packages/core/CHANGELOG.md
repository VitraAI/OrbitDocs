# @vitra-ai/orbitdocs-core

## 0.2.0

No changes in this release.

## 0.1.0

### Initial release

- `defineConfig()` and the `orbitdocs.config.ts` schema (zod) with defaults: site, navigation (header links, footer columns and a "Built by" credit), layout, theme, banner, search, code blocks, API sources, private docs, Ask AI, SDKs and mock settings.
- API sources from a NestJS app (`routes: 'opt-in'` with `@DocsOperation`, or `'all'` for every `@nestjs/swagger` route), an OpenAPI file or a URL.
- Config warnings for options a layout ignores.
- One Nest app can feed several API references: `@DocsOperation({ api: 'payments' })` puts a route in that API only (routes without `api` stay in every API). New `omitParameters` on an API removes parameters its callers never send, such as a tenant header that an API key makes unnecessary. `standardErrors` also takes `{ extra, descriptions }` in the config, e.g. `extra: ['429']` to document a rate limit on every operation.
- New `send` option on each API (`apis[].send`, default `true`): set it to `false` to stop readers from sending that API's requests from the docs, for example for a demo API with no live server. Test Request and Send are disabled with a short reason (`sendDisabledMessage`), while code samples and Copy as cURL keep working.
- New `apis[].groups` option: the order of an API's groups in the sidebar and reference. Groups not listed follow in the order their first operation appears.
- - New `navigation.apiSwitcher` option (default `sidebar`): with several APIs, the reference sidebar's title is a select of the APIs, and "API Reference" in the top bar links to the first API. `menu` keeps the top-bar menu of every API. - The API client's collections are a tree: each collection and folder opens and closes, shows its number of requests, and remembers its state in the browser. Only the open request's folder is expanded at first; a search expands every match, and one button collapses or expands every folder. - Browsers and password managers no longer autofill the reference filter or the API client's search fields. API keys and other secrets are masked with CSS instead of password fields, which made browsers treat the page as a login form. - The API client seeds one environment per server, shared by every API on it, instead of one copy per API. Copies saved by earlier versions fold into it, keeping the values the reader typed. - Long examples and inline code (tokens, keys, URLs) wrap in the reference instead of making the page scroll sideways.
