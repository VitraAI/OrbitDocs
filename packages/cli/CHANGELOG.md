# orbitdocs

## 0.2.0

### Minor Changes

- f0882a8: One Nest app can feed several API references: `@DocsOperation({ api: 'payments' })` puts a route in that API only (routes without `api` stay in every API). New `omitParameters` on an API removes parameters its callers never send, such as a tenant header that an API key makes unnecessary.

  `standardErrors` also takes `{ extra, descriptions }` in the config, e.g. `extra: ['429']` to document a rate limit on every operation.

- f0bd3ea: Several APIs from one Nest app are extracted together: the app is compiled once per project and booted once, and each API is filtered from that one document (`extractMany` in `@orbitdocs/nestjs`). A site with many APIs builds much faster.
- f0bd3ea: New `apis[].groups` option: the order of an API's groups in the sidebar and reference. Groups not listed follow in the order their first operation appears.

### Patch Changes

- Updated dependencies [f0882a8]
- Updated dependencies [0e20543]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0bd3ea]
  - @orbitdocs/core@0.2.0
  - @orbitdocs/openapi@0.2.0
  - @orbitdocs/ai@0.2.0
  - @orbitdocs/auth@0.2.0

## 0.1.0

### Initial release

- `orbitdocs init`, `dev`, `build`, `extract`, `check` and `publish`.
- `orbitdocs sdk` (TypeScript with Hey API; Python, Go, Java, C# and PHP with OpenAPI Generator), `sdk test`, and CI workflows for GitHub and GitLab.
- `orbitdocs mock` (a mock server from the spec) and `orbitdocs lint` (Spectral).
