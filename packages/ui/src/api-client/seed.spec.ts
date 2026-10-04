import { describe, expect, it } from 'vitest';

import { type ClientSeed, clientSeed, mergeSeed, requestHash } from './seed';
import type { Workspace } from './types';

const seed: ClientSeed = {
  collection: { id: 'api:t', name: 'T', auth: { type: 'none' }, folders: ['A'], source: { api: 't' }, preRequestScript: '', postResponseScript: '' },
  requests: [
    { id: 't:one', collectionId: 'api:t', name: 'One', method: 'GET', url: '{{baseUrl}}/one', params: [], headers: [], body: { mode: 'none', raw: '', form: [] }, auth: { type: 'inherit' }, preRequestScript: '', postResponseScript: '', operation: 't/one' },
  ],
  environments: [{ id: 'api:t:env:0', name: 'Production', collectionId: 'api:t', color: '#EF4444', production: true, variables: [{ key: 'baseUrl', value: 'https://x', enabled: true }, { key: 'apiKey', value: '', enabled: true, secret: true }] }],
};
const empty: Workspace = { version: 1, collections: [], requests: [], globals: [], environments: [], history: [] };

describe('mergeSeed', () => {
  it('adds everything to an empty workspace', () => {
    const ws = mergeSeed(empty, seed);
    expect(ws.requests).toHaveLength(1);
    expect(ws.activeEnvironmentId).toBe('api:t:env:0');
  });

  it('keeps edits and custom requests, drops removed operations', () => {
    const edited = mergeSeed(empty, seed);
    edited.requests[0]!.url = '{{baseUrl}}/one?edited=1';
    edited.requests.push({ ...edited.requests[0]!, id: 'req:mine', operation: undefined, name: 'Mine' });
    edited.requests.push({ ...edited.requests[0]!, id: 't:gone', operation: 't/gone' });
    const ws = mergeSeed(edited, seed);
    expect(ws.requests.map((r) => r.id)).toEqual(['t:one', 'req:mine']);
    expect(ws.requests[0]!.url).toContain('edited=1');
  });

  it('updates untouched requests when the spec changes', () => {
    const first = mergeSeed(empty, { ...seed, requests: seed.requests.map((r) => ({ ...r, seedHash: requestHash(r) })) });
    const changed = { ...seed.requests[0]!, url: '{{baseUrl}}/one/v2' };
    const ws = mergeSeed(first, { ...seed, requests: [{ ...changed, seedHash: requestHash(changed) }] });
    expect(ws.requests[0]!.url).toBe('{{baseUrl}}/one/v2');
  });

  it('fills fields added to the seed later without overwriting the reader', () => {
    const old: Workspace = {
      ...empty,
      environments: [{ id: 'api:t:env:0', name: 'Prod (mine)', collectionId: 'api:t', variables: [{ key: 'baseUrl', value: 'https://mine', enabled: true }] }],
    };
    const env = mergeSeed(old, seed).environments[0]!;
    expect(env.name).toBe('Prod (mine)');
    expect(env.production).toBe(true);
    expect(env.color).toBe('#EF4444');
    expect(env.variables.map((v) => `${v.key}=${v.value}`)).toEqual(['baseUrl=https://mine', 'apiKey=']);
  });

  it('takes the API\'s send setting from the seed, over what the saved workspace says', () => {
    const off = { ...seed, collection: { ...seed.collection, sendDisabled: 'Demo API.' } };
    const saved = mergeSeed(empty, off);
    expect(saved.collections[0]!.sendDisabled).toBe('Demo API.');
    expect(mergeSeed(saved, seed).collections[0]!.sendDisabled).toBeUndefined();
    expect(mergeSeed(mergeSeed(empty, seed), off).collections[0]!.sendDisabled).toBe('Demo API.');
  });
});

describe('clientSeed', () => {
  const model = { id: 'demo', title: 'Demo', servers: [{ url: 'https://api.demo.example' }], securitySchemes: {}, groups: [], operations: [] } as unknown as Parameters<typeof clientSeed>[0];

  it('marks the collection when sending is off', () => {
    expect(clientSeed(model).collection.sendDisabled).toBeUndefined();
    expect(clientSeed(model, { sendDisabled: 'Demo API.' }).collection.sendDisabled).toBe('Demo API.');
  });
});
