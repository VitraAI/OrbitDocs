import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

import { type SdksConfig, specFile } from '@orbitdocs/core';
import type { LoadedConfig } from '@orbitdocs/core/loader';
import { buildReferenceModel, exampleFor, loadDocument, type OperationModel, type ReferenceModel } from '@orbitdocs/openapi';

import { fail, log, run } from '../util';
import { sdkFunctions } from './sdk-test';

export const SDK_LANGUAGES = ['typescript', 'python', 'go', 'java', 'csharp', 'php'] as const;
export type SdkLanguage = (typeof SDK_LANGUAGES)[number];

const GENERATOR: Record<Exclude<SdkLanguage, 'typescript'>, string> = { python: 'python', go: 'go', java: 'java', csharp: 'csharp', php: 'php' };
const LABEL: Record<SdkLanguage, string> = { typescript: 'TypeScript SDK', python: 'Python SDK', go: 'Go SDK', java: 'Java SDK', csharp: 'C# SDK', php: 'PHP SDK' };
const FENCE: Record<SdkLanguage, string> = { typescript: 'typescript', python: 'python', go: 'go', java: 'java', csharp: 'csharp', php: 'php' };

/** Files a regeneration never overwrites: write your own code here. */
const KEEP = ['CHANGELOG.md', 'custom/**', '.github/**', '.gitlab-ci.yml', 'LICENSE'];

/** The APIs `orbitdocs sdk` builds SDKs for (`sdks.apis`, default every API). */
export function sdkApis(config: LoadedConfig['config']): string[] {
  return config.apis.map((a) => a.id).filter((id) => !config.sdks?.apis || config.sdks.apis.includes(id));
}

/** A language option with `{api}` replaced by the API id (e.g. `out: 'sdks/{api}-ts'`, `package: '@acme/{api}'`). */
export const forApi = <T extends string | undefined>(value: T, api: string): T => value?.replaceAll('{api}', api) as T;

/**
 * Where one API's SDK in one language goes. Default `sdks/<api>/<language>`.
 * `out` may contain `{api}`; without it, one API uses `out` as is and several
 * APIs each get `<out>/<api>`, so no SDK overwrites another.
 */
export function sdkDir(loaded: LoadedConfig, api: string, lang: SdkLanguage): string {
  const out = loaded.config.sdks?.[lang]?.out;
  if (!out) return resolve(loaded.dir, 'sdks', api, lang);
  if (out.includes('{api}')) return resolve(loaded.dir, forApi(out, api));
  return sdkApis(loaded.config).length > 1 ? resolve(loaded.dir, out, api) : resolve(loaded.dir, out);
}

