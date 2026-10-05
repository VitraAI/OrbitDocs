# @vitra-ai/orbitdocs-ai

## 0.1.0

### Initial release

- Ask AI: streamed, cited answers from the docs with OpenAI, Anthropic, Google or any OpenAI-compatible provider; only pages the reader may open are used.
- Docs MCP server (`/mcp`) and one MCP server per API (`/mcp/<api>`) whose tools call the API with the client's credentials.
- A provider failure is reported to the reader as an error with its HTTP status, never as an empty answer.
