# @orbitdocs/nestjs

## 0.2.0

### Minor Changes

- f0882a8: One Nest app can feed several API references: `@DocsOperation({ api: 'payments' })` puts a route in that API only (routes without `api` stay in every API). New `omitParameters` on an API removes parameters its callers never send, such as a tenant header that an API key makes unnecessary.

  `standardErrors` also takes `{ extra, descriptions }` in the config, e.g. `extra: ['429']` to document a rate limit on every operation.

- f0bd3ea: Several APIs from one Nest app are extracted together: the app is compiled once per project and booted once, and each API is filtered from that one document (`extractMany` in `@orbitdocs/nestjs`). A site with many APIs builds much faster.
- f0882a8: Extraction sets `ORBITDOCS_EXTRACT=1` while it loads your Nest module, so the app can skip startup-only checks such as config validation that needs real secrets.

### Patch Changes

- Updated dependencies [f0882a8]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0bd3ea]
  - @orbitdocs/openapi@0.2.0
  - @orbitdocs/ai@0.2.0
  - @orbitdocs/auth@0.2.0

## 0.1.0

### Initial release

- `@DocsOperation` and `@DocsContent` decorators, and spec extraction from a Nest app (preview mode, no database needed).
- `mountOrbitDocs()` serves the docs site from the Nest app, with private docs and Ask AI on the same server.
