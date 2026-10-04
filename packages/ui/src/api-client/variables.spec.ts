import { describe, expect, it } from 'vitest';

import { parseCurl } from './curl';
import { interpolate, missingVariables, scope } from './variables';

describe('variables', () => {
  it('resolves environment over globals, and run variables over both', () => {
    const vars = scope([{ key: 'a', value: 'g', enabled: true }], { id: 'e', name: 'E', variables: [{ key: 'a', value: 'e', enabled: true }] }, { b: 'r' });
    expect(interpolate('{{a}}-{{b}}-{{c}}', vars)).toBe('e-r-{{c}}');
    expect(missingVariables('{{a}} {{c}} {{$guid}}', vars)).toEqual(['c']);
  });
  it('expands dynamic variables', () => {
    expect(interpolate('{{$guid}}', {})).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('parseCurl', () => {
  it('parses method, headers, query, JSON body and basic auth', () => {
    const r = parseCurl(`curl -X POST 'https://api.x.com/v1/things?limit=2' -H 'Content-Type: application/json' -H "X-Key: abc" -u ada:pw --data '{"a":1}'`, 'c');
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.x.com/v1/things');
    expect(r.params).toEqual([{ key: 'limit', value: '2', enabled: true }]);
    expect(r.headers).toEqual([{ key: 'X-Key', value: 'abc', enabled: true }]);
    expect(r.body).toMatchObject({ mode: 'json', raw: '{\n  "a": 1\n}' });
    expect(r.auth).toEqual({ type: 'basic', username: 'ada', password: 'pw' });
  });
  it('handles multipart and line continuations', () => {
    const r = parseCurl("curl https://x.com/up \\\n  -F 'file=@a.pdf' -F 'note=hi'", 'c');
    expect(r.method).toBe('POST');
    expect(r.body.mode).toBe('multipart');
    expect(r.body.form).toEqual([{ key: 'file', value: '', enabled: true, file: true }, { key: 'note', value: 'hi', enabled: true, file: false }]);
  });
  it('rejects non-curl input', () => {
    expect(() => parseCurl('wget x', 'c')).toThrow();
  });
});
