import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from '../util';
import { CLI_VERSION } from '../version';

export interface InitOptions {
  /** Docs folder name (default `docs`). */
  dir?: string;
  title?: string;
  /** Use `workspace:*` versions (inside the OrbitDocs monorepo). */
  workspace?: boolean;
  force?: boolean;
  /** Which routes reach the docs: `opt-in` (marked with `@DocsOperation`, default) or `all` (everything Swagger sees). */
  routes?: 'opt-in' | 'all';
}

/** New docs apps use this CLI's own release line (the packages are released together). */
const VERSION = `^${CLI_VERSION}`;

/** Facts read from the Nest project so the generated config matches main.ts. */
export function detectNest(root: string) {
  const pkg = existsSync(join(root, 'package.json')) ? (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string }) : {};
  const nestCli = existsSync(join(root, 'nest-cli.json'))
    ? (JSON.parse(readFileSync(join(root, 'nest-cli.json'), 'utf8')) as { sourceRoot?: string })
    : undefined;
  const sourceRoot = nestCli?.sourceRoot ?? 'src';
  const main = join(root, sourceRoot, 'main.ts');
  const mainText = existsSync(main) ? readFileSync(main, 'utf8') : '';
  const prefix = /setGlobalPrefix\(\s*['"`]([^'"`]+)['"`]/.exec(mainText)?.[1];
  const versioning = /enableVersioning\(/.test(mainText);
  const versionPrefix = /prefix:\s*['"`]([^'"`]*)['"`]/.exec(mainText)?.[1];
  const defaultVersion = /defaultVersion:\s*['"`]([^'"`]+)['"`]/.exec(mainText)?.[1];
  const moduleFile = existsSync(join(root, sourceRoot, 'app.module.ts')) ? 'dist/app.module.js' : 'dist/app.module.js';
  return {
    /** Routes already described with @nestjs/swagger's @ApiOperation (a hint for `routes: 'all'`). */
    swaggerOperations: countMatches(join(root, sourceRoot), /@ApiOperation\(/g),
    name: pkg.name ?? 'api',
    /** nest-cli.json `sourceRoot` (default `src`), relative to the project root. */
    sourceRoot,
    isNest: Boolean(nestCli) || existsSync(main),
    moduleFile,
    build: nestCli ? 'nest build' : undefined,
    prefix,
    versioning: versioning ? { type: 'uri' as const, prefix: versionPrefix ?? 'v', ...(defaultVersion ? { defaultVersion } : {}) } : undefined,
  };
}

function countMatches(dir: string, re: RegExp): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const f = join(dir, name);
    if (statSync(f).isDirectory()) n += countMatches(f, re);
    else if (/\.ts$/.test(name)) n += readFileSync(f, 'utf8').match(re)?.length ?? 0;
  }
  return n;
}

const titleCase = (s: string) =>
  s.replace(/^@[^/]+\//, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bApi\b/, 'API');

function templateDir(): string {
  // dist/index.js → ../templates; src/commands/init.ts (tests) → ../../templates
  const here = dirname(fileURLToPath(import.meta.url));
  const fromDist = resolve(here, '..', 'templates', 'docs-app');
  return existsSync(fromDist) ? fromDist : resolve(here, '..', '..', 'templates', 'docs-app');
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

/** Creates the docs app (a visible Next.js app) inside a Nest project. */
export function init(root: string, options: InitOptions = {}) {
  const target = resolve(root, options.dir ?? 'docs');
  if (existsSync(target) && readdirSync(target).length && !options.force) {
    throw new Error(`${relative(process.cwd(), target) || '.'} is not empty (use --force to write into it).`);
  }
  const nest = detectNest(root);
  if (!nest.isNest) log.warn('No Nest project found here; the config will point at dist/app.module.js — edit it if needed.');
  const apiId = nest.name.replace(/^@[^/]+\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-api$/, '').toLowerCase() || 'api';
  const title = options.title ?? titleCase(nest.name.replace(/-api$/, ''));
  const version = options.workspace ? 'workspace:*' : VERSION;

  const nestSource = [
    `module: '${nest.moduleFile}'`,
    nest.build ? `build: '${nest.build}'` : undefined,
    options.routes === 'all' ? `routes: 'all'` : undefined,
    nest.prefix ? `globalPrefix: '${nest.prefix}'` : undefined,
    nest.versioning
      ? `versioning: { type: 'uri', prefix: '${nest.versioning.prefix}'${nest.versioning.defaultVersion ? `, defaultVersion: '${nest.versioning.defaultVersion}'` : ''} }`
      : undefined,
  ]
    .filter(Boolean)
    .join(',\n          ');

  const vars = { TITLE: title, API_ID: apiId, NEST_SOURCE: nestSource, VERSION: version, PKG_NAME: `${apiId}-docs` };
  mkdirSync(target, { recursive: true });
  const src = templateDir();
  for (const file of walk(src)) {
    const rel = relative(src, file);
    const dest = join(target, rel.replace(/\.tpl$/, '').replace(/(^|\/)_gitignore$/, '$1.gitignore'));
    mkdirSync(dirname(dest), { recursive: true });
    if (/\.(tsx?|mjs|json|mdx|css|tpl)$|_gitignore$/.test(file)) writeFileSync(dest, fill(readFileSync(file, 'utf8'), vars));
    else cpSync(file, dest);
  }
  log.ok(`Created ${relative(process.cwd(), target) || target}`);
  console.log(`
Next steps:
  1. In your Nest app:   npm install @vitra-ai/orbitdocs-nestjs
  2. ${
    options.routes === 'all'
      ? 'Every route @nestjs/swagger sees is documented. Hide one with @ApiExcludeEndpoint().'
      : "Mark public routes: @DocsOperation({ group: 'Bookings', title: 'Create a booking' })"
  }
  3. Run the docs:       cd ${relative(process.cwd(), target)} && npm install && npm run dev
`);
  return { target, apiId, title };
}

