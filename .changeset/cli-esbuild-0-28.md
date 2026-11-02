---
'@vitra-ai/orbitdocs': patch
---

Move to esbuild 0.28, which fixes GHSA-g7r4-m6w7-qqqr (a Windows-only path traversal in
esbuild's development server). OrbitDocs only uses esbuild's `build()`, so it was not exposed, but
projects that install OrbitDocs no longer get a flagged esbuild.
