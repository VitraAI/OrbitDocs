---
'@vitra-ai/orbitdocs-openapi': patch
'@vitra-ai/orbitdocs-ui': patch
---

File fields in form bodies work again: the API client shows them as file fields (one per file for a list of files) instead of a text field holding `[null]`, code samples attach a file instead of sending `files=[null]`, and the reference shows their type as `string · binary` instead of `any`. Lists in form bodies are now sent as one field per item.
