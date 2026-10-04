/**
 * Everything the AI server needs, without secrets: written by the CLI to
 * `.orbitdocs/ai.json` and copied into the build as `orbitdocs-ai.json`
 * (never served to readers).
 */
export interface AiManifest {
  version: 1;
  /** Site path prefix (`/docs`), or ''. */
  basePath: string;
  site: { title: string; url?: string };
  ai: AiSettings;
  /** Guides and API operations as Markdown pages. */
  pages: AiPage[];
  apis: AiApi[];
}

export interface AiSettings {
  provider: 'openai' | 'anthropic' | 'google' | 'openai-compatible';
  model: string;
  apiKeyEnv: string;
  baseUrl?: string;
  askAi: { enabled: boolean; greeting?: string; suggestions: string[]; instructions?: string; maxSources: number };
  mcp: { docs: boolean; apis: boolean | string[]; tools: 'per-operation' | 'search-execute' };
}

export interface AiPage {
  /** Site URL without base path (`/quickstart`, `/reference/travel/create-a-booking`). */
  url: string;
  title: string;
  description?: string;
  kind: 'guide' | 'operation';
  /** For operations: the API id. */
  api?: string;
  markdown: string;
}

export interface AiParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema?: unknown;
}

export interface AiOperation {
  slug: string;
  /** MCP tool name (snake_case, ≤ 64 characters). */
  tool: string;
  method: string;
  path: string;
  title: string;
  description?: string;
  params: AiParam[];
  body?: { mediaType: string; required: boolean; schema?: unknown };
  /** JSON Schema of the tool input: params by name, plus `body`. */
  inputSchema: Record<string, unknown>;
}

export interface AiApi {
  id: string;
  title: string;
  description?: string;
  /** Base URL the API MCP calls. */
  serverUrl?: string;
  /** Headers that carry credentials (from security schemes): passed through from the MCP client. */
  credentialHeaders: string[];
  operations: AiOperation[];
}
