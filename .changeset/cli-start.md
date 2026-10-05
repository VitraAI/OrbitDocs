---
'@vitra-ai/orbitdocs': minor
---

New `orbitdocs start` command: it serves the last build so you can check the production site before you deploy it, `out/` for a static build (under `output.basePath`, with `_redirects` and `404.html`) or `next start` for a server build. New docs apps get a matching `npm start` script.
