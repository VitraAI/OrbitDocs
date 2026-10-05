import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { type ApiConfig, type NestSourceConfig, specFile } from '@vitra-ai/orbitdocs-core';
import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';
import { type FilterOptions, findDocumentationGaps, loadDocument, stableStringify } from '@vitra-ai/orbitdocs-openapi';

import { fail, log, resolveFrom, runShell } from '../util';
import { writeAccessManifest, writeAccessVariants } from './access';
import { writeAiManifest } from './ai';

export interface ExtractOptions {
  /** Skip the configured `build` step (dev mode re-extracts after the app's own watcher compiled). */
  skipBuild?: boolean;
  /** Only this API. */
  only?: string;
}

export interface ExtractSummary {
  id: string;
  operations: number;
  gaps: string[];
  ok: boolean;
}

function filterOptions(api: ApiConfig): FilterOptions {
  return {
    mode: 'nest' in api.source && api.source.nest.routes === 'all' ? 'opt-out' : 'opt-in',
    ...(api.servers ? { servers: api.servers } : {}),
    ...(api.securitySchemes ? { securitySchemes: api.securitySchemes as FilterOptions['securitySchemes'] } : {}),
    ...(api.security ? { security: api.security } : {}),
    standardErrors: api.standardErrors,
    api: api.id,
    ...(api.omitParameters.length ? { omitParameters: api.omitParameters } : {}),
    ...(api.groups?.length ? { groupOrder: api.groups } : {}),
  };
}

function runExtractor<T = Array<{ operations: number; gaps: string[] }>>(cli: string, requestFile: string, cwd: string): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, requestFile], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('exit', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('ORBITDOCS_RESULT '));
      if (code === 0 && line) return resolvePromise(JSON.parse(line.slice('ORBITDOCS_RESULT '.length)));
      reject(new Error(`Extraction failed:\n${err || out}`));
    });
  });
}

/** Writes `openapi/<id>.json` for every API in the config, plus a public copy for download. */
export async function extract(loaded: LoadedConfig, options: ExtractOptions = {}): Promise<ExtractSummary[]> {
  const { config, dir } = loaded;
  const accessProblems = writeAccessManifest(loaded);
  if (accessProblems.length) fail(accessProblems.join('\n'));
  const summaries: ExtractSummary[] = [];

  // APIs extracted from the same Nest app share one build and one boot: the app is compiled
  // once per project and booted once per source, and each API is filtered from that document.
  const groups = new Map<string, Array<ApiConfig & { source: { nest: NestSourceConfig } }>>();
  for (const api of config.apis) {
    if (options.only && api.id !== options.only) continue;
    if (!('nest' in api.source)) continue;
    const n = api.source.nest;
    const key = JSON.stringify([resolve(dir, n.root), n.module, n.export, n.globalPrefix, n.versioning, n.configure, n.env, n.build]);
    const list = groups.get(key) ?? [];
    list.push(api as ApiConfig & { source: { nest: NestSourceConfig } });
    groups.set(key, list);
  }
  const built = new Set<string>();
  const nestResults = new Map<string, { operations: number; gaps: string[] }>();
  for (const apis of groups.values()) {
    const nest = apis[0]!.source.nest;
    const root = resolve(dir, nest.root);
    const ids = apis.map((a) => a.id).join(', ');
    if (nest.build && !options.skipBuild && !built.has(`${root}\0${nest.build}`)) {
      built.add(`${root}\0${nest.build}`);
      log.step(`${ids}: ${nest.build}`);
      const code = await runShell(nest.build, root);
      if (code !== 0) throw new Error(`${ids}: \`${nest.build}\` failed (exit ${code})`);
    }
    let cli: string;
    try {
      cli = resolveFrom(root, '@vitra-ai/orbitdocs-nestjs/extract-cli');
    } catch {
      throw new Error(`${ids}: @vitra-ai/orbitdocs-nestjs is not installed in ${root}. Run \`npm install @vitra-ai/orbitdocs-nestjs\` there.`);
    }
    mkdirSync(join(dir, 'openapi'), { recursive: true });
    const request = {
      root,
      module: nest.module,
      export: nest.export,
      globalPrefix: nest.globalPrefix,
      versioning: nest.versioning,
      configure: nest.configure,
      env: nest.env,
      targets: apis.map((api) => ({
        info: { title: api.title, version: api.version, description: api.description },
        filter: filterOptions(api),
        out: specFile(dir, api.id),
      })),
    };
    const requestFile = join(tmpdir(), `orbitdocs-extract-${apis[0]!.id}-${process.pid}.json`);
    writeFileSync(requestFile, JSON.stringify(request));
    log.step(`${ids}: extracting from ${nest.module} (preview mode, no providers started)`);
    const results = await runExtractor(cli, requestFile, root);
    apis.forEach((api, i) => nestResults.set(api.id, results[i]!));
  }

  for (const api of config.apis) {
    if (options.only && api.id !== options.only) continue;
    const out = specFile(dir, api.id);
    mkdirSync(join(dir, 'openapi'), { recursive: true });
    const source = api.source;
    let result: { operations: number; gaps: string[] };

    if ('nest' in source) {
      result = nestResults.get(api.id)!;
    } else {
      const raw =
        'file' in source
          ? readFileSync(resolve(dir, source.file), 'utf8')
          : await fetch(source.url).then((r) => {
              if (!r.ok) throw new Error(`${api.id}: GET ${source.url} → ${r.status}`);
              return r.text();
            });
      const { document, errors } = await loadDocument(raw);
      for (const e of errors.slice(0, 20)) log.warn(`${api.id}: ${e}`);
      if (api.servers) document.servers = api.servers;
      if (api.securitySchemes) {
        document.components ??= {};
        document.components.securitySchemes = { ...document.components.securitySchemes, ...(api.securitySchemes as Record<string, Record<string, unknown>>) };
      }
      writeFileSync(out, stableStringify(document));
      const operations = Object.values(document.paths ?? {}).reduce((n, item) => n + Object.keys(item).filter((k) => k !== 'parameters').length, 0);
      result = { operations, gaps: findDocumentationGaps(document) };
    }

    const ok = !(api.completeness === 'error' && result.gaps.length);
    if (result.gaps.length && api.completeness !== 'off') {
      const show = api.completeness === 'error' ? log.error : log.warn;
      show(`${api.id}: ${result.gaps.length} documentation gap(s):`);
      for (const g of result.gaps.slice(0, 50)) log.dim(`    ${g}`);
      if (result.gaps.length > 50) log.dim(`    … and ${result.gaps.length - 50} more`);
    }
    log.ok(`${api.id}: ${result.operations} operations → ${out}`);
    summaries.push({ id: api.id, operations: result.operations, gaps: result.gaps, ok });
  }
  // Public copies for the "Download OpenAPI Document" link (without operations some readers may not
  // open), and the variants of reader-dependent files in the access manifest.
  await writeAccessVariants(loaded);
  await writeAiManifest(loaded);
  return summaries;
}
