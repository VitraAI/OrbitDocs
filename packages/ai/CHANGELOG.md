# @vitra-ai/orbitdocs-ai

## 0.2.1

### Patch Changes

- Updated dependencies [ee35366]
  - @vitra-ai/orbitdocs-auth@0.2.1
  - @vitra-ai/orbitdocs-openapi@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [b9ca837]
  - @vitra-ai/orbitdocs-openapi@0.2.0
  - @vitra-ai/orbitdocs-auth@0.2.0

## 0.1.0

### Initial release

- Ask AI: streamed, cited answers from the docs with OpenAI, Anthropic, Google or any OpenAI-compatible provider; only pages the reader may open are used.
- Docs MCP server (`/mcp`) and one MCP server per API (`/mcp/<api>`) whose tools call the API with the client's credentials.
- A provider failure is reported to the reader as an error with its HTTP status, never as an empty answer.
