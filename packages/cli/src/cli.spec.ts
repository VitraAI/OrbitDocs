import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveConfig } from '@orbitdocs/core';
import { describe, expect, it } from 'vitest';

import { guideFiles, writeAccessManifest, writeAccessVariants } from './commands/access';
import { refreshManifests } from './commands/build';
import { publishReport } from './commands/publish';
import { check, references } from './commands/check';
import { watchTarget } from './commands/dev';
import { detectNest, init } from './commands/init';

const tmp = () => mkdtempSync(join(tmpdir(), 'orbitdocs-'));

describe('detectNest', () => {
  it('reads prefix and versioning from main.ts', () => {
    const root = tmp();
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@acme/billing-api' }));
    writeFileSync(join(root, 'nest-cli.json'), JSON.stringify({ sourceRoot: 'src' }));
    writeFileSync(
      join(root, 'src/main.ts'),
      "app.setGlobalPrefix('api');\napp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'v' });",
    );
    const n = detectNest(root);
    expect(n).toMatchObject({ name: '@acme/billing-api', isNest: true, build: 'nest build', prefix: 'api' });
    expect(n.versioning).toEqual({ type: 'uri', prefix: 'v', defaultVersion: '1' });
  });

  it('handles a folder without Nest', () => {
    expect(detectNest(tmp())).toMatchObject({ isNest: false, prefix: undefined, versioning: undefined, swaggerOperations: 0 });
  });

  it('counts @ApiOperation decorators', () => {
    const root = tmp();
    mkdirSync(join(root, 'src/bookings'), { recursive: true });
    writeFileSync(join(root, 'src/main.ts'), '');
    writeFileSync(join(root, 'src/bookings/bookings.controller.ts'), "@ApiOperation({ summary: 'A' })\n@ApiOperation({ summary: 'B' })");
    expect(detectNest(root).swaggerOperations).toBe(2);
  });
});

describe('init', () => {
  const nestApp = () => {
    const root = tmp();
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'travel-api' }));
    writeFileSync(join(root, 'nest-cli.json'), JSON.stringify({ sourceRoot: 'src' }));
    writeFileSync(join(root, 'src/main.ts'), '');
    return root;
  };

  it('documents marked routes only by default', () => {
    const root = nestApp();
    init(root);
    expect(readFileSync(join(root, 'docs/orbitdocs.config.ts'), 'utf8')).not.toContain('routes:');
  });

  it("writes routes: 'all' for Swagger-only projects", () => {
    const root = nestApp();
    init(root, { routes: 'all' });
    expect(readFileSync(join(root, 'docs/orbitdocs.config.ts'), 'utf8')).toContain("routes: 'all'");
  });
});

