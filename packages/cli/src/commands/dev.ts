import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import type { NestSourceConfig } from '@orbitdocs/core';
import type { LoadedConfig } from '@orbitdocs/core/loader';
import { watch } from 'chokidar';

import { log, resolveFrom, runShell } from '../util';
import { extract } from './extract';
import { detectNest } from './init';

/**
 * What `orbitdocs dev` watches for one Nest API. With a `build` command: the
 * sources, i.e. nest-cli.json's `sourceRoot` (default `src`), or the project
 * root itself when that folder doesn't exist — then build output, dependencies
 * and the docs app are ignored so a rebuild can't retrigger itself. Without a
 * build: the compiled module's folder.
 */
export function watchTarget(nest: Pick<NestSourceConfig, 'root' | 'build' | 'module'>, docsDir: string): { path: string; ignored: (file: string) => boolean } {
  const root = resolve(docsDir, nest.root);
  const deps = (file: string) => file.split(/[\\/]/).includes('node_modules');
  if (!nest.build) return { path: resolve(root, nest.module, '..'), ignored: deps };
  const sources = resolve(root, detectNest(root).sourceRoot);
  if (existsSync(sources)) return { path: sources, ignored: deps };
  const output = resolve(root, nest.module.split(/[\\/]/)[0] ?? 'dist');
  const inside = (dir: string, file: string) => {
    const rel = relative(dir, file);
    return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
  };
  return {
    path: root,
    ignored: (file) =>
      deps(file) || inside(resolve(docsDir), file) || (output !== root && inside(output, file)) || file.split(/[\\/]/).some((p) => p === '.git'),
  };
}

/**
 * Extracts once, starts `next dev`, then re-extracts whenever the API changes:
 * with a `build` command it watches the Nest sources and rebuilds; otherwise it
 * watches the compiled module's folder (e.g. while `nest start --watch` runs).
 */
export async function dev(loaded: LoadedConfig, options: { port?: string }) {
  try {
    await extract(loaded);
  } catch (e) {
    log.error((e as Error).message);
    log.warn('Starting anyway; fix the API and save to retry.');
  }

  const next = spawn(process.execPath, [resolveFrom(loaded.dir, 'next/dist/bin/next'), 'dev', ...(options.port ? ['-p', options.port] : [])], {
    cwd: loaded.dir,
    stdio: 'inherit',
  });
  next.on('exit', (code) => process.exit(code ?? 0));

  for (const api of loaded.config.apis) {
    if (!('nest' in api.source)) continue;
    const nest = api.source.nest;
    const root = resolve(loaded.dir, nest.root);
    const target = watchTarget(nest, loaded.dir);
    let timer: NodeJS.Timeout | undefined;
    let running = false;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (running) return refresh();
        running = true;
        try {
          if (nest.build) {
            const code = await runShell(nest.build, root);
            if (code !== 0) throw new Error(`${nest.build} failed`);
          }
          await extract(loaded, { only: api.id, skipBuild: true });
          log.ok(`${api.id}: reference updated — reload the page`);
        } catch (e) {
          log.error((e as Error).message);
        } finally {
          running = false;
        }
      }, 600);
    };
    watch(target.path, { ignoreInitial: true, ignored: target.ignored }).on('all', refresh);
    log.dim(`watching ${target.path} for ${api.id}`);
  }
}
