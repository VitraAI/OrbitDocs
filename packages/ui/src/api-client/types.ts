/** A key/value row (params, headers, form fields, variables). */
export interface KV {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  /** form-data only: this row is a file. */
  file?: boolean;
}

export type BodyMode = 'none' | 'json' | 'raw' | 'form-urlencoded' | 'multipart';

export interface BodyDraft {
  mode: BodyMode;
  raw: string;
  /** Content-Type for `raw`. */
  contentType?: string;
  form: KV[];
}

export type AuthDraft =
  | { type: 'inherit' }
  | { type: 'none' }
  | { type: 'apiKey'; in: 'header' | 'query'; name: string; value: string }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'oauth2'; tokenUrl: string; clientId: string; clientSecret: string; scope: string; token: string };

export interface RequestDraft {
  id: string;
  collectionId: string;
  name: string;
  method: string;
  /** May contain `{{variables}}`; relative URLs are prefixed with `{{baseUrl}}`. */
  url: string;
  params: KV[];
  headers: KV[];
  body: BodyDraft;
  auth: AuthDraft;
  preRequestScript: string;
  postResponseScript: string;
  /** Folder (tag) inside the collection. */
  folder?: string;
  /** Operation it was generated from (`travel/create-a-booking`). */
  operation?: string;
  /** Fingerprint of the request as generated; equal to its current content = never edited. */
  seedHash?: string;
}

export interface Variable {
  key: string;
  value: string;
  enabled: boolean;
  /** Secret: masked in the UI, never exported, kept in this browser only. */
  secret?: boolean;
}

export interface Environment {
  id: string;
  name: string;
  /** Collection it belongs to; undefined = available everywhere. */
  collectionId?: string;
  variables: Variable[];
  /** Dot colour in the environment picker (hex). */
  color?: string;
  /** Sends ask for confirmation first (when enabled in settings). */
  production?: boolean;
}

export interface Collection {
  id: string;
  name: string;
  /** Default auth for requests set to `inherit`. */
  auth: AuthDraft;
  /** Folder order. */
  folders: string[];
  /** Generated from an OpenAPI document (re-synced on load). */
  source?: { api: string };
  /** Readers can't send this collection's requests (config `send: false`): why, shown instead. */
  sendDisabled?: string;
  preRequestScript: string;
  postResponseScript: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  /** Milliseconds. */
  time: number;
  size: number;
  url: string;
  error?: string;
}

export interface RunResult {
  requestId: string;
  response?: ResponseData;
  tests: TestResult[];
  logs: string[];
  error?: string;
  at: number;
}

export interface Workspace {
  version: 1;
  collections: Collection[];
  requests: RequestDraft[];
  globals: Variable[];
  environments: Environment[];
  activeEnvironmentId?: string;
  history: Array<RunResult & { method: string; url: string; name: string }>;
}
