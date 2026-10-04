import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { type FilterOptions, filterDocument, findDocumentationGaps, stableStringify } from '@orbitdocs/openapi';

/** What the CLI asks the extractor to do (passed as a JSON file). */
export interface ExtractRequest {
  /** Nest project root (absolute). */
  root: string;
  /** Compiled module file, relative to `root`. */
  module: string;
  /** Exported module class. */
  export: string;
  globalPrefix?: string;
  versioning?: { type: 'uri'; defaultVersion?: string; prefix?: string };
  /** `path#export` of a compiled `configure(app)` hook, relative to `root`. */
  configure?: string;
  /** Set before the module is loaded. Real environment values win. */
  env?: Record<string, string>;
  /** Base document info. */
  info?: { title?: string; version?: string; description?: string };
  filter: FilterOptions;
  /** Output file (absolute). */
  out: string;
}

export interface ExtractResult {
  out: string;
  operations: number;
  gaps: string[];
}

/** One API written from a shared boot: its own info, filter and output file. */
export interface ExtractTarget {
  info?: ExtractRequest['info'];
  filter: FilterOptions;
  out: string;
}

/** Several APIs from one app: it is booted once and each target filtered from the same document. */
export type ExtractManyRequest = Omit<ExtractRequest, 'info' | 'filter' | 'out'> & { targets: ExtractTarget[] };

type NestCore = typeof import('@nestjs/core');
type NestCommon = typeof import('@nestjs/common');
type NestSwagger = typeof import('@nestjs/swagger');

/**
 * Boots the compiled Nest module in preview mode (controllers and modules are
 * scanned, no provider is instantiated — nothing connects to a database or a
 * queue), builds the OpenAPI document with the app's own @nestjs/swagger, and
 * writes the filtered public document.
 *
 * Nest packages are resolved from the project, so the module and the scanner
 * share one copy of Nest.
 */
export async function extract(req: ExtractRequest): Promise<ExtractResult> {
  const { info, filter, out, ...rest } = req;
  const [result] = await extractMany({ ...rest, targets: [{ info, filter, out }] });
  return result!;
}

/** Boots the module once and writes one filtered document per target. */
export async function extractMany(req: ExtractManyRequest): Promise<ExtractResult[]> {
  // Lets the app tell an extraction from a real start, e.g. to skip config validation
  // that needs real secrets. Nothing connects in preview mode, so nothing needs them.
  process.env.ORBITDOCS_EXTRACT = '1';
  for (const [key, value] of Object.entries(req.env ?? {})) process.env[key] ??= value;
  const root = resolve(req.root);
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) throw new Error(`No package.json in the Nest project root ${root}`);
  const projectRequire = createRequire(pkg);

  projectRequire('reflect-metadata');
  const core = projectRequire('@nestjs/core') as NestCore;
  const common = projectRequire('@nestjs/common') as NestCommon;
  const swagger = projectRequire('@nestjs/swagger') as NestSwagger;

  const modulePath = resolve(root, req.module);
  if (!existsSync(modulePath)) {
    throw new Error(`Compiled module not found: ${modulePath}. Build the app first (e.g. \`nest build\`), or set \`build\` in the config.`);
  }
  const loaded = (await loadModule(modulePath)) as Record<string, unknown>;
  const AppModule = loaded[req.export];
  if (typeof AppModule !== 'function') {
    throw new Error(`${req.module} has no export named "${req.export}" (found: ${Object.keys(loaded).join(', ') || 'nothing'})`);
  }

  const app = await core.NestFactory.create(AppModule as never, {
    preview: true,
    abortOnError: false,
    logger: ['error', 'warn'],
  });
  try {
    if (req.globalPrefix) app.setGlobalPrefix(req.globalPrefix);
    if (req.versioning) {
      app.enableVersioning({
        type: common.VersioningType.URI,
        ...(req.versioning.defaultVersion ? { defaultVersion: req.versioning.defaultVersion } : {}),
        prefix: req.versioning.prefix ?? 'v',
      });
    }
    if (req.configure) {
      const [file, name = 'configure'] = req.configure.split('#');
      const hook = ((await loadModule(resolve(root, file!))) as Record<string, unknown>)[name!];
      if (typeof hook !== 'function') throw new Error(`${req.configure}: no function "${name}"`);
      await (hook as (a: unknown) => unknown)(app);
    }

    const full = swagger.SwaggerModule.createDocument(app, new swagger.DocumentBuilder().setTitle('API').setVersion('1.0.0').build(), {
      deepScanRoutes: true,
    });
    return req.targets.map((t) => {
      const info = Object.fromEntries(
        Object.entries({ title: t.info?.title, version: t.info?.version, description: t.info?.description }).filter(([, v]) => v !== undefined),
      );
      const doc = filterDocument(structuredClone(full) as never, { ...t.filter, info: { ...info, ...t.filter.info } });
      mkdirSync(dirname(t.out), { recursive: true });
      writeFileSync(t.out, stableStringify(doc));
      const operations = Object.values(doc.paths).reduce(
        (n, item) => n + Object.keys(item).filter((k) => k !== 'parameters').length,
        0,
      );
      return { out: t.out, operations, gaps: findDocumentationGaps(doc) };
    });
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function loadModule(file: string): Promise<unknown> {
  // require() handles CommonJS builds (the Nest default); fall back to import() for ESM builds.
  try {
    return createRequire(file)(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ERR_REQUIRE_ESM') throw err;
    const { pathToFileURL } = await import('node:url');
    return import(pathToFileURL(file).href);
  }
}
