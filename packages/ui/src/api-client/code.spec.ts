import { afterEach, describe, expect, it, vi } from 'vitest';

import { codeRequest, secretVariableNames, toCurl } from './code';
import type { SendContext } from './send';
import type { AuthDraft, Collection, Environment, RequestDraft } from './types';
import { scope } from './variables';

const environment: Environment = {
  id: 'e',
  name: 'Prod',
  variables: [
    { key: 'baseUrl', value: 'https://api.acme.com', enabled: true },
    { key: 'apiKey', value: 'sk_live_REAL', enabled: true, secret: true },
    { key: 'tenant', value: 't-42', enabled: true, secret: true },
    { key: 'accessToken', value: 'tok_REAL', enabled: true },
    { key: 'accountId', value: 'acc_1', enabled: true },
  ],
};

const collection = (auth: AuthDraft): Collection => ({ id: 'c', name: 'Acme', auth, folders: [], preRequestScript: '', postResponseScript: '' });

const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({
  id: 'r',
  collectionId: 'c',
  name: 'Get account',
  method: 'POST',
  url: '{{baseUrl}}/accounts/{{accountId}}',
  params: [],
  headers: [],
  body: { mode: 'none', raw: '', form: [] },
  auth: { type: 'inherit' },
  preRequestScript: '',
  postResponseScript: '',
  ...over,
});

const ctx = (auth: AuthDraft): SendContext => ({ collection: collection(auth), environment, globals: [] });
const vars = scope([], environment);
const header = (req: { headers: Array<{ key: string; value: string }> }, name: string) => req.headers.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;
const REAL = /sk_live_REAL|tok_REAL|t-42|hunter2|literal-key|c1:s3cret/;

afterEach(() => vi.unstubAllGlobals());

describe('generated code hides secrets by default', () => {
  it('keeps secret variable references in auth, URL, headers and body', async () => {
    const req = await codeRequest(
      draft({
        params: [{ key: 'tenant', value: '{{tenant}}', enabled: true }],
        headers: [{ key: 'X-Tenant', value: '{{tenant}}', enabled: true }],
        body: { mode: 'json', raw: '{"key":"{{apiKey}}","account":"{{accountId}}"}', form: [] },
      }),
      ctx({ type: 'apiKey', in: 'header', name: 'X-API-Key', value: '{{apiKey}}' }),
      vars,
    );
    expect(header(req, 'X-API-Key')).toBe('{{apiKey}}');
    expect(header(req, 'X-Tenant')).toBe('{{tenant}}');
    expect(req.url).toBe('https://api.acme.com/accounts/acc_1?tenant={{tenant}}');
    expect(req.body).toBe('{"key":"{{apiKey}}","account":"acc_1"}');
    expect(JSON.stringify(req)).not.toMatch(REAL);
  });

  it('treats credential-like names as secret even when not marked', async () => {
    expect(secretVariableNames([], environment.variables)).toEqual(new Set(['apiKey', 'tenant', 'accessToken']));
    const req = await codeRequest(draft(), ctx({ type: 'bearer', token: '{{accessToken}}' }), vars);
    expect(header(req, 'Authorization')).toBe('Bearer {{accessToken}}');
  });

  it('replaces literal auth values with placeholders', async () => {
    const key = await codeRequest(draft(), ctx({ type: 'apiKey', in: 'query', name: 'api_key', value: 'literal-key' }), vars);
    expect(key.url).toContain('api_key=YOUR_API_KEY');
    const bearer = await codeRequest(draft({ auth: { type: 'bearer', token: 'tok_REAL' } }), ctx({ type: 'none' }), vars);
    expect(header(bearer, 'Authorization')).toBe('Bearer YOUR_TOKEN');
    const basic = await codeRequest(draft({ auth: { type: 'basic', username: 'ada', password: 'hunter2' } }), ctx({ type: 'none' }), vars);
    expect(header(basic, 'Authorization')).toBe('Basic YOUR_BASE64_CREDENTIALS');
    for (const r of [key, bearer, basic]) expect(JSON.stringify(r)).not.toMatch(REAL);
  });

  it('never requests an OAuth token to show code', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const req = await codeRequest(draft(), ctx({ type: 'oauth2', tokenUrl: 'https://auth.acme.com/token', clientId: 'c1', clientSecret: 's3cret', scope: '', token: '' }), vars);
    expect(header(req, 'Authorization')).toBe('Bearer YOUR_ACCESS_TOKEN');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('masks credentials typed into headers and query parameters', async () => {
    const req = await codeRequest(
      draft({
        params: [
          { key: 'access_token', value: 'tok_REAL', enabled: true },
          { key: 'page_token', value: 'p2', enabled: true },
        ],
        headers: [
          { key: 'Authorization', value: 'Bearer tok_REAL', enabled: true },
          { key: 'Cookie', value: 'sid=tok_REAL', enabled: true },
          { key: 'Idempotency-Key', value: 'idem-1', enabled: true },
        ],
      }),
      ctx({ type: 'none' }),
      vars,
    );
    expect(header(req, 'Authorization')).toBe('Bearer YOUR_TOKEN');
    expect(header(req, 'Cookie')).toBe('YOUR_COOKIE');
    expect(header(req, 'Idempotency-Key')).toBe('idem-1');
    expect(req.url).toContain('access_token=YOUR_ACCESS_TOKEN');
    expect(req.url).toContain('page_token=p2');
    expect(JSON.stringify(req)).not.toMatch(REAL);
  });

  it('includes the real values only when asked', async () => {
    const req = await codeRequest(draft(), ctx({ type: 'apiKey', in: 'header', name: 'X-API-Key', value: '{{apiKey}}' }), vars, { includeSecrets: true });
    expect(header(req, 'X-API-Key')).toBe('sk_live_REAL');
  });
});

describe('toCurl', () => {
  it('quotes every part for the shell', () => {
    expect(toCurl({ method: 'POST', url: "https://x.io/a?q=it's", headers: [{ key: 'X-A', value: "b'c" }], body: '{"a":"\'"}' })).toBe(
      ["curl -X POST 'https://x.io/a?q=it'\\''s'", "  -H 'X-A: b'\\''c'", `  --data '{"a":"'\\''"}'`].join(' \\\n'),
    );
  });
});
