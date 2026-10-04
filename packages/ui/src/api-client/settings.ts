'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ClientFeatures {
  scripts: boolean;
  runner: boolean;
  history: boolean;
  import: boolean;
  environments: boolean;
}

/** What a reader can tune in the client's settings (kept in their browser). */
export interface ClientSettings {
  layout: 'stacked' | 'side-by-side';
  density: 'compact' | 'comfortable';
  /** Editor and response font size, px. */
  fontSize: number;
  /** Accent colour (hex); empty = site accent. */
  accent: string;
  showSidebar: boolean;
  wrapLines: boolean;
  /** Ask before sending to an environment marked as production. */
  confirmProduction: boolean;
  /** Language of the Code tab. */
  snippetLanguage: string;
  /** Size of the request pane, percent of the split. */
  split: number;
}

export interface ClientDefaults {
  layout?: ClientSettings['layout'];
  density?: ClientSettings['density'];
  accent?: string;
  features?: Partial<ClientFeatures>;
}

export const ALL_FEATURES: ClientFeatures = { scripts: true, runner: true, history: true, import: true, environments: true };

export function defaultSettings(defaults: ClientDefaults = {}): ClientSettings {
  return {
    layout: defaults.layout ?? 'side-by-side',
    density: defaults.density ?? 'comfortable',
    fontSize: 13,
    accent: defaults.accent ?? '',
    showSidebar: true,
    wrapLines: true,
    confirmProduction: true,
    snippetLanguage: 'curl',
    split: 50,
  };
}

const KEY = 'orbitdocs:client:settings';

export function useClientSettings(defaults: ClientDefaults = {}) {
  const [settings, setSettings] = useState<ClientSettings>(() => defaultSettings(defaults));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ClientSettings>;
      setSettings((s) => ({ ...s, ...saved }));
    } catch {
      /* ignore */
    }
  }, []);
  const update = useCallback((patch: Partial<ClientSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setSettings(defaultSettings(defaults));
  }, [defaults]);
  return { settings, update, reset };
}
