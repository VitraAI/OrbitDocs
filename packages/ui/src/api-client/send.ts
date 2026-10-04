import { runScript, type ScriptRequest } from './scripts';
import type { AuthDraft, Collection, Environment, KV, RequestDraft, ResponseData, RunResult, TestResult, Variable } from './types';
import { interpolate, scope } from './variables';

export interface SendContext {
  collection: Collection | undefined;
  environment: Environment | undefined;
  globals: Variable[];
  /** Variables carried between requests in one run (collection runner). */
  runVariables?: Record<string, string>;
  signal?: AbortSignal;
}

export interface SendOutcome extends RunResult {
  /** Variable writes from scripts, to persist. */
  environment: Record<string, string | null>;
  globals: Record<string, string | null>;
  runVariables: Record<string, string>;
}

const enabled = (rows: KV[]) => rows.filter((r) => r.enabled && r.key);

function effectiveAuth(draft: RequestDraft, collection: Collection | undefined): AuthDraft {
  return draft.auth.type === 'inherit' ? (collection?.auth ?? { type: 'none' }) : draft.auth;
}

async function oauthToken(auth: Extract<AuthDraft, { type: 'oauth2' }>, vars: Record<string, string>): Promise<string> {
  if (auth.token) return interpolate(auth.token, vars);
  const res = await fetch(interpolate(auth.tokenUrl, vars), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: interpolate(auth.clientId, vars),
      client_secret: interpolate(auth.clientSecret, vars),
      ...(auth.scope ? { scope: interpolate(auth.scope, vars) } : {}),
    }),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error(`OAuth2 token request failed (${res.status})`);
  return json.access_token;
}

/** Builds the concrete request (variables resolved, auth applied) for scripts and sending. */
export async function buildRequest(draft: RequestDraft, ctx: SendContext, vars: Record<string, string>): Promise<ScriptRequest & { form?: KV[] }> {
  let url = interpolate(draft.url, vars);
  if (!/^https?:\/\//i.test(url) && vars.baseUrl) url = `${vars.baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  const u = new URL(url, typeof window === 'undefined' ? 'http://localhost' : window.location.href);
  for (const p of enabled(draft.params)) u.searchParams.append(interpolate(p.key, vars), interpolate(p.value, vars));
  const headers: KV[] = enabled(draft.headers).map((h) => ({ ...h, key: interpolate(h.key, vars), value: interpolate(h.value, vars) }));
  const auth = effectiveAuth(draft, ctx.collection);
  if (auth.type === 'apiKey' && auth.name) {
    const value = interpolate(auth.value, vars);
    if (auth.in === 'query') u.searchParams.set(auth.name, value);
    else headers.push({ key: auth.name, value, enabled: true });
  } else if (auth.type === 'bearer') {
    headers.push({ key: 'Authorization', value: `Bearer ${interpolate(auth.token, vars)}`, enabled: true });
  } else if (auth.type === 'basic') {
    headers.push({ key: 'Authorization', value: `Basic ${btoa(`${interpolate(auth.username, vars)}:${interpolate(auth.password, vars)}`)}`, enabled: true });
  } else if (auth.type === 'oauth2') {
    headers.push({ key: 'Authorization', value: `Bearer ${await oauthToken(auth, vars)}`, enabled: true });
  }
  const b = draft.body;
  let body: string | undefined;
  const has = (name: string) => headers.some((h) => h.key.toLowerCase() === name);
  if (b.mode === 'json' || b.mode === 'raw') {
    body = interpolate(b.raw, vars);
    if (!has('content-type')) headers.push({ key: 'Content-Type', value: b.mode === 'json' ? 'application/json' : (b.contentType ?? 'text/plain'), enabled: true });
  } else if (b.mode === 'form-urlencoded') {
    body = new URLSearchParams(enabled(b.form).map((f) => [interpolate(f.key, vars), interpolate(f.value, vars)])).toString();
    if (!has('content-type')) headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true });
  }
  return { url: u.toString(), method: draft.method.toUpperCase(), headers, body, ...(b.mode === 'multipart' ? { form: enabled(b.form) } : {}) };
}

