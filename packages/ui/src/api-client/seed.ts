import type { OperationModel, ReferenceModel } from '@vitra-ai/orbitdocs-openapi';

import type { AuthDraft, Collection, Environment, KV, RequestDraft, Workspace } from './types';

/** Fingerprint of a request's editable content (FNV-1a over its JSON). */
export function requestHash(r: RequestDraft): string {
  const { seedHash: _h, id: _id, ...content } = r;
  const text = JSON.stringify(content);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const str = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** Workspace contents generated from one API: a collection, its requests and one environment per server. */
export interface ClientSeed {
  collection: Collection;
  requests: RequestDraft[];
  environments: Environment[];
}

function collectionAuth(model: ReferenceModel): { auth: AuthDraft; variables: string[] } {
  const firstReq = model.operations.map((o) => o.security.find((r) => Object.keys(r).length)).find(Boolean);
  const name = firstReq ? Object.keys(firstReq)[0] : Object.keys(model.securitySchemes)[0];
  const s = name ? (model.securitySchemes[name] as Record<string, unknown>) : undefined;
  if (!s) return { auth: { type: 'none' }, variables: [] };
  if (s.type === 'apiKey') {
    return { auth: { type: 'apiKey', in: s.in === 'query' ? 'query' : 'header', name: String(s.name ?? 'X-API-Key'), value: '{{apiKey}}' }, variables: ['apiKey'] };
  }
  if (s.type === 'http' && String(s.scheme).toLowerCase() === 'basic') {
    return { auth: { type: 'basic', username: '{{username}}', password: '{{password}}' }, variables: ['username', 'password'] };
  }
  if (s.type === 'oauth2') {
    const flows = (s.flows ?? {}) as Record<string, { tokenUrl?: string; scopes?: Record<string, string> }>;
    const cc = flows.clientCredentials;
    if (cc?.tokenUrl) {
      return {
        auth: { type: 'oauth2', tokenUrl: cc.tokenUrl, clientId: '{{clientId}}', clientSecret: '{{clientSecret}}', scope: Object.keys(cc.scopes ?? {}).join(' '), token: '' },
        variables: ['clientId', 'clientSecret'],
      };
    }
  }
  return { auth: { type: 'bearer', token: '{{token}}' }, variables: ['token'] };
}

export function requestFromOperation(op: OperationModel, apiId: string, collectionId: string): RequestDraft {
  let path = op.path;
  const params: KV[] = [];
  const headers: KV[] = [];
  for (const p of op.parameters) {
    const value = str(p.example ?? p.schema?.default ?? p.schema?.enum?.[0]);
    if (p.in === 'path') path = path.replace(`{${p.name}}`, value || `{{${p.name}}}`);
    else if (p.in === 'query') params.push({ key: p.name, value, enabled: p.required || p.example !== undefined, description: p.description });
    else if (p.in === 'header') headers.push({ key: p.name, value, enabled: p.required || p.example !== undefined, description: p.description });
  }
  const content = op.requestBody?.content[0];
  let body: RequestDraft['body'] = { mode: 'none', raw: '', form: [] };
  if (content) {
    if (content.mediaType.includes('json')) body = { mode: 'json', raw: JSON.stringify(content.example ?? {}, null, 2), form: [] };
    else if (content.mediaType === 'multipart/form-data' || content.mediaType === 'application/x-www-form-urlencoded') {
      const fields = Object.entries((content.example as Record<string, unknown>) ?? {}).map(([key, v]) => ({
        key,
        value: v === '<binary>' ? '' : str(v),
        enabled: true,
        file: v === '<binary>',
      }));
      body = { mode: content.mediaType === 'multipart/form-data' ? 'multipart' : 'form-urlencoded', raw: '', form: fields };
    } else body = { mode: 'raw', raw: str(content.example), contentType: content.mediaType, form: [] };
  }
  const draft: RequestDraft = {
    id: `${apiId}:${op.slug}`,
    collectionId,
    name: op.summary,
    method: op.method.toUpperCase(),
    url: `{{baseUrl}}${path}`,
    params,
    headers,
    body,
    auth: op.security.some((r) => Object.keys(r).length) ? { type: 'inherit' } : { type: 'none' },
    preRequestScript: '',
    postResponseScript: '',
    folder: op.group,
    operation: `${apiId}/${op.slug}`,
  };
  return { ...draft, seedHash: requestHash(draft) };
}

export interface ClientSeedOptions {
  /** Sending is off for this API (config `send: false`): the reason readers see instead. */
  sendDisabled?: string;
}

/** Builds the client seed on the server (plain JSON, passed to the client component). */
export function clientSeed(model: ReferenceModel, options: ClientSeedOptions = {}): ClientSeed {
  const collectionId = `api:${model.id}`;
  const { auth, variables } = collectionAuth(model);
  const servers = model.servers.length ? model.servers : [{ url: '', description: 'Same origin' }];
  return {
    collection: {
      id: collectionId,
      name: model.title,
      auth,
      folders: model.groups.map((g) => g.name).filter((n): n is string => Boolean(n)),
      source: { api: model.id },
      ...(options.sendDisabled ? { sendDisabled: options.sendDisabled } : {}),
      preRequestScript: '',
      postResponseScript: '',
    },
    requests: model.operations.map((op) => requestFromOperation(op, model.id, collectionId)),
    // One environment per server, shared by every API that uses it (see mergeSeed).
    environments: servers.map((s, i) => ({
      id: `server:${s.url}`,
      name: s.description ?? s.url,
      collectionIds: [collectionId],
      color: /prod|live/i.test(`${s.description} ${s.url}`) ? '#EF4444' : ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'][i % 4],
      production: /prod|live/i.test(`${s.description} ${s.url}`),
      variables: [
        { key: 'baseUrl', value: s.url, enabled: true },
        // The mock accepts any credentials, so its environment works out of the box.
        ...variables.map((key) => ({ key, value: (s as { 'x-orbitdocs-mock'?: boolean })['x-orbitdocs-mock'] ? 'mock-credentials' : '', enabled: true, secret: true })),
      ],
    })),
  };
}

/**
 * Merges a fresh seed into a saved workspace: new operations are added, removed
 * ones dropped, and requests the reader already has keep their edits.
 */
export function mergeSeed(ws: Workspace, seed: ClientSeed): Workspace {
  const keep = new Map(ws.requests.filter((r) => r.collectionId === seed.collection.id).map((r) => [r.id, r]));
  // A saved request the reader never edited follows the spec; an edited one is kept as is.
  const generated = seed.requests.map((r) => {
    const saved = keep.get(r.id);
    if (!saved) return r;
    return saved.seedHash && saved.seedHash === requestHash(saved) ? r : saved;
  });
  const custom = ws.requests.filter((r) => r.collectionId === seed.collection.id && !r.operation);
  const others = ws.requests.filter((r) => r.collectionId !== seed.collection.id);
  const existingCollection = ws.collections.find((c) => c.id === seed.collection.id);
  const collections = [
    ...ws.collections.filter((c) => c.id !== seed.collection.id),
    // Sending follows the config, whatever a saved workspace says.
    existingCollection ? { ...existingCollection, name: seed.collection.name, folders: seed.collection.folders, sendDisabled: seed.collection.sendDisabled } : seed.collection,
  ];
  const { environments, activeEnvironmentId } = mergeEnvironments(ws, seed);
  return {
    ...ws,
    collections,
    requests: [...others, ...generated, ...custom],
    environments,
    activeEnvironmentId: activeEnvironmentId && environments.some((e) => e.id === activeEnvironmentId) ? activeEnvironmentId : environments[0]?.id,
  };
}

const baseUrlOf = (e: Environment) => e.variables.find((v) => v.key === 'baseUrl')?.value;

/**
 * Seeded environments are one per server, shared by the APIs that use it: a
 * second API on the same server adds itself to `collectionIds` and its
 * variables. The reader's values win; fields added to the seed later (colour,
 * production flag, new variables) are filled in. Workspaces saved by earlier
 * versions had one copy per API (`<collection>:env:<n>`); those fold into the
 * shared environment for their server, keeping the reader's values.
 */
function mergeEnvironments(ws: Workspace, seed: ClientSeed): { environments: Environment[]; activeEnvironmentId?: string } {
  const legacyPrefix = `${seed.collection.id}:env:`;
  const legacy = ws.environments.filter((e) => e.id.startsWith(legacyPrefix));
  const environments = ws.environments.filter((e) => !e.id.startsWith(legacyPrefix));
  let activeEnvironmentId = ws.activeEnvironmentId;
  for (const s of seed.environments) {
    const copies = legacy.filter((l) => baseUrlOf(l) === baseUrlOf(s));
    const index = environments.findIndex((e) => e.id === s.id);
    const base = index >= 0 ? environments[index]! : copies[0];
    let next: Environment;
    if (!base) next = s;
    else {
      const keys = new Set(base.variables.map((v) => v.key));
      // A value the reader typed into an old per-API copy fills an empty one here.
      const variables = [...base.variables, ...s.variables.filter((v) => !keys.has(v.key))].map((v) => {
        if (v.value) return v;
        const typed = copies.flatMap((c) => c.variables).find((c) => c.key === v.key && c.value);
        return typed ? { ...v, value: typed.value } : v;
      });
      const { collectionId: _, ...rest } = base;
      next = {
        ...s,
        ...rest,
        id: s.id,
        collectionIds: [...new Set([...(base.collectionIds ?? []), ...(s.collectionIds ?? [])])],
        color: base.color ?? s.color,
        production: base.production ?? s.production,
        variables,
      };
    }
    if (index >= 0) environments[index] = next;
    else environments.push(next);
    if (copies.some((c) => c.id === activeEnvironmentId)) activeEnvironmentId = s.id;
  }
  return { environments, activeEnvironmentId };
}