describe('check', () => {
  const setup = (mdx: string) => {
    const dir = tmp();
    mkdirSync(join(dir, 'openapi'));
    mkdirSync(join(dir, 'content'));
    writeFileSync(
      join(dir, 'openapi/demo.json'),
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Demo', version: '1' },
        paths: { '/a': { get: { operationId: 'list-things', responses: { '200': { description: 'OK' } } } } },
      }),
    );
    writeFileSync(join(dir, 'content/index.mdx'), mdx);
    const config = resolveConfig({ site: { title: 'x' }, apis: [{ id: 'demo', source: { file: 'x.json' } }] });
    return { config, dir, file: join(dir, 'orbitdocs.config.ts') };
  };

  it('accepts valid op: links and Endpoints', async () => {
    expect(await check(setup('[x](op:demo/list-things) <Endpoint api="demo" op="list-things" />'))).toEqual([]);
  });

  it('ignores links inside code', async () => {
    expect(await check(setup('```md\n[x](op:demo/missing)\n```\nand `[y](op:demo/gone)`'))).toEqual([]);
  });

  it('reports broken references', async () => {
    const problems = await check(setup('[x](op:demo/missing) <Endpoint api="nope" op="list-things" />'));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('op:demo/missing');
  });

  it('flags guide folders on reserved paths', async () => {
    const loaded = setup('');
    mkdirSync(join(loaded.dir, 'content/reference'));
    const problems = await check(loaded);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/reference is reserved');
  });

  it('checks reference content files', async () => {
    const loaded = setup('');
    mkdirSync(join(loaded.dir, 'reference/demo/_groups'), { recursive: true });
    writeFileSync(join(loaded.dir, 'reference/demo/index.mdx'), '');
    writeFileSync(join(loaded.dir, 'reference/demo/_groups/things.mdx'), '');
    writeFileSync(join(loaded.dir, 'reference/demo/list-things.mdx'), '');
    expect(await check(loaded)).toEqual([]);
    writeFileSync(join(loaded.dir, 'reference/demo/renamed-op.mdx'), '');
    expect((await check(loaded)).join()).toContain('no operation "renamed-op"');
  });

  it('reads <Endpoint> attributes in any order, quoted either way', () => {
    expect(references(`<Endpoint op="a-op" api="demo" />\n<Endpoint api='demo' op='b-op'/>\n<Endpoint\n  op={"c-op"}\n  api="demo"\n/>`)).toEqual([
      { kind: 'endpoint', api: 'demo', op: 'a-op' },
      { kind: 'endpoint', api: 'demo', op: 'b-op' },
      { kind: 'endpoint', api: 'demo', op: 'c-op' },
    ]);
    // Expressions can't be checked statically.
    expect(references('<Endpoint api={api} op="x" />')).toEqual([]);
    // Mentions in prose or attribute strings.
    expect(references('<Card description="op: links and <Endpoint>." />')).toEqual([]);
  });

  it('reports a broken <Endpoint> whatever its attribute order', async () => {
    const problems = await check(setup(`<Endpoint op='list-things' api='demo' />\n<Endpoint op="gone" api="demo" />\n<Endpoint api="demo" />`));
    expect(problems).toEqual([
      'content/index.mdx: <Endpoint api="demo" op="gone"> does not exist',
      'content/index.mdx: <Endpoint api="demo" op=""> does not exist',
    ]);
  });

  it('checks op: links and Endpoints inside reference content', async () => {
    const loaded = setup('');
    mkdirSync(join(loaded.dir, 'reference/demo/_groups'), { recursive: true });
    writeFileSync(join(loaded.dir, 'reference/demo/index.mdx'), 'See [x](op:demo/list-things).');
    writeFileSync(join(loaded.dir, 'reference/demo/list-things.mdx'), 'Next: [y](op:demo/missing) and <Endpoint op="nope" api="demo" />');
    writeFileSync(join(loaded.dir, 'reference/demo/_groups/things.mdx'), '`[ignored](op:demo/missing)` [z](op:other)');
    expect((await check(loaded)).sort()).toEqual([
      'reference/demo/list-things.mdx: link op:demo/missing does not exist',
      'reference/demo/list-things.mdx: <Endpoint api="demo" op="nope"> does not exist',
      'reference/demo/_groups/things.mdx: link op:other does not exist',
    ].sort());
  });

  it('reports a missing spec', async () => {
    const loaded = setup('');
    loaded.config.apis.push({ ...loaded.config.apis[0]!, id: 'other' });
    expect((await check(loaded)).join()).toContain('other: no spec');
  });
});

describe('dev watch target', () => {
  const project = (nestCli?: object, dirs: string[] = []) => {
    const root = tmp();
    if (nestCli) writeFileSync(join(root, 'nest-cli.json'), JSON.stringify(nestCli));
    for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
    mkdirSync(join(root, 'docs'));
    return { root, docs: join(root, 'docs') };
  };

  it('watches nest-cli.json sourceRoot', () => {
    const { root, docs } = project({ sourceRoot: 'apps/api/src' }, ['apps/api/src']);
    expect(watchTarget({ root: '..', build: 'nest build', module: 'dist/app.module.js' }, docs).path).toBe(join(root, 'apps/api/src'));
  });

  it('defaults to src', () => {
    const { root, docs } = project(undefined, ['src']);
    expect(watchTarget({ root: '..', build: 'tsc', module: 'dist/app.module.js' }, docs).path).toBe(join(root, 'src'));
  });

  it('falls back to the project root, ignoring build output and the docs app', () => {
    const { root, docs } = project({ sourceRoot: 'lib' });
    const t = watchTarget({ root: '..', build: 'tsc', module: 'dist/app.module.js' }, docs);
    expect(t.path).toBe(root);
    expect(t.ignored(join(root, 'dist/app.module.js'))).toBe(true);
    expect(t.ignored(join(docs, '.next/x.js'))).toBe(true);
    expect(t.ignored(join(root, 'node_modules/a/b.js'))).toBe(true);
    expect(t.ignored(join(root, 'app.module.ts'))).toBe(false);
  });

  it('watches the compiled module folder without a build', () => {
    const { root, docs } = project({ sourceRoot: 'src' }, ['src']);
    expect(watchTarget({ root: '..', module: 'dist/app.module.js' }, docs).path).toBe(join(root, 'dist'));
  });
});

