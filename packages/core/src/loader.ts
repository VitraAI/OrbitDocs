import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createJiti } from 'jiti';

import { type OrbitDocsConfig, resolveConfig } from './config';

export const CONFIG_FILES = [
  'orbitdocs.config.ts',
  'orbitdocs.config.mts',
  'orbitdocs.config.js',
  'orbitdocs.config.mjs',
] as const;

/** First config file found in `dir`, or undefined. */
export function findConfigFile(dir: string): string | undefined {
  return CONFIG_FILES.map((f) => join(dir, f)).find((f) => existsSync(f));
}

export interface LoadedConfig {
  config: OrbitDocsConfig;
  /** Absolute path of the config file. */
  file: string;
  /** Docs app directory (the folder holding the config). */
  dir: string;
}

/** Loads and validates the config in `dir` (TypeScript allowed). */
export async function loadConfig(dir = process.cwd()): Promise<LoadedConfig> {
  const root = resolve(dir);
  const file = findConfigFile(root);
  if (!file) {
    throw new Error(
      `No orbitdocs config in ${root}. Expected one of: ${CONFIG_FILES.join(', ')}. Run \`orbitdocs init\` to create one.`,
    );
  }
  const jiti = createJiti(import.meta.url, { moduleCache: false, interopDefault: true });
  const mod = await jiti.import<{ default?: unknown }>(file);
  return { config: resolveConfig(mod.default ?? mod), file, dir: root };
}
