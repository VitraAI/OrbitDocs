import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { specFile } from '@vitra-ai/orbitdocs-core';
import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';
import pc from 'picocolors';

import { fail, log } from '../util';

const SEVERITY = ['error', 'warn', 'info', 'hint'] as const;

export interface LintProblem {
  api: string;
  severity: (typeof SEVERITY)[number];
  code: string;
  message: string;
  path: string;
}

/** Spectral over every extracted spec: the OpenAPI rules, or the configured ruleset. */
export async function lint(loaded: LoadedConfig, options: { api?: string } = {}): Promise<LintProblem[]> {
  const { config, dir } = loaded;
  // CommonJS packages: named exports may sit on `default` under ESM.
  const cjs = <T>(m: T): T => ({ ...(m as { default?: T }).default, ...m }) as T;
  const { Spectral, Document } = cjs(await import('@stoplight/spectral-core'));
  const Parsers = cjs(await import('@stoplight/spectral-parsers'));
  const spectral = new Spectral();
  if (config.lint.ruleset) {
    const file = resolve(dir, config.lint.ruleset);
    if (!existsSync(file)) fail(`lint.ruleset: ${file} not found`);
    const { bundleAndLoadRuleset } = cjs(await import('@stoplight/spectral-ruleset-bundler/with-loader'));
    const fs = await import('node:fs');
    spectral.setRuleset(await bundleAndLoadRuleset(file, { fs, fetch }));
  } else {
    const { oas } = cjs(await import('@stoplight/spectral-rulesets'));
    spectral.setRuleset({ extends: [[oas as never, 'recommended']] });
  }

  const problems: LintProblem[] = [];
  for (const api of config.apis) {
    if (options.api && api.id !== options.api) continue;
    const file = specFile(dir, api.id);
    if (!existsSync(file)) {
      log.warn(`${api.id}: no spec yet (run \`orbitdocs extract\`)`);
      continue;
    }
    const doc = new Document(readFileSync(file, 'utf8'), Parsers.Json, file);
    for (const r of await spectral.run(doc)) {
      problems.push({ api: api.id, severity: SEVERITY[r.severity] ?? 'hint', code: String(r.code), message: r.message, path: r.path.join('.') });
    }
  }
  return problems;
}

export function printLint(problems: LintProblem[], failOn: LintProblem['severity']): boolean {
  const colour = { error: pc.red, warn: pc.yellow, info: pc.cyan, hint: pc.dim };
  for (const p of problems) {
    console.log(`  ${colour[p.severity](p.severity.padEnd(5))} ${p.api} ${pc.dim(p.path || '(root)')}  ${p.message} ${pc.dim(p.code)}`);
  }
  const limit = SEVERITY.indexOf(failOn);
  const failing = problems.filter((p) => SEVERITY.indexOf(p.severity) <= limit);
  const counts = SEVERITY.map((s) => `${problems.filter((p) => p.severity === s).length} ${s}`).join(', ');
  if (failing.length) log.error(`Lint: ${counts}`);
  else log.ok(`Lint: ${counts}`);
  return failing.length === 0;
}

