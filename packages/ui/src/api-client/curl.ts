import type { KV, RequestDraft } from './types';

/** Splits a shell command line, honouring quotes and line continuations. */
function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let has = false;
  const s = input.replace(/\\\r?\n/g, ' ');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
    } else cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Parses a cURL command into a request draft (method, URL, headers, body, basic auth). */
export function parseCurl(command: string, collectionId: string): RequestDraft {
  const t = tokenize(command.trim());
  if (t[0] !== 'curl') throw new Error('Not a curl command');
  let method: string | undefined;
  let url = '';
  const headers: KV[] = [];
  const data: string[] = [];
  const form: KV[] = [];
  let auth: RequestDraft['auth'] = { type: 'none' };
  for (let i = 1; i < t.length; i++) {
    const a = t[i]!;
    const next = () => t[++i] ?? '';
    if (a === '-X' || a === '--request') method = next().toUpperCase();
    else if (a === '-H' || a === '--header') {
      const h = next();
      const idx = h.indexOf(':');
      if (idx > 0) headers.push({ key: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim(), enabled: true });
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(a)) data.push(next());
    else if (a === '-F' || a === '--form') {
      const f = next();
      const idx = f.indexOf('=');
      const value = f.slice(idx + 1);
      form.push({ key: f.slice(0, idx), value: value.startsWith('@') ? '' : value, enabled: true, file: value.startsWith('@') });
    } else if (a === '-u' || a === '--user') {
      const [username = '', password = ''] = next().split(':');
      auth = { type: 'basic', username, password };
    } else if (a === '--url') url = next();
    else if (!a.startsWith('-') && !url) url = a;
  }
  const u = new URL(url, 'http://localhost');
  const params: KV[] = [...u.searchParams.entries()].map(([key, value]) => ({ key, value, enabled: true }));
  const base = /^https?:\/\//.test(url) ? `${u.origin}${u.pathname}` : u.pathname;
  const ct = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
  const raw = data.join('&');
  const body: RequestDraft['body'] = form.length
    ? { mode: 'multipart', raw: '', form }
    : raw
      ? ct.includes('json') || /^\s*[{[]/.test(raw)
        ? { mode: 'json', raw: (() => { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; } })(), form: [] }
        : { mode: 'raw', raw, contentType: ct || 'application/x-www-form-urlencoded', form: [] }
      : { mode: 'none', raw: '', form: [] };
  return {
    id: `req:${crypto.randomUUID()}`,
    collectionId,
    name: `${(method ?? (raw || form.length ? 'POST' : 'GET'))} ${u.pathname}`,
    method: method ?? (raw || form.length ? 'POST' : 'GET'),
    url: base,
    params,
    headers: headers.filter((h) => !(body.mode === 'json' && h.key.toLowerCase() === 'content-type')),
    body,
    auth,
    preRequestScript: '',
    postResponseScript: '',
  };
}
