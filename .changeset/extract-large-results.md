---
'@vitra-ai/orbitdocs': patch
'@vitra-ai/orbitdocs-nestjs': patch
---

Fix `orbitdocs extract` / `orbitdocs build` failing with "Unterminated string in JSON" when the extraction result is large (many APIs, many documentation gaps). The extractor child now exits only after its result has been flushed to stdout, and the CLI parses the result on the child's `close` event, after stdout has been read to the end, instead of on `exit`.
