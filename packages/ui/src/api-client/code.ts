import { buildRequest, type SendContext } from './send';
import type { AuthDraft, KV, RequestDraft, Variable } from './types';

/**
 * Generated code (Code tab, Copy as cURL) is copied, pasted into chats and
 * committed. By default it carries no secret value: secret variables stay as
 * `{{name}}` references and literal credentials become `YOUR_…` placeholders.
 */
export interface CodeOptions {
  /** Put the real values of secret variables and auth fields in the code. Off by default. */
  includeSecrets?: boolean;
}

/** Variable names that hold credentials, even when not marked secret. */
const SECRET_VARIABLE = /key|token|secret|passw(or)?d|pwd|credential|cookie|session/i;
/** Header names that carry credentials. */
const SECRET_HEADER = /^(authorization|proxy-authorization|cookie)$|api[-_]?key|token|secret|passw(or)?d|credential|session/i;
/** Query parameter names that carry credentials (narrower: `page_token` is not one). */
const SECRET_PARAM = /^(api[-_]?key|key|token|access[-_]?token|auth|secret|client[-_]?secret|passw(or)?d|sig|signature)$/i;
const ONLY_VARIABLE = /^\s*\{\{\s*([$\w.-]+)\s*\}\}\s*$/;

/** Variables whose values never go into generated code by default: marked secret, or named like a credential. */
export function secretVariableNames(globals: Variable[], environmentVariables: Variable[] = []): Set<string> {
  return new Set([...globals, ...environmentVariables].filter((v) => v.secret || SECRET_VARIABLE.test(v.key)).map((v) => v.key));
}

/** A field that is just `{{name}}` keeps the reference; anything else becomes the placeholder. */
function placeholder(value: string, fallback: string): string {
  const m = ONLY_VARIABLE.exec(value);
  return m ? `{{${m[1]}}}` : fallback;
}

const upper = (name: string) =>
  `YOUR_${name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase() || 'SECRET'}`;

/** A credential header or parameter typed in by hand: keep the scheme (`Bearer`), hide the value. */
function maskField(names: RegExp, row: KV): KV {
  if (!names.test(row.key) || ONLY_VARIABLE.test(row.value) || !row.value) return row;
  const scheme = /^(Bearer|Basic|Token|Digest)\s+/i.exec(row.value)?.[1];
  return { ...row, value: scheme ? `${scheme} ${scheme.toLowerCase() === 'basic' ? 'YOUR_BASE64_CREDENTIALS' : 'YOUR_TOKEN'}` : upper(row.key) };
}

/** Auth with its secret fields replaced by references or placeholders. Basic and OAuth become a plain header. */
function placeholderAuth(auth: AuthDraft): { auth: AuthDraft; header?: KV } {
  switch (auth.type) {
    case 'apiKey':
      return { auth: { ...auth, value: placeholder(auth.value, 'YOUR_API_KEY') } };
    case 'bearer':
      return { auth: { ...auth, token: placeholder(auth.token, 'YOUR_TOKEN') } };
    case 'basic':
      // Base64 of a placeholder is unreadable: say what goes there instead.
      return { auth: { type: 'none' }, header: { key: 'Authorization', value: 'Basic YOUR_BASE64_CREDENTIALS', enabled: true } };
    case 'oauth2':
      // Never fetch a token just to show code.
      return { auth: { type: 'none' }, header: { key: 'Authorization', value: `Bearer ${placeholder(auth.token, 'YOUR_ACCESS_TOKEN')}`, enabled: true } };
    default:
      return { auth };
  }
}

/** `{{name}}` that went through URL encoding, back to its readable form. */
export function unescapeVariables(text: string): string {
  return text.replace(/%7B%7B\s*([$\w.-]+)\s*%7D%7D/gi, '{{$1}}');
}

/** The request as generated code shows it: secrets hidden unless `includeSecrets`. */
export async function codeRequest(draft: RequestDraft, ctx: SendContext, vars: Record<string, string>, options: CodeOptions = {}) {
  if (options.includeSecrets) return buildRequest(draft, ctx, vars);
  const secret = secretVariableNames(ctx.globals, ctx.environment?.variables);
  // Unknown names stay as written, so secret variables print as `{{name}}`.
  const visible = Object.fromEntries(Object.entries(vars).filter(([k]) => !secret.has(k) && !SECRET_VARIABLE.test(k)));
  const effective = draft.auth.type === 'inherit' ? (ctx.collection?.auth ?? { type: 'none' as const }) : draft.auth;
  const { auth, header } = placeholderAuth(effective);
  const safe: RequestDraft = {
    ...draft,
    auth,
    params: draft.params.map((p) => maskField(SECRET_PARAM, p)),
    headers: [...draft.headers.map((h) => maskField(SECRET_HEADER, h)), ...(header ? [header] : [])],
  };
  const req = await buildRequest(safe, ctx, visible);
  return { ...req, url: unescapeVariables(req.url) };
}

const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** A request as a cURL command. */
export function toCurl(req: { method: string; url: string; headers: Array<{ key: string; value: string }>; body?: string }): string {
  return [`curl -X ${req.method} ${quote(req.url)}`, ...req.headers.map((h) => `  -H ${quote(`${h.key}: ${h.value}`)}`), ...(req.body ? [`  --data ${quote(req.body)}`] : [])].join(' \\\n');
}
