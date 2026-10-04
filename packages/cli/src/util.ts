import { spawn, type SpawnOptions } from 'node:child_process';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';

import pc from 'picocolors';

export const log = {
  step: (msg: string) => console.log(`${pc.cyan('›')} ${msg}`),
  ok: (msg: string) => console.log(`${pc.green('✓')} ${msg}`),
  warn: (msg: string) => console.log(`${pc.yellow('!')} ${msg}`),
  error: (msg: string) => console.error(`${pc.red('✗')} ${msg}`),
  dim: (msg: string) => console.log(pc.dim(msg)),
};

/** Runs a command, streaming its output. Resolves with the exit code. */
export function run(command: string, args: string[], options: SpawnOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

/** Runs a shell command line (e.g. a configured `build`). */
export function runShell(line: string, cwd: string): Promise<number> {
  // Like npm scripts: the project's own binaries win over global ones.
  const PATH = [join(cwd, 'node_modules', '.bin'), process.env.PATH].join(delimiter);
  return run(line, [], { cwd, shell: true, env: { ...process.env, PATH } });
}

/** Resolves a package entry from a project directory (its own node_modules). */
export function resolveFrom(dir: string, request: string): string {
  return createRequire(join(dir, 'package.json')).resolve(request);
}

export function fail(message: string): never {
  log.error(message);
  process.exit(1);
}
