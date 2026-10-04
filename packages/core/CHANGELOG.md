# @orbitdocs/core

## 0.1.0

### Initial release

- `defineConfig()` and the `orbitdocs.config.ts` schema (zod) with defaults: site, navigation (header links, footer columns and a "Built by" credit), layout, theme, banner, search, code blocks, API sources, private docs, Ask AI, SDKs and mock settings.
- API sources from a NestJS app (`routes: 'opt-in'` with `@DocsOperation`, or `'all'` for every `@nestjs/swagger` route), an OpenAPI file or a URL.
- Config warnings for options a layout ignores.
