---
'@orbitdocs/core': minor
'@orbitdocs/openapi': minor
'@orbitdocs/nestjs': minor
'orbitdocs': minor
---

One Nest app can feed several API references: `@DocsOperation({ api: 'payments' })` puts a route in that API only (routes without `api` stay in every API). New `omitParameters` on an API removes parameters its callers never send, such as a tenant header that an API key makes unnecessary.

`standardErrors` also takes `{ extra, descriptions }` in the config, e.g. `extra: ['429']` to document a rate limit on every operation.