/** Files picked for multipart rows, keyed by `<requestId>:<row index>` (not persisted). */
export const pickedFiles = new Map<string, File>();

/** Pre-request script → send → post-response script and tests. */
export async function sendRequest(draft: RequestDraft, ctx: SendContext): Promise<SendOutcome> {
  const env = Object.fromEntries((ctx.environment?.variables ?? []).filter((v) => v.enabled).map((v) => [v.key, v.value]));
  const globals = Object.fromEntries(ctx.globals.filter((v) => v.enabled).map((v) => [v.key, v.value]));
  let runVars = { ...ctx.runVariables };
  const envWrites: Record<string, string | null> = {};
  const globalWrites: Record<string, string | null> = {};
  const tests: TestResult[] = [];
  const logs: string[] = [];
  const at = Date.now();
  const apply = (target: Record<string, string>, writes: Record<string, string | null>, into: Record<string, string | null>) => {
    for (const [k, v] of Object.entries(writes)) {
      into[k] = v;
      if (v === null) delete target[k];
      else target[k] = v;
    }
  };
  const info = { id: draft.id, name: draft.name };

  try {
    let vars = scope(ctx.globals, ctx.environment, runVars);
    let request = await buildRequest(draft, ctx, vars);
    for (const script of [ctx.collection?.preRequestScript ?? '', draft.preRequestScript]) {
      const pre = await runScript({ script, phase: 'pre', request, environment: env, globals, variables: runVars, info });
      tests.push(...pre.tests);
      logs.push(...pre.logs);
      if (pre.error) throw new Error(`Pre-request script: ${pre.error}`);
      apply(env, pre.environment, envWrites);
      apply(globals, pre.globals, globalWrites);
      runVars = pre.variables;
      request = { ...request, ...pre.request };
    }
    // Scripts may have set variables used by the request itself.
    vars = { ...globals, ...env, ...runVars };
    request = { ...request, url: interpolate(request.url, vars), headers: request.headers.map((h) => ({ ...h, value: interpolate(h.value, vars) })), body: request.body && interpolate(request.body, vars) };

    let payload: BodyInit | undefined = request.body;
    if (request.form) {
      const fd = new FormData();
      request.form.forEach((f, i) => {
        const file = f.file ? pickedFiles.get(`${draft.id}:${i}`) : undefined;
        if (file) fd.append(f.key, file);
        else if (!f.file) fd.append(interpolate(f.key, vars), interpolate(f.value, vars));
      });
      payload = fd;
    }
    const started = performance.now();
    let response: ResponseData;
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: request.headers.map((h) => [h.key, h.value] as [string, string]),
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : payload,
        signal: ctx.signal,
      });
      const text = await res.text();
      response = {
        status: res.status,
        statusText: res.statusText,
        headers: [...res.headers.entries()],
        body: text,
        time: Math.round(performance.now() - started),
        size: new TextEncoder().encode(text).length,
        url: request.url,
      };
    } catch (e) {
      response = {
        status: 0,
        statusText: 'Network error',
        headers: [],
        body: '',
        time: Math.round(performance.now() - started),
        size: 0,
        url: request.url,
        error: `${(e as Error).message}. The API must allow this origin in CORS, or use a proxy.`,
      };
    }

    for (const script of [ctx.collection?.postResponseScript ?? '', draft.postResponseScript]) {
      const post = await runScript({ script, phase: 'post', request, response, environment: env, globals, variables: runVars, info });
      tests.push(...post.tests);
      logs.push(...post.logs);
      if (post.error) logs.push(`error: Post-response script: ${post.error}`);
      apply(env, post.environment, envWrites);
      apply(globals, post.globals, globalWrites);
      runVars = post.variables;
    }
    return { requestId: draft.id, response, tests, logs, at, environment: envWrites, globals: globalWrites, runVariables: runVars };
  } catch (e) {
    return { requestId: draft.id, tests, logs, at, error: (e as Error).message, environment: envWrites, globals: globalWrites, runVariables: runVars };
  }
}