const write = (file: string, content: string, overwrite = false) => {
  if (!overwrite && existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

/** The `sdks` section with `{api}` filled in every language's string options. */
export function sdksForApi(sdks: SdksConfig, api: string): SdksConfig {
  const result = { ...sdks } as Record<string, unknown>;
  for (const lang of SDK_LANGUAGES) {
    const cfg = sdks[lang] as Record<string, unknown> | undefined;
    if (!cfg) continue;
    // Identifiers (Python/Java/Go packages, PHP namespaces) can't hold a dash: `travel-v2` → `travel_v2`.
    const identifier = (k: string) => (k === 'package' && lang !== 'typescript' && lang !== 'csharp') || k === 'namespace';
    result[lang] = Object.fromEntries(
      Object.entries(cfg).map(([k, v]) => [k, typeof v === 'string' ? forApi(v, identifier(k) ? api.replace(/[^a-z0-9]+/gi, '_') : api) : v]),
    );
  }
  return result as SdksConfig;
}

/** TypeScript: hey-api writes `src/generated/`; the package files around it are yours. */
async function generateTypescript(loaded: LoadedConfig, api: string, spec: string, out: string) {
  const cfg = loaded.config.sdks!.typescript!;
  const pkg = forApi(cfg.package, api);
  const generated = join(out, 'src', 'generated');
  rmSync(generated, { recursive: true, force: true });
  const { createClient } = await import('@hey-api/openapi-ts');
  await createClient({
    input: spec,
    output: { path: generated },
    plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk'],
    logs: { level: 'silent' },
  });
  write(
    join(out, 'package.json'),
    `${JSON.stringify(
      {
        name: pkg,
        version: cfg.version ?? '0.1.0',
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
        files: ['dist'],
        scripts: { build: 'tsup src/index.ts --format esm --dts --clean' },
        devDependencies: { tsup: '^8.5.1', typescript: '^6.0.3' },
      },
      null,
      2,
    )}\n`,
  );
  write(join(out, 'tsconfig.json'), `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, declaration: true }, include: ['src'] }, null, 2)}\n`);
  // Your entry point: re-export the generated code, add helpers next to it.
  write(join(out, 'src', 'index.ts'), `export * from './generated';\nexport { client } from './generated/client.gen';\n`);
  write(join(out, 'README.md'), `# ${pkg}\n\nGenerated by OrbitDocs from the ${api} API. \`src/generated/\` is rewritten on every regeneration; everything else is yours.\n`);
}

/** Other languages: openapi-generator, with your files protected by `.openapi-generator-ignore`. */
async function generateWithOpenapiGenerator(loaded: LoadedConfig, api: string, lang: Exclude<SdkLanguage, 'typescript'>, spec: string, out: string) {
  const s = sdksForApi(loaded.config.sdks!, api);
  const props: Record<string, string | undefined> =
    lang === 'python'
      ? { packageName: s.python!.package, projectName: s.python!.project ?? s.python!.package.replace(/_/g, '-'), packageVersion: s.python!.version }
      : lang === 'go'
        ? { packageName: s.go!.package ?? s.go!.module.split('/').at(-1)!.replace(/[^a-z0-9]/gi, ''), packageVersion: s.go!.version }
        : lang === 'java'
          ? { groupId: s.java!.groupId, artifactId: s.java!.artifactId, artifactVersion: s.java!.version, invokerPackage: s.java!.package, apiPackage: `${s.java!.package}.api`, modelPackage: `${s.java!.package}.model`, library: 'native' }
          : lang === 'csharp'
            ? { packageName: s.csharp!.package, packageVersion: s.csharp!.version, targetFramework: 'net8.0' }
            : { invokerPackage: s.php!.namespace, composerPackageName: s.php!.package, artifactVersion: s.php!.version };
  write(join(out, '.openapi-generator-ignore'), `# Files OrbitDocs never overwrites when it regenerates this SDK.\n${KEEP.join('\n')}\n`);
  const additional = Object.entries(props)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  // Go imports use the module path: github.com/acme/acme-go → git host, user and repo.
  const [gitHost, gitUserId, ...repo] = (s.go?.module ?? '').split('/');
  const git = lang === 'go' && repo.length ? ['--git-host', gitHost!, '--git-user-id', gitUserId!, '--git-repo-id', repo.join('/')] : [];
  const bin = resolveGeneratorBin();
  const code = await run(process.execPath, [bin, 'generate', '-i', spec, '-g', GENERATOR[lang], '-o', out, '--additional-properties', additional, ...git, '--skip-validate-spec'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (code !== 0) fail(`openapi-generator failed for ${lang} (it needs Java 11 or later on PATH).`);
}

function resolveGeneratorBin(): string {
  const root = dirname(createRequire(import.meta.url).resolve('@openapitools/openapi-generator-cli/package.json'));
  const main = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  return join(root, Object.values(main.bin)[0]!);
}

/**
 * How a sample authenticates: the operation's first security requirement
 * (its own, else the document's), one entry per scheme in it.
 */
export interface SampleAuth {
  /** Security scheme name (the key in `components.securitySchemes`). */
  scheme?: string;
  /** API key sent in this header. */
  header?: string;
  /** API key outside a header (query or cookie). */
  apiKey?: boolean;
  /** HTTP bearer / OAuth 2 / OpenID Connect access token. */
  bearer?: boolean;
  /** HTTP basic. */
  basic?: boolean;
  /** Environment variable the sample reads the secret from. */
  env?: string;
}

/** `apiKey` → `API_KEY`, `partner-key` → `PARTNER_KEY`, `bearer` → `BEARER_TOKEN`. */
export function authEnvVar(scheme: string, kind: 'key' | 'token' | 'basic'): string {
  const name = scheme
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (kind === 'basic') return name || 'API';
  if (/(KEY|TOKEN|SECRET)$/.test(name)) return name;
  return `${name || 'API'}_${kind === 'key' ? 'API_KEY' : 'TOKEN'}`.replace(/^API_API_KEY$/, 'API_KEY');
}

/** The schemes an operation's sample should use, from its effective security. */
export function sampleAuth(op: OperationModel, model: ReferenceModel): SampleAuth[] {
  const requirement = op.security.find((r) => Object.keys(r).length > 0);
  if (!requirement) return [];
  return Object.keys(requirement).flatMap((name): SampleAuth[] => {
    const s = model.securitySchemes[name] as { type?: string; in?: string; name?: string; scheme?: string } | undefined;
    if (!s) return [];
    if (s.type === 'apiKey') return [s.in === 'header' && s.name ? { scheme: name, header: s.name, env: authEnvVar(name, 'key') } : { scheme: name, apiKey: true, env: authEnvVar(name, 'key') }];
    if (s.type === 'http' && s.scheme?.toLowerCase() === 'basic') return [{ scheme: name, basic: true, env: authEnvVar(name, 'basic') }];
    if (s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect') return [{ scheme: name, bearer: true, env: authEnvVar(name, 'token') }];
    return [];
  });
}

/** The body an SDK sample sends: the operation's example, else one built from its schema. */
function sampleBody(op: OperationModel, model: ReferenceModel): unknown {
  const body = op.requestBody?.content[0];
  if (!body) return undefined;
  return body.example ?? exampleFor(body.schema, model.schemas, { direction: 'request' });
}

/** Example arguments for a TypeScript SDK call. */
export function tsSample(op: OperationModel, model: ReferenceModel, fn: string, pkg: string, server: string | undefined, auth: SampleAuth = {}): string {
  const parts: string[] = [];
  const group = (where: string) => {
    const ps = op.parameters.filter((p) => p.in === where && (p.required || p.example !== undefined));
    if (!ps.length) return;
    const fields = ps.map((p) => `${/^[a-z_$][\w$]*$/i.test(p.name) ? p.name : JSON.stringify(p.name)}: ${JSON.stringify(p.example ?? exampleFor(p.schema, model.schemas, { direction: 'request' }) ?? '')}`);
    parts.push(`  ${where === 'header' ? 'headers' : where}: { ${fields.join(', ')} },`);
  };
  group('path');
  group('query');
  group('header');
  if (op.requestBody?.content[0]) parts.push(`  body: ${JSON.stringify(sampleBody(op, model), null, 2).replace(/\n/g, '\n  ')},`);
  const authHeaders = auth.header
    ? `, headers: { '${auth.header}': process.env.${auth.env ?? 'API_KEY'} }`
    : auth.bearer
      ? `, auth: process.env.${auth.env ?? 'API_TOKEN'}`
      : '';
  return [
    `import { client, ${fn} } from '${pkg}';`,
    '',
    `client.setConfig({ baseUrl: '${server ?? 'https://api.example.com'}'${authHeaders} });`,
    '',
    parts.length ? `const { data, error } = await ${fn}({\n${parts.join('\n')}\n});` : `const { data, error } = await ${fn}();`,
  ].join('\n');
}

/** openapi-generator's own example for each method (docs/*.md), by `METHOD /path`. */
export function generatorExamples(out: string, lang: Exclude<SdkLanguage, 'typescript'>): Map<string, string> {
  const map = new Map<string, string>();
  const readme = join(out, 'README.md');
  const docs = join(out, 'docs');
  if (!existsSync(readme) || !existsSync(docs)) return map;
  // README rows: *Class* | [**method**](docs/Class.md#anchor) | **POST** /path | Summary
  const rows = [...readFileSync(readme, 'utf8').matchAll(/\[\*\*(\w+)\*\*\]\(([^)#]+)#([^)]+)\)\s*\|\s*\*\*(\w+)\*\*\s+(\S+)/g)];
  const comment = lang === 'python' ? /^\s*#(?!\s*(?:Create|Enter)).*$/ : lang === 'php' ? /^\s*\/\/.*$/ : /^\s*\/\/.*$/;
  for (const [, method, docFile, , verb, path] of rows) {
    const file = join(out, docFile!);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const start = text.search(new RegExp(`^#+ \\**${method}\\**\\s*$`, 'm'));
    if (start < 0) continue;
    const section = text.slice(start);
    const code = /### Example[\s\S]*?```\w*\n([\s\S]*?)```/.exec(section)?.[1];
    if (!code) continue;
    const lines = code.split('\n').filter((l) => !comment.test(l));
    let tidy = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    // The generator's Python examples read os.environ without importing os.
    if (lang === 'python' && tidy.includes('os.environ') && !/^import os$/m.test(tidy)) tidy = `import os\n${tidy}`;
    map.set(`${verb!.toUpperCase()} ${path}`, tidy);
  }
  return map;
}

/** A JSON value as a Python literal (`true` → `True`, `null` → `None`), indented like the surrounding code. */
export function pyLiteral(value: unknown, indent = ''): string {
  const inner = `${indent}    `;
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => `${inner}${pyLiteral(v, inner)}`).join(',\n')},\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pyLiteral(v, inner)}`).join(',\n')},\n${indent}}`;
}

/**
 * Tidies openapi-generator's Python example for one operation. The generator
 * shows every scheme the API has, one after another (so the bearer block
 * re-creates `configuration`, dropping the host and the API key), and builds
 * request models empty (`CreateBookingDto()`). The sample instead builds
 * `configuration` once, with the host and only the schemes this operation
 * uses, read from environment variables named after them, and fills the
 * request model from the operation's example.
 */
export function pythonSample(source: string, op: OperationModel, model: ReferenceModel, server?: string): string {
  const pkg = /(\w+)\.Configuration\(/.exec(source)?.[1] ?? /^import (\w+)$/m.exec(source)?.[1];
  if (!pkg) return source;
  const host = server ?? /host\s*=\s*"([^"]*)"/.exec(source)?.[1];
  const lines = source.split('\n');
  const kept: string[] = [];
  let configAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // configuration = pkg.Configuration(...), possibly over several lines.
    if (/^configuration\s*=\s*\w+\.Configuration\(/.test(line)) {
      if (configAt < 0) configAt = kept.length;
      let depth = 0;
      for (; i < lines.length; i++) {
        depth += (lines[i]!.match(/\(/g)?.length ?? 0) - (lines[i]!.match(/\)/g)?.length ?? 0);
        if (depth <= 0) break;
      }
      continue;
    }
    if (/^configuration\.\w+/.test(line)) {
      if (configAt < 0) configAt = kept.length;
      continue;
    }
    kept.push(line);
  }

  const auth = sampleAuth(op, model);
  const args = [host !== undefined ? `    host = ${JSON.stringify(host)},` : undefined];
  const after: string[] = [];
  for (const a of auth) {
    if (a.bearer) args.push(`    access_token = os.environ["${a.env}"],`);
    else if (a.basic) args.push(`    username = os.environ["${a.env}_USERNAME"],`, `    password = os.environ["${a.env}_PASSWORD"],`);
    else after.push(`configuration.api_key[${JSON.stringify(a.scheme)}] = os.environ["${a.env}"]`);
  }
  const config = [`configuration = ${pkg}.Configuration(`, ...args.filter(Boolean), ')', ...after] as string[];
  if (configAt < 0) configAt = Math.max(0, kept.findIndex((l) => /^with /.test(l)));
  kept.splice(configAt, 0, ...config);

  // Values the generator leaves empty (`CreateBookingDto()`, `GrantType()`) or as
  // placeholders (`'client_id_example'`) come from the operation's examples.
  const snake = (n: string) =>
    n
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const content = op.requestBody?.content[0];
  const body = sampleBody(op, model);
  // Form bodies are flattened into one argument per field.
  const form = Boolean(content && /form/.test(content.mediaType));
  const fields = new Map<string, unknown>(form && isRecord(body) ? Object.entries(body).map(([k, v]) => [snake(k), v]) : []);
  const params = new Map(op.parameters.map((p) => [snake(p.name), p]));
  let bodyFilled = form;
  const out = kept.map((line) => {
    const m = /^(\s*)(\w+) = (.+?) # ([^|\n]*\|.*)$/.exec(line);
    if (!m) return line;
    const [, indent, name, value, comment] = m as unknown as [string, string, string, string, string];
    const empty = /^(\w+)\.(\w+)\(\)$/.exec(value.trim());
    const placeholder = /^'[^']*_example'$/.test(value.trim());
    const set = (v: unknown, keepComment = true) => {
      const literal = pyLiteral(v, indent);
      const expr = empty ? (isRecord(v) ? `${empty[1]}.${empty[2]}.from_dict(${literal})` : `${empty[1]}.${empty[2]}(${literal})`) : literal;
      return `${indent}${name} = ${expr}${keepComment && !expr.includes('\n') ? ` # ${comment}` : ''}`;
    };
    const param = params.get(name);
    if (param && (empty || placeholder)) {
      const own = param.example ?? (param.schema as { example?: unknown; default?: unknown } | undefined)?.example ?? (param.schema as { default?: unknown } | undefined)?.default;
      // An empty enum/model needs some value; a placeholder string only changes for a real example.
      const v = own ?? (empty ? exampleFor(param.schema, model.schemas, { direction: 'request' }) : undefined);
      return v === undefined ? line : set(v);
    }
    if (fields.has(name) && (empty || placeholder)) return set(fields.get(name));
    if (!param && empty && !bodyFilled && isRecord(body)) {
      bodyFilled = true;
      return set(body, false);
    }
    return line;
  });

  let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const usesOs = /\bos\.environ\b/.test(text);
  if (usesOs && !/^import os$/m.test(text)) text = `import os\n${text}`;
  if (!usesOs) text = text.replace(/^import os\n/m, '');
  return text;
}

export interface SdkSample {
  lang: string;
  label: string;
  source: string;
}

/** `.orbitdocs/sdk-samples.json`: code samples for the reference, by API and `METHOD /path`. */
export async function writeSdkSamples(loaded: LoadedConfig): Promise<number> {
  const { config, dir } = loaded;
  const sdks = config.sdks;
  const out: Record<string, Record<string, SdkSample[]>> = {};
  let count = 0;
  if (sdks?.samples !== false) {
    for (const api of config.apis) {
      if (sdks?.apis && !sdks.apis.includes(api.id)) continue;
      const file = specFile(dir, api.id);
      if (!existsSync(file)) continue;
      const { document } = await loadDocument(readFileSync(file, 'utf8'));
      const model = buildReferenceModel(document, api.id);
      const byOp: Record<string, SdkSample[]> = {};
      const opsByKey = new Map(model.operations.map((op) => [`${op.method.toUpperCase()} ${op.path}`, op]));
      const server = model.servers[0]?.url;
      for (const lang of SDK_LANGUAGES) {
        if (!sdks?.[lang]) continue;
        const sdkOut = sdkDir(loaded, api.id, lang);
        if (lang === 'typescript') {
          const fns = sdkFunctions(sdkOut);
          for (const op of model.operations) {
            const fn = fns.get(`${op.method.toUpperCase()} ${op.path}`);
            if (!fn) continue;
            const source = tsSample(op, model, fn, forApi(sdks.typescript!.package, api.id), server, sampleAuth(op, model)[0]);
            (byOp[`${op.method.toUpperCase()} ${op.path}`] ??= []).push({ lang: FENCE[lang], label: LABEL[lang], source });
            count++;
          }
        } else {
          for (const [key, raw] of generatorExamples(sdkOut, lang)) {
            const op = opsByKey.get(key);
            const source = lang === 'python' && op ? pythonSample(raw, op, model, server) : raw;
            (byOp[key] ??= []).push({ lang: FENCE[lang], label: LABEL[lang], source });
            count++;
          }
        }
      }
      out[api.id] = byOp;
    }
  }
  mkdirSync(join(dir, '.orbitdocs'), { recursive: true });
  writeFileSync(join(dir, '.orbitdocs', 'sdk-samples.json'), `${JSON.stringify(out)}\n`);
  return count;
}

/** Options that would make several APIs' SDKs collide (same package name). */
export function sdkWarnings(config: LoadedConfig['config'], langs: readonly SdkLanguage[] = SDK_LANGUAGES): string[] {
  const sdks = config.sdks;
  if (!sdks || sdkApis(config).length < 2) return [];
  const NAME: Record<SdkLanguage, string> = { typescript: 'package', python: 'package', go: 'module', java: 'artifactId', csharp: 'package', php: 'namespace' };
  return langs.flatMap((lang) => {
    const value = (sdks[lang] as Record<string, unknown> | undefined)?.[NAME[lang]];
    return typeof value === 'string' && !value.includes('{api}')
      ? [`sdks.${lang}.${NAME[lang]} "${value}" is the same for every API; add {api} (e.g. "${lang === 'python' ? `${value}_{api}` : `${value}-{api}`}") so each API's SDK gets its own name.`]
      : [];
  });
}

/** `orbitdocs sdk`: regenerates the configured SDKs. */
export async function sdk(loaded: LoadedConfig, options: { lang?: string; api?: string } = {}): Promise<void> {
  const { config, dir } = loaded;
  const sdks: SdksConfig | undefined = config.sdks;
  if (!sdks) fail('Add an `sdks` section to orbitdocs.config.ts first.');
  const wanted = options.lang ? (options.lang.split(',').map((l) => l.trim()) as SdkLanguage[]) : SDK_LANGUAGES.filter((l) => sdks[l]);
  for (const lang of wanted) {
    if (!SDK_LANGUAGES.includes(lang)) fail(`Unknown language "${lang}". Use ${SDK_LANGUAGES.join(', ')}.`);
    if (!sdks[lang]) fail(`sdks.${lang} is not configured.`);
  }
  for (const w of sdkWarnings(loaded.config, wanted)) log.warn(w);
  for (const api of config.apis) {
    if (options.api && api.id !== options.api) continue;
    if (sdks.apis && !sdks.apis.includes(api.id)) continue;
    const spec = specFile(dir, api.id);
    if (!existsSync(spec)) fail(`No spec for ${api.id}. Run \`orbitdocs extract\` first.`);
    for (const lang of wanted) {
      const out = sdkDir(loaded, api.id, lang);
      log.step(`${api.id}: ${LABEL[lang]} → ${relative(dir, out) || '.'}`);
      if (lang === 'typescript') await generateTypescript(loaded, api.id, spec, out);
      else await generateWithOpenapiGenerator(loaded, api.id, lang, spec, out);
      log.ok(`${api.id}: ${LABEL[lang]} (${readdirSync(out).length} entries)`);
    }
  }
  const samples = await writeSdkSamples(loaded);
  log.ok(`${samples} SDK code samples for the reference → .orbitdocs/sdk-samples.json`);
}

function gitRoot(start: string): string {
  let d = start;
  while (d !== dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    d = dirname(d);
  }
  return start;
}

/**
 * `orbitdocs sdk --workflow github|gitlab`: CI that regenerates the SDKs on
 * every push to the default branch and opens a pull/merge request with the
 * changes. Generated code lives apart from yours (TypeScript `src/generated/`,
 * `.openapi-generator-ignore` elsewhere), so your edits survive.
 */
export function writeWorkflow(loaded: LoadedConfig, provider: 'github' | 'gitlab'): string {
  const root = gitRoot(loaded.dir);
  const app = relative(root, loaded.dir) || '.';
  const java = Object.keys(loaded.config.sdks ?? {}).some((k) => k !== 'typescript' && k !== 'apis' && k !== 'samples');
  if (provider === 'github') {
    const file = join(root, '.github', 'workflows', 'orbitdocs-sdks.yml');
    write(
      file,
      `# Regenerates the SDKs when the API changes and opens a pull request (OrbitDocs).
name: SDKs
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  sdks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${java ? `      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
` : ''}      - run: npm ci
      - name: Extract specs and regenerate SDKs
        working-directory: ${app}
        run: npx orbitdocs extract && npx orbitdocs sdk
      - name: Open a pull request
        uses: peter-evans/create-pull-request@v7
        with:
          branch: orbitdocs/sdks
          title: Regenerate SDKs
          commit-message: 'chore(sdk): regenerate from the latest API'
          body: Generated by \`orbitdocs sdk\`. Review the API changes before merging.
`,
      true,
    );
    return file;
  }
  const file = join(root, 'orbitdocs-sdks.gitlab-ci.yml');
  write(
    file,
    `# Regenerates the SDKs when the API changes and opens a merge request (OrbitDocs).
# Include it from .gitlab-ci.yml:  include: { local: orbitdocs-sdks.gitlab-ci.yml }
# Needs a project access token with write_repository in the CI/CD variable SDK_PUSH_TOKEN.
orbitdocs-sdks:
  image: node:22-bookworm
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $CI_PIPELINE_SOURCE == "push"
  script:
${java ? `    - apt-get update -qq && apt-get install -y -qq openjdk-17-jre-headless > /dev/null
` : ''}    - npm ci
    - cd ${app} && npx orbitdocs extract && npx orbitdocs sdk && cd -
    - git config user.name "OrbitDocs" && git config user.email "orbitdocs@\${CI_SERVER_HOST}"
    - git checkout -B orbitdocs/sdks
    - git add -A
    - git diff --cached --quiet && echo "SDKs are up to date" && exit 0
    - git commit -m "chore(sdk): regenerate from the latest API"
    - git push --force "https://oauth2:\${SDK_PUSH_TOKEN}@\${CI_SERVER_HOST}/\${CI_PROJECT_PATH}.git" HEAD:orbitdocs/sdks
      -o merge_request.create -o merge_request.target=$CI_DEFAULT_BRANCH -o merge_request.title="Regenerate SDKs"
`,
    true,
  );
  return file;
}
