---
'@vitra-ai/orbitdocs-auth': patch
---

`react` is now a peer dependency (`^18.0.0 || ^19.0.0`) instead of a hard `^19.3.0` dependency. The hard dependency could lift a host app's `react` above its `react-dom`, and `react-dom/server` refuses to run when the two differ.
