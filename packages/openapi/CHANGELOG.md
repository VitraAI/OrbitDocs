# @vitra-ai/orbitdocs-openapi

## 0.2.1

No changes in this release.

## 0.2.0

### Patch Changes

- b9ca837: File fields in form bodies work again: the API client shows them as file fields (one per file for a list of files) instead of a text field holding `[null]`, code samples attach a file instead of sending `files=[null]`, and the reference shows their type as `string · binary` instead of `any`. Lists in form bodies are now sent as one field per item.

## 0.1.0

### Initial release

- Loads, upgrades and bundles OpenAPI 3.0/3.1 (and Swagger 2.0) documents into the reference model the UI renders: groups, operations, parameters, bodies, responses, examples and models.
- Stable slugs and `stableStringify()` for reproducible specs; operation pages as Markdown for search, `llms.txt` and Ask AI.
- Per-status example bodies, including NestJS's default error bodies.
- One Nest app can feed several API references: `@DocsOperation({ api: 'payments' })` puts a route in that API only (routes without `api` stay in every API). New `omitParameters` on an API removes parameters its callers never send, such as a tenant header that an API key makes unnecessary. `standardErrors` also takes `{ extra, descriptions }` in the config, e.g. `extra: ['429']` to document a rate limit on every operation.
- Documentation gaps no longer report file downloads (a non-JSON response with a schema, such as a PDF or CSV) as missing a response schema, or binary file fields as missing an example. A DELETE with an empty body is not reported either.
- New `apis[].groups` option: the order of an API's groups in the sidebar and reference. Groups not listed follow in the order their first operation appears.
