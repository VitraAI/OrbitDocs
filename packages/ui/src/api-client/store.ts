'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type ClientSeed, mergeSeed } from './seed';
import type { Environment, RequestDraft, RunResult, Variable, Workspace } from './types';

const EMPTY: Workspace = { version: 1, collections: [], requests: [], globals: [], environments: [], history: [] };
const HISTORY_LIMIT = 50;

/** Secret values live under their own key and are never part of an export. */
type Secrets = Record<string, string>;
const secretKey = (envId: string, key: string) => `${envId}::${key}`;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

function withoutSecrets(ws: Workspace): Workspace {
  const strip = (v: Variable) => (v.secret ? { ...v, value: '' } : v);
  return { ...ws, globals: ws.globals.map(strip), environments: ws.environments.map((e) => ({ ...e, variables: e.variables.map(strip) })) };
}

function withSecrets(ws: Workspace, secrets: Secrets): Workspace {
  return {
    ...ws,
    globals: ws.globals.map((v) => (v.secret ? { ...v, value: secrets[secretKey('globals', v.key)] ?? v.value } : v)),
    environments: ws.environments.map((e) => ({
      ...e,
      variables: e.variables.map((v) => (v.secret ? { ...v, value: secrets[secretKey(e.id, v.key)] ?? v.value } : v)),
    })),
  };
}

function collectSecrets(ws: Workspace): Secrets {
  const out: Secrets = {};
  for (const v of ws.globals) if (v.secret && v.value) out[secretKey('globals', v.key)] = v.value;
  for (const e of ws.environments) for (const v of e.variables) if (v.secret && v.value) out[secretKey(e.id, v.key)] = v.value;
  return out;
}

/**
 * The client's whole state, offline-first in localStorage. Seeds (one per API)
 * are merged in on every load so the collection follows the spec.
 */
export function useWorkspace(storageKey: string, seeds: ClientSeed[]) {
  const [ws, setWs] = useState<Workspace>(() => seeds.reduce(mergeSeed, EMPTY));
  const loaded = useRef(false);

  useEffect(() => {
    const saved = load<Workspace>(`${storageKey}:workspace`, EMPTY);
    const secrets = load<Secrets>(`${storageKey}:secrets`, {});
    setWs(withSecrets(seeds.reduce(mergeSeed, saved.version === 1 ? saved : EMPTY), secrets));
    loaded.current = true;
  }, [storageKey, seeds]);

  useEffect(() => {
    if (!loaded.current) return;
    save(`${storageKey}:workspace`, withoutSecrets(ws));
    save(`${storageKey}:secrets`, collectSecrets(ws));
  }, [ws, storageKey]);

  const update = useCallback((fn: (w: Workspace) => Workspace) => setWs(fn), []);

  const actions = useMemo(
    () => ({
      updateRequest: (id: string, patch: Partial<RequestDraft>) =>
        update((w) => ({ ...w, requests: w.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      addRequest: (draft: RequestDraft) => update((w) => ({ ...w, requests: [...w.requests, draft] })),
      removeRequest: (id: string) => update((w) => ({ ...w, requests: w.requests.filter((r) => r.id !== id) })),
      setActiveEnvironment: (id: string | undefined) => update((w) => ({ ...w, activeEnvironmentId: id })),
      upsertEnvironment: (env: Environment) =>
        update((w) => ({
          ...w,
          environments: w.environments.some((e) => e.id === env.id) ? w.environments.map((e) => (e.id === env.id ? env : e)) : [...w.environments, env],
        })),
      removeEnvironment: (id: string) =>
        update((w) => ({
          ...w,
          environments: w.environments.filter((e) => e.id !== id),
          activeEnvironmentId: w.activeEnvironmentId === id ? w.environments.find((e) => e.id !== id)?.id : w.activeEnvironmentId,
        })),
      setGlobals: (globals: Variable[]) => update((w) => ({ ...w, globals })),
      /** Writes from scripts: string = set, null = unset. */
      applyWrites: (envId: string | undefined, env: Record<string, string | null>, globals: Record<string, string | null>) =>
        update((w) => {
          const patch = (vars: Variable[], writes: Record<string, string | null>) => {
            let out = [...vars];
            for (const [key, value] of Object.entries(writes)) {
              if (value === null) out = out.filter((v) => v.key !== key);
              else if (out.some((v) => v.key === key)) out = out.map((v) => (v.key === key ? { ...v, value } : v));
              else out.push({ key, value, enabled: true });
            }
            return out;
          };
          return {
            ...w,
            globals: patch(w.globals, globals),
            environments: w.environments.map((e) => (e.id === envId ? { ...e, variables: patch(e.variables, env) } : e)),
          };
        }),
      addHistory: (entry: RunResult & { method: string; url: string; name: string }) =>
        update((w) => ({ ...w, history: [entry, ...w.history].slice(0, HISTORY_LIMIT) })),
      clearHistory: () => update((w) => ({ ...w, history: [] })),
      removeHistory: (index: number) => update((w) => ({ ...w, history: w.history.filter((_, i) => i !== index) })),
      /** Fill empty secret variables (e.g. the key the reader entered on the docs page). */
      fillSecrets: (values: Record<string, string>) =>
        update((w) => ({
          ...w,
          environments: w.environments.map((e) => ({
            ...e,
            variables: e.variables.map((v) => (!v.value && values[v.key] ? { ...v, value: values[v.key]! } : v)),
          })),
        })),
      replace: (next: Workspace) => update(() => next),
    }),
    [update],
  );

  return { ws, ...actions, exportJson: () => JSON.stringify(withoutSecrets(ws), null, 2) };
}

export type WorkspaceApi = ReturnType<typeof useWorkspace>;
