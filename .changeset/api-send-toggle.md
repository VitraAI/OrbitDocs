---
'@orbitdocs/core': minor
'@orbitdocs/next': minor
'@orbitdocs/ui': minor
---

New `send` option on each API (`apis[].send`, default `true`): set it to `false` to stop readers from sending that API's requests from the docs, for example for a demo API with no live server. Test Request and Send are disabled with a short reason (`sendDisabledMessage`), while code samples and Copy as cURL keep working.
