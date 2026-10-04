---
'@orbitdocs/nestjs': minor
'orbitdocs': minor
---

Several APIs from one Nest app are extracted together: the app is compiled once per project and booted once, and each API is filtered from that one document (`extractMany` in `@orbitdocs/nestjs`). A site with many APIs builds much faster.
