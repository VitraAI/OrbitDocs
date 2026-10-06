# @vitra-ai/orbitdocs

## 0.2.1

### Patch Changes

- Updated dependencies [ee35366]
  - @vitra-ai/orbitdocs-auth@0.2.1
  - @vitra-ai/orbitdocs-ai@0.2.1
  - @vitra-ai/orbitdocs-core@0.2.1
  - @vitra-ai/orbitdocs-openapi@0.2.1

## 0.2.0

### Minor Changes

- b9ca837: New `orbitdocs start` command: it serves the last build so you can check the production site before you deploy it, `out/` for a static build (under `output.basePath`, with `_redirects` and `404.html`) or `next start` for a server build. New docs apps get a matching `npm start` script.

### Patch Changes

- b9ca837: `orbitdocs init` now pins new docs apps to the CLI's own version (it always wrote `^0.1.0`), and `orbitdocs --version` prints the real version.
- Updated dependencies [b9ca837]
  - @vitra-ai/orbitdocs-openapi@0.2.0
  - @vitra-ai/orbitdocs-ai@0.2.0
  - @vitra-ai/orbitdocs-auth@0.2.0
  - @vitra-ai/orbitdocs-core@0.2.0

## 0.1.0

### Initial release

- `orbitdocs init`, `dev`, `build`, `extract`, `check` and `publish`.
- `orbitdocs sdk` (TypeScript with Hey API; Python, Go, Java, C# and PHP with OpenAPI Generator), `sdk test`, and CI workflows for GitHub and GitLab.
- `orbitdocs mock` (a mock server from the spec) and `orbitdocs lint` (Spectral).
- One Nest app can feed several API references: `@DocsOperation({ api: 'payments' })` puts a route in that API only (routes without `api` stay in every API). New `omitParameters` on an API removes parameters its callers never send, such as a tenant header that an API key makes unnecessary. `standardErrors` also takes `{ extra, descriptions }` in the config, e.g. `extra: ['429']` to document a rate limit on every operation.
- Several APIs from one Nest app are extracted together: the app is compiled once per project and booted once, and each API is filtered from that one document (`extractMany` in `@vitra-ai/orbitdocs-nestjs`). A site with many APIs builds much faster.
- New `apis[].groups` option: the order of an API's groups in the sidebar and reference. Groups not listed follow in the order their first operation appears.
