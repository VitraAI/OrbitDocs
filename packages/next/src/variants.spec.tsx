import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AccessManifest, buildManifest, planVariants, requiredGroups } from '@orbitdocs/auth';
import { DEFAULT_SEND_DISABLED_MESSAGE, resolveConfig } from '@orbitdocs/core';
import type { ReactElement } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClientPage } from './client-page';
import { orbitLayoutOptions, readableApis } from './layout';
import { filterTree, guidesTree, guideVariantParams, isGuideVariantPage } from './guide-tree';
import { ReferencePage, referenceSamples, referenceSamplesParams, referenceSections, referenceStaticParams } from './reference';
import { clientStaticParams } from './variants';

const spec = {
  openapi: '3.1.0',
  info: { title: 'Public API', version: '1.0.0' },
  tags: [{ name: 'Pets' }, { name: 'Admin', description: 'Staff tools.' }],
  paths: {
    '/pets': { get: { operationId: 'listPets', summary: 'List pets', tags: ['Pets'], responses: { 200: { description: 'OK' } } } },
    '/users/{id}': {
      delete: {
        operationId: 'deleteUser',
        summary: 'Delete user',
        tags: ['Admin'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Purge' } } } },
        responses: { 204: { description: 'Gone' } },
      },
    },
  },
  components: { schemas: { Purge: { type: 'object', description: 'Why the user goes.', properties: { reason: { type: 'string' } } } } },
};

const config = resolveConfig({
  site: { title: 'Acme' },
  apis: [{ id: 'public', source: { file: 'specs/public.json' } }],
  access: {
    groups: { staff: { domains: ['acme.com'] } },
    rules: [
      { path: '/reference/public/deleteuser', groups: ['staff'] },
      { path: '/internal/*', groups: ['staff'] },
      // An API only staff may open (no spec needed: only the top bar looks at it).
      { path: '/reference/admin/*', groups: ['staff'] },
    ],
    providers: [{ type: 'google', clientId: 'x', clientSecretEnv: 'X' }],
  },
});

/** What `orbitdocs build` writes for this config (see the CLI's writeAccessVariants). */
function manifest(): AccessManifest {
  const m = buildManifest(config, [{ url: '/secret', slugs: ['secret'], groups: ['staff'] }])!;
  const at = (p: string) => requiredGroups(m, p);
  const guides = planVariants(null, ['/', '/quickstart', '/secret', '/internal/runbook'].map((u) => ({ id: u, requires: at(u) })), 'g');
  const api = planVariants(at('/reference/public'), ['listpets', 'deleteuser'].map((s) => ({ id: s, requires: at(`/reference/public/${s}`) })), 'v');
  return {
    ...m,
    variants: [
      { scope: 'guides', options: guides.options, routes: [{ from: '', to: '/~/{key}', paths: ['/', '/quickstart', '/secret', '/internal/runbook'] }] },
      {
        scope: 'api:public',
        options: api.options,
        routes: [
          { from: '/reference/public', to: '/reference/public~{key}' },
          { from: '/reference-samples/public.json', to: '/reference-samples/public~{key}.json' },
        ],
      },
      { scope: 'client', options: api.options.map((o) => ({ ...o, key: 'c1' })), routes: [{ from: '/client', to: '/client/{key}', paths: ['/client'] }] },
    ],
  };
}

let cwd = '';
beforeAll(() => {
  cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'orbit-variants-'));
  mkdirSync(join(dir, 'openapi'));
  mkdirSync(join(dir, '.orbitdocs'));
  writeFileSync(join(dir, 'openapi', 'public.json'), JSON.stringify(spec));
  writeFileSync(join(dir, '.orbitdocs', 'access.json'), JSON.stringify(manifest()));
  process.chdir(dir);
});
afterAll(() => process.chdir(cwd));

const page = (url: string, name: string) => ({ type: 'page' as const, url, name });
const tree = {
  $id: 'root',
  name: 'Docs',
  children: [
    page('/', 'Home'),
    page('/quickstart', 'Quickstart'),
    page('/secret', 'Secret plan'),
    page('https://status.acme.com', 'Status'),
    { type: 'separator' as const, name: 'Staff' },
    { type: 'folder' as const, name: 'Internal', children: [page('/internal/runbook', 'Incident runbook')] },
  ],
};
const names = (t: { children: Array<{ name?: unknown; children?: unknown }> }): string[] =>
  t.children.flatMap((n) => [String(n.name), ...(n.children ? names(n as { children: Array<{ name?: unknown }> }) : [])]);