describe('build --skip-extract', () => {
  it('rewrites the access manifest from the current guides', async () => {
    const dir = tmp();
    mkdirSync(join(dir, 'content'));
    writeFileSync(join(dir, 'content/partners.mdx'), '---\ntitle: Partners\naccess: [partners]\n---\nHi');
    const config = resolveConfig({ site: { title: 'x' }, access: { appSession: { type: 'supabase', loginUrl: 'https://app.test/login', projectUrl: 'https://p.supabase.co' }, groups: { partners: { emails: ['a@b.c'] } } } });
    expect(await refreshManifests({ config, dir, file: join(dir, 'orbitdocs.config.ts') })).toEqual([]);
    const manifest = readFileSync(join(dir, '.orbitdocs/access.json'), 'utf8');
    expect(manifest).toContain('/partners');
    expect(readFileSync(join(dir, '.orbitdocs/ai.json'), 'utf8')).toBe('null\n');

    // A page restricted to a group the config doesn't define is a problem, as in extract.
    writeFileSync(join(dir, 'content/secret.mdx'), '---\naccess: [staff]\n---\nHi');
    expect(await refreshManifests({ config, dir, file: join(dir, 'orbitdocs.config.ts') })).toEqual(['content/secret: unknown access group "staff"']);
    expect(readFileSync(join(dir, '.orbitdocs/access.json'), 'utf8')).toContain('/secret');
  });
});


describe('reader-dependent files', () => {
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Pets', version: '1' },
    tags: [{ name: 'Pets' }, { name: 'Admin', description: 'Staff tools.' }],
    paths: {
      '/pets': { get: { operationId: 'listPets', summary: 'List pets', tags: ['Pets'], responses: { 200: { description: 'OK' } } } },
      '/users': { delete: { operationId: 'deleteUser', summary: 'Delete user', tags: ['Admin'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Purge' } } } }, responses: { 204: { description: 'Gone' } } } },
    },
    components: { schemas: { Purge: { type: 'object' } } },
  };
  const app = (routes: string[]) => {
    const dir = tmp();
    for (const d of ['content/internal', 'content/(extra)', 'openapi', ...routes.map((r) => `app/${r}`)]) mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, 'content/index.mdx'), '---\ntitle: Home\nlayout: landing\n---\nHi');
    writeFileSync(join(dir, 'content/quickstart.mdx'), '---\ntitle: Quickstart\n---\nHi');
    writeFileSync(join(dir, 'content/internal/runbook.mdx'), '---\ntitle: Runbook\naccess: [staff]\n---\nHi');
    writeFileSync(join(dir, 'content/(extra)/faq.mdx'), '---\ntitle: FAQ\naccess: [staff]\n---\nHi');
    writeFileSync(join(dir, 'openapi/pets.json'), JSON.stringify(spec));
    const config = resolveConfig({
      site: { title: 'x' },
      apis: [{ id: 'pets', source: { file: 'specs/pets.json' } }],
      access: {
        groups: { staff: { domains: ['acme.com'] } },
        rules: [{ path: '/reference/pets/deleteuser', groups: ['staff'] }],
        appSession: { type: 'supabase', loginUrl: 'https://app.test/login', projectUrl: 'https://p.supabase.co' },
      },
    });
    return { config, dir, file: join(dir, 'orbitdocs.config.ts') };
  };

  it('reads guide URLs like Fumadocs: no index, no (group) folders', () => {
    const { dir } = app([]);
    expect(guideFiles(join(dir, 'content')).map((g) => `${g.url}${g.landing ? ' (landing)' : ''}`).sort()).toEqual(['/ (landing)', '/faq', '/internal/runbook', '/quickstart']);
  });

  it('plans variants, and the public spec download leaves out what some readers may not open', async () => {
    const loaded = app(['~/[variant]', 'client/[[...variant]]']);
    expect(writeAccessManifest(loaded)).toEqual([]);
    await writeAccessVariants(loaded);
    const manifest = JSON.parse(readFileSync(join(loaded.dir, '.orbitdocs/access.json'), 'utf8'));
    expect(manifest.variants.map((v: { scope: string; options: Array<{ key: string; requires: string[][] }> }) => `${v.scope}:${v.options.map((o) => `${o.key}=${JSON.stringify(o.requires)}`)}`)).toEqual([
      'guides:g1=[["staff"]]',
      'api:pets:v1=[["staff"]]',
      'client:c1=[["staff"]]',
    ]);
    // The landing home page has no sidebar: it is not served from a variant.
    expect(manifest.variants[0].routes[0].paths.sort()).toEqual(['/faq', '/internal/runbook', '/quickstart']);
    const pub = JSON.parse(readFileSync(join(loaded.dir, 'public/openapi/pets.json'), 'utf8'));
    expect(Object.keys(pub.paths)).toEqual(['/pets']);
    expect(pub.components.schemas).toEqual({});
    expect(pub.tags.map((t: { name: string }) => t.name)).toEqual(['Pets']);
    const staff = JSON.parse(readFileSync(join(loaded.dir, 'public/openapi/pets~v1.json'), 'utf8'));
    expect(Object.keys(staff.paths)).toEqual(['/pets', '/users']);
  });

  it('skips sidebar and client variants an older app has no route for, and cleans up old copies', async () => {
    const loaded = app([]);
    writeAccessManifest(loaded);
    mkdirSync(join(loaded.dir, 'public/openapi'), { recursive: true });
    writeFileSync(join(loaded.dir, 'public/openapi/pets~v9.json'), '{}');
    await writeAccessVariants(loaded);
    const manifest = JSON.parse(readFileSync(join(loaded.dir, '.orbitdocs/access.json'), 'utf8'));
    expect(manifest.variants.map((v: { scope: string }) => v.scope)).toEqual(['api:pets']);
    expect(readdirSync(join(loaded.dir, 'public/openapi')).sort()).toEqual(['pets.json', 'pets~v1.json']);
  });

  it('copies the full spec without private docs', async () => {
    const loaded = app([]);
    const config = resolveConfig({ site: { title: 'x' }, apis: [{ id: 'pets', source: { file: 'specs/pets.json' } }] });
    writeFileSync(join(loaded.dir, 'content/internal/runbook.mdx'), '---\ntitle: Runbook\n---\nHi');
    writeFileSync(join(loaded.dir, 'content/(extra)/faq.mdx'), '---\ntitle: FAQ\n---\nHi');
    writeAccessManifest({ ...loaded, config });
    await writeAccessVariants({ ...loaded, config });
    expect(JSON.parse(readFileSync(join(loaded.dir, 'public/openapi/pets.json'), 'utf8'))).toEqual(spec);
    expect(existsSync(join(loaded.dir, 'public/openapi/pets~v1.json'))).toBe(false);
  });
});

