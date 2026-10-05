import type { OperationModel, ReferenceModel } from '@vitra-ai/orbitdocs-openapi';
import { snippetz } from '@scalar/snippetz';

import { highlight } from './highlight';
import { highlightLanguage, SAMPLE_LANGUAGES } from './languages';

type Har = Parameters<ReturnType<typeof snippetz>['print']>[2];
type Pair = { name: string; value: string };

/** Placeholder credential per security scheme type (replaced in the browser once a reader enters one). */
export const PLACEHOLDERS = {
  apiKey: 'YOUR_API_KEY',
  bearer: 'YOUR_TOKEN',
  basic: 'dXNlcm5hbWU6cGFzc3dvcmQ=',
} as const;

function authFor(op: OperationModel, model: ReferenceModel): { headers: Pair[]; query: Pair[] } {
  const headers: Pair[] = [];
  const query: Pair[] = [];
  const requirement = op.security.find((r) => Object.keys(r).length > 0);
  for (const name of Object.keys(requirement ?? {})) {
    const scheme = model.securitySchemes[name] as Record<string, string> | undefined;
    if (!scheme) continue;
    if (scheme.type === 'apiKey') {
      const pair = { name: scheme.name ?? 'X-API-Key', value: PLACEHOLDERS.apiKey };
      if (scheme.in === 'query') query.push(pair);
      else if (scheme.in === 'header') headers.push(pair);
    } else if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic') {
      headers.push({ name: 'Authorization', value: `Basic ${PLACEHOLDERS.basic}` });
    } else if (scheme.type === 'http' || scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
      headers.push({ name: 'Authorization', value: `Bearer ${PLACEHOLDERS.bearer}` });
    }
  }
  return { headers, query };
}

const stringify = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** The request an operation's code samples show: example values filled in. */
export function exampleRequest(op: OperationModel, model: ReferenceModel, serverUrl: string): Har {
  let path = op.path;
  const query: Pair[] = [];
  const headers: Pair[] = [];
  for (const p of op.parameters) {
    const value = p.example ?? p.schema?.default ?? p.schema?.enum?.[0];
    if (p.in === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(stringify(value ?? p.name)));
    // Optional parameters only when they carry an example, so samples stay short.
    else if (p.in === 'query' && (p.required || p.example !== undefined)) query.push({ name: p.name, value: stringify(value ?? '') });
    else if (p.in === 'header' && (p.required || p.example !== undefined)) headers.push({ name: p.name, value: stringify(value ?? '') });
  }
  const auth = authFor(op, model);
  const body = op.requestBody?.content[0];
  const har: Har = {
    method: op.method.toUpperCase(),
    url: `${serverUrl.replace(/\/$/, '')}${path}`,
    headers: [...auth.headers, ...headers],
    queryString: [...auth.query, ...query],
  };
  if (body) {
    if (body.mediaType === 'multipart/form-data' || body.mediaType === 'application/x-www-form-urlencoded') {
      const fields = Object.entries((body.example as Record<string, unknown>) ?? {});
      har.postData = {
        mimeType: body.mediaType,
        params: fields.map(([name, v]) =>
          v === '<binary>' ? { name, fileName: `${name}.pdf` } : { name, value: stringify(v) },
        ),
      } as Har['postData'];
    } else {
      har.headers!.push({ name: 'Content-Type', value: body.mediaType });
      har.postData = {
        mimeType: body.mediaType,
        text: body.mediaType.includes('json') ? JSON.stringify(body.example ?? {}, null, 2) : stringify(body.example ?? ''),
      } as Har['postData'];
    }
  }
  return har;
}

export interface Sample {
  id: string;
  label: string;
  /** Plain source (copy button). */
  code: string;
  /** Highlighted HTML. */
  html: string;
}

/** Hand-written `x-codeSamples` first, then one generated sample per language. */
export async function codeSamples(op: OperationModel, model: ReferenceModel, serverUrl: string): Promise<Sample[]> {
  const custom = ((op.extensions['x-codeSamples'] ?? op.extensions['x-code-samples']) as
    | Array<{ lang: string; label?: string; source: string }>
    | undefined) ?? [];
  const out: Sample[] = [];
  for (const s of custom) {
    // Stable ids by label, so picking "TypeScript SDK" applies to every operation.
    const label = s.label ?? s.lang;
    out.push({
      id: `x-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      label,
      code: s.source,
      html: await highlight(s.source, highlightLanguage(s.lang)),
    });
  }
  const har = exampleRequest(op, model, serverUrl);
  const generator = snippetz();
  for (const lang of SAMPLE_LANGUAGES) {
    const code = generator.print(lang.target as never, lang.client as never, har);
    if (!code) continue;
    out.push({ id: lang.id, label: lang.label, code, html: await highlight(code, lang.highlight) });
  }
  return out;
}

/** Every operation's samples, for the lazily loaded `/reference-samples/<api>.json`. */
export async function allCodeSamples(model: ReferenceModel): Promise<Record<string, Sample[]>> {
  const serverUrl = model.servers[0]?.url ?? '';
  const out: Record<string, Sample[]> = {};
  for (const op of model.operations) out[op.slug] = await codeSamples(op, model, serverUrl);
  return out;
}