describe('guides sidebar', () => {
  it('canonical pages list only what every reader may open', () => {
    expect(names(guidesTree(tree))).toEqual(['Home', 'Quickstart', 'Status']);
  });

  it('a variant lists what its readers may open', () => {
    expect(names(guidesTree(tree, 'g1'))).toEqual(['Home', 'Quickstart', 'Secret plan', 'Status', 'Staff', 'Internal', 'Incident runbook']);
    // An unknown variant shows no more than the canonical pages.
    expect(names(guidesTree(tree, 'nope'))).toEqual(['Home', 'Quickstart', 'Status']);
  });

  it('drops empty folders and separators with nothing under them', () => {
    expect(names(filterTree(tree, (url) => url === '/'))).toEqual(['Home', 'Status']);
  });

  it('builds a variant page only for pages its readers may open', () => {
    const source = { getPages: () => ['/', '/quickstart', '/secret'].map((url) => ({ url, slugs: url.split('/').filter(Boolean), data: {} })) };
    expect(guideVariantParams(source)).toEqual([
      { variant: 'g1', slug: [] },
      { variant: 'g1', slug: ['quickstart'] },
      { variant: 'g1', slug: ['secret'] },
    ]);
    expect(isGuideVariantPage('g1', { url: '/secret', data: {} })).toBe(true);
    expect(isGuideVariantPage('g2', { url: '/secret', data: {} })).toBe(false);
  });
});

describe('a partially restricted API', () => {
  it('has a reader variant of its reference pages and samples', async () => {
    const params = await referenceStaticParams(config);
    expect(params.filter((p) => p.api === 'public').map((p) => p.slug?.join('/'))).toEqual(['', 'listpets', 'deleteuser', 'models']);
    expect(params.filter((p) => p.api === 'public~v1').map((p) => p.slug?.join('/'))).toEqual(['', 'listpets', 'deleteuser', 'models']);
    expect(referenceSamplesParams(config)).toEqual([{ file: 'public.json' }, { file: 'public~v1.json' }]);
  });

  it('leaves the restricted operation out of the canonical samples and sections', async () => {
    const samples = JSON.stringify(await (await referenceSamples(config, 'public.json')).json());
    expect(samples).toContain('listpets');
    expect(samples).not.toContain('deleteuser');
    const full = JSON.stringify(await (await referenceSamples(config, 'public~v1.json')).json());
    expect(full).toContain('deleteuser');

    expect((await referenceSections(config, { api: 'public', file: 'tag-admin.json' })).status).toBe(404);
    const models = JSON.stringify(await (await referenceSections(config, { api: 'public', file: 'models.json' })).json());
    expect(models).not.toContain('Purge');
    const staffModels = JSON.stringify(await (await referenceSections(config, { api: 'public~v1', file: 'models.json' })).json());
    expect(staffModels).toContain('Purge');
    expect((await referenceSections(config, { api: 'public~v9', file: 'models.json' })).status).toBe(404);
  });

  it('the client holds only operations its reader may open', async () => {
    expect(clientStaticParams()).toEqual([{ variant: [] }, { variant: ['c1'] }]);
    const seeds = async (variant?: string) => {
      const el = (await ClientPage({ config, variant })) as ReactElement<{ children: ReactElement<{ seeds: unknown }> }>;
      return JSON.stringify(el.props.children.props.seeds);
    };
    expect(await seeds()).toContain('List pets');
    expect(await seeds()).not.toContain('Delete user');
    expect(await seeds('c1')).toContain('Delete user');
  });

  it('turns sending off for an API with `send: false`, in the client and the reference', async () => {
    writeFileSync(join('openapi', 'quiet.json'), JSON.stringify(spec));
    const quiet = { ...config, apis: [...config.apis, { ...config.apis[0]!, id: 'quiet', send: false }] };
    const el = (await ClientPage({ config: quiet })) as ReactElement<{ children: ReactElement<{ seeds: Array<{ collection: { id: string; sendDisabled?: string } }> }> }>;
    const collections = el.props.children.props.seeds.map((s) => s.collection);
    expect(collections.find((c) => c.id === 'api:public')?.sendDisabled).toBeUndefined();
    expect(collections.find((c) => c.id === 'api:quiet')?.sendDisabled).toBe(DEFAULT_SEND_DISABLED_MESSAGE);

    const reference = (params: { api: string }) => ReferencePage({ config: quiet, params }) as Promise<ReactElement<{ sendDisabled?: string }>>;
    expect((await reference({ api: 'quiet' })).props.sendDisabled).toBe(DEFAULT_SEND_DISABLED_MESSAGE);
    expect((await reference({ api: 'public' })).props.sendDisabled).toBeUndefined();
  });
});

describe('the top bar', () => {
  const withAdmin = { ...config, apis: [...config.apis, { ...config.apis[0]!, id: 'admin', title: 'Admin API' }] };
  const apiMenu = (readerOf?: string) => JSON.stringify(orbitLayoutOptions(withAdmin, { readerOf }).links);

  it('lists only the APIs every reader may open on shared pages', () => {
    expect(readableApis(withAdmin).map((a) => a.id)).toEqual(['public']);
    expect(apiMenu()).toContain('/reference/public');
    expect(apiMenu()).not.toContain('/reference/admin');
  });

  it("lists more where the page's readers may open more", () => {
    expect(readableApis(withAdmin, '/~/g1').map((a) => a.id)).toEqual(['public', 'admin']);
    expect(apiMenu('/reference/admin')).toContain('Admin API');
    expect(apiMenu('/~/nope')).not.toContain('Admin API');
  });
});
