import { WORKER_SOURCE } from './script-worker';
import type { KV, ResponseData, TestResult } from './types';

export interface ScriptRequest {
  url: string;
  method: string;
  headers: KV[];
  body?: string;
}

export interface ScriptOutcome {
  tests: TestResult[];
  logs: string[];
  error?: string;
  request: ScriptRequest;
  /** Request-scoped variables after the script. */
  variables: Record<string, string>;
  /** Environment keys set (string) or unset (null) by the script. */
  environment: Record<string, string | null>;
  globals: Record<string, string | null>;
}

let workerUrl: string | undefined;

/**
 * Runs a script in a fresh Web Worker (no DOM, no access to the page's storage
 * or credentials), with a timeout. Every run gets its own worker.
 */
export function runScript(input: {
  script: string;
  phase: 'pre' | 'post';
  request: ScriptRequest;
  response?: ResponseData;
  environment: Record<string, string>;
  globals: Record<string, string>;
  variables: Record<string, string>;
  info: { id: string; name: string };
  timeoutMs?: number;
}): Promise<ScriptOutcome> {
  if (!input.script.trim()) {
    return Promise.resolve({ tests: [], logs: [], request: input.request, variables: input.variables, environment: {}, globals: {} });
  }
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  const { timeoutMs = 5000, ...message } = input;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ tests: [], logs: [], error: `Script timed out after ${timeoutMs} ms`, request: input.request, variables: input.variables, environment: {}, globals: {} });
    }, timeoutMs);
    worker.onmessage = (e: MessageEvent<ScriptOutcome>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ tests: [], logs: [], error: e.message, request: input.request, variables: input.variables, environment: {}, globals: {} });
    };
    worker.postMessage(message);
  });
}
