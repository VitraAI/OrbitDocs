'use client';

import type { ClientSeed } from '../../api-client/seed';
import type { ClientDefaults } from '../../api-client/settings';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { SampleView } from './request-card';

export interface SecuritySchemeView {
  name: string;
  type: string;
  /** apiKey: header/query/cookie name. */
  paramName?: string;
  in?: string;
  scheme?: string;
  description?: string;
}

export interface ServerView {
  url: string;
  description?: string;
}

interface State {
  language: string;
  server: string;
  /** Credential per security scheme name. */
  credentials: Record<string, string>;
}

interface ReferenceContext extends State {
  apiId: string;
  /** Collection for the API client (Test Request). */
  seed?: ClientSeed;
  clientDefaults?: ClientDefaults;
  servers: ServerView[];
  schemes: SecuritySchemeView[];
  languages: Array<{ id: string; label: string }>;
  setLanguage: (id: string) => void;
  setServer: (url: string) => void;
  setCredential: (scheme: string, value: string) => void;
  /** Every operation's samples, once loaded from `samplesUrl`. */
  moreSamples: Record<string, SampleView[]> | null;
  /** Fetches the samples the page doesn't carry (once). */
  loadSamples: () => void;
}

const Ctx = createContext<ReferenceContext | null>(null);

const storageKey = (apiId: string) => `orbitdocs:${apiId}`;

function read(apiId: string): Partial<State> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(apiId)) ?? '{}') as Partial<State>;
  } catch {
    return {};
  }
}

export function ReferenceProvider({
  apiId,
  servers,
  schemes,
  languages,
  seed,
  clientDefaults,
  meUrl,
  samplesUrl,
  children,
}: {
  /** Where the samples for languages the page doesn't carry live (`/reference-samples/<api>.json`). */
  samplesUrl?: string;
  /** Fetch the signed-in reader's credentials from here (private docs). */
  meUrl?: string;
  apiId: string;
  seed?: ClientSeed;
  clientDefaults?: ClientDefaults;
  servers: ServerView[];
  schemes: SecuritySchemeView[];
  languages: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>({
    language: languages[0]?.id ?? 'curl',
    server: servers[0]?.url ?? '',
    credentials: {},
  });

  // Restore the reader's choices after hydration (static HTML renders the defaults).
  useEffect(() => {
    const saved = read(apiId);
    setState((s) => ({
      language: saved.language && languages.some((l) => l.id === saved.language) ? saved.language : s.language,
      server: saved.server && servers.some((sv) => sv.url === saved.server) ? saved.server : s.server,
      credentials: saved.credentials ?? {},
    }));
  }, [apiId, languages, servers]);

  // Personalization: credentials the docs owner issued to this reader, unless they typed their own.
  useEffect(() => {
    if (!meUrl) return;
    fetch(meUrl, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { credentials?: Record<string, string> } | null) => {
        if (!d?.credentials) return;
        setState((s) => ({ ...s, credentials: { ...d.credentials, ...Object.fromEntries(Object.entries(s.credentials).filter(([, v]) => v)) } }));
      })
      .catch(() => undefined);
  }, [meUrl]);

  const persist = useCallback(
    (next: State) => {
      try {
        // Credentials are kept in this browser only, never sent anywhere but the API itself.
        localStorage.setItem(storageKey(apiId), JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
    },
    [apiId],
  );

  const update = useCallback(
    (patch: (s: State) => State) =>
      setState((s) => {
        const next = patch(s);
        persist(next);
        return next;
      }),
    [persist],
  );

  const [moreSamples, setMoreSamples] = useState<Record<string, SampleView[]> | null>(null);
  const [requested, setRequested] = useState(false);
  const loadSamples = useCallback(() => {
    if (requested || !samplesUrl) return;
    setRequested(true);
    fetch(samplesUrl)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, SampleView[]>>) : null))
      .then((all) => all && setMoreSamples(all))
      .catch(() => undefined);
  }, [requested, samplesUrl]);

  const value = useMemo<ReferenceContext>(
    () => ({
      ...state,
      apiId,
      seed,
      clientDefaults,
      servers,
      schemes,
      languages,
      setLanguage: (language) => update((s) => ({ ...s, language })),
      setServer: (server) => update((s) => ({ ...s, server })),
      setCredential: (scheme, v) => update((s) => ({ ...s, credentials: { ...s.credentials, [scheme]: v } })),
      moreSamples,
      loadSamples,
    }),
    [state, apiId, seed, clientDefaults, servers, schemes, languages, update, moreSamples, loadSamples],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReference(): ReferenceContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReference must be used inside <ReferenceProvider>');
  return ctx;
}
