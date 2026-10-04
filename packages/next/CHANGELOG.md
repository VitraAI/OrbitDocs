# @orbitdocs/next

## 0.1.0

### Initial release

- `withOrbitDocs()` Next.js plugin and the docs app's routes: guides (MDX), API reference, API client, `llms.txt`, Markdown twins of every page; static export, server mode (`proxy.ts`) or served by Nest.
- Fumadocs layouts (docs, notebook, flux, glass, home) driven by the config, and `lib/overrides.tsx` (`OrbitOverrides`) for React-only options.
- Animated landing-page components: `Hero` (with `logo` and `footnote`), `Section`, `Features`, `Bento`, `CodeShowcase`, `Terminal`, `Flow`, `Stats`, `Logos`, `Showcase`, `BrowserFrame`, `Comparison`, `CallToAction` and `SiteFooter` (columns, social links and a "Built by" credit).
- Reference pages render one operation and load the rest by group, so large APIs stay small per page.
- Private docs in static builds: reader variants of the sidebar, search index, API menu and specs.
- GitHub-style alerts and extra content per API operation (`content/reference/<api>/<op>.mdx`).