describe('publish report', () => {
  it('prints lint per spec for previews', () => {
    const lines = publishReport({ url: 'https://p.test/preview/mr-42/', lint: [{ apiId: 'travel', errors: 0, warnings: 2 }, { apiId: 'billing', errors: 1, warnings: 1 }] }, 'mr-42');
    expect(lines).toEqual([
      { level: 'ok', text: 'travel: 0 lint errors, 2 warnings' },
      { level: 'warn', text: 'billing: 1 lint error, 1 warning' },
      { level: 'ok', text: 'Preview mr-42: https://p.test/preview/mr-42/' },
    ]);
  });

  it('prints registry versions without repeating lint, and stays compatible with older platforms', () => {
    const versions = [{ apiId: 'travel', revision: 3, version: '1.2.0', created: true, errors: 0, warnings: 2 }];
    expect(publishReport({ url: 'u', versions, lint: [{ apiId: 'travel', errors: 0, warnings: 2 }] }).map((l) => l.text)).toEqual([
      'travel: registry revision 3 · v1.2.0',
      'travel: 0 lint errors, 2 warnings',
      'Published: u',
    ]);
    expect(publishReport({ url: 'u', versions })[0]!.text).toBe('travel: registry revision 3 · v1.2.0 · 0 lint errors, 2 warnings');
  });

  it('warns about site variables the project has not set', () => {
    const lines = publishReport({ url: 'u', missingEnv: [{ key: 'OPENAI_API_KEY', usedBy: 'Ask AI (openai API key)' }] });
    expect(lines[0]).toEqual({ level: 'warn', text: 'OPENAI_API_KEY is not set (Ask AI (openai API key)): add it in the dashboard under Settings → Environment' });
  });
});
