import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildManifest } from '@vitra-ai/orbitdocs-auth';
import { requiredGroups } from '@vitra-ai/orbitdocs-auth/edge';
import { resolveConfig } from '@vitra-ai/orbitdocs-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isPublicOperation, isPublicPage, pageAccess } from './access';
import { createLlms } from './llms';
import { createOrbitSearch } from './search';

const spec = (title: string, paths: Record<string, string>) => ({
  openapi: '3.1.0',
  info: { title, version: '1.0.0' },
  paths: Object.fromEntries(Object.entries(paths).map(([path, summary]) => [path, { get: { summary, operationId: summary.replace(/\W+/g, ''), responses: { 200: { description: 'OK' } } } }])),
});

const config = (mode: 'public' | 'private' = 'public') =>
  resolveConfig({
    site: { title: 'Acme', url: 'https://docs.acme.com' },
    apis: [
      { id: 'public', source: { file: 'specs/public.json' } },
      { id: 'admin', source: { file: 'specs/admin.json' } },
      { id: 'partner', source: { file: 'specs/partner.json' }, access: ['partners'] },
    ],
    access: {
      mode,
      groups: { staff: { domains: ['acme.com'] }, partners: { emails: ['pat@partner.io'] } },
      rules: [
        { path: '/internal/*', groups: ['staff'] },
        { path: '/changelog', groups: ['*'] },
        { path: '/reference/admin/*', groups: ['staff'] },
        { path: '/reference/public/deleteeverything', groups: ['staff'] },
      ],
      providers: [{ type: 'google', clientId: 'x', clientSecretEnv: 'X' }],
    },
  });

const page = (url: string, title: string, access?: string[]) => ({
  url,
  data: { title, description: `${title} description`, access, getText: async () => `${title} body`, structuredData: { headings: [], contents: [{ heading: undefined, content: `${title} body` }] } },
});

const pages = [
  page('/', 'Home'),
  page('/quickstart', 'Quickstart'),
  page('/internal', 'Internal hub'),
  page('/internal/runbook', 'Incident runbook'),
  page('/secret-plan', 'Secret plan', ['staff']),
  page('/changelog', 'Changelog'),
];
const source = { getPages: () => pages };

let cwd = '';
beforeAll(() => {
  cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'orbit-next-'));
  mkdirSync(join(dir, 'openapi'));
  writeFileSync(join(dir, 'openapi', 'public.json'), JSON.stringify(spec('Public API', { '/pets': 'List pets', '/everything': 'Delete everything' })));
  writeFileSync(join(dir, 'openapi', 'admin.json'), JSON.stringify(spec('Admin API', { '/users': 'Delete user' })));
  writeFileSync(join(dir, 'openapi', 'partner.json'), JSON.stringify(spec('Partner API', { '/deals': 'List deals' })));
  process.chdir(dir);
});
afterAll(() => process.chdir(cwd));

describe('effective page access', () => {
  it('applies the config rule and the frontmatter together, like the access manifest', () => {
    const c = config();
    expect(pageAccess(c, '/internal/runbook')).toEqual([['staff']]);
    expect(pageAccess(c, '/internal')).toEqual([['staff']]);
    expect(pageAccess(c, '/secret-plan', ['staff'])).toEqual([['staff']]);
    expect(pageAccess(c, '/quickstart')).toBeNull();
    // Same answer as the server's manifest for every page.
    const manifest = buildManifest(c, [{ url: '/secret-plan', slugs: ['secret-plan'], groups: ['staff'] }])!;
    for (const p of pages) expect(pageAccess(c, p.url, p.data.access), p.url).toEqual(requiredGroups(manifest, p.url));
  });

  it('stricter wins: a `*` rule keeps `[staff]` frontmatter staff-only, and `*` frontmatter under a `[staff]` rule too', () => {
    const c = config();
    expect(pageAccess(c, '/changelog', ['staff'])).toEqual([['staff']]);
    expect(pageAccess(c, '/internal/faq', ['*'])).toEqual([['staff']]);
    expect(isPublicPage(config('private'), '/changelog', ['staff'])).toBe(false);
    // apis[].access is not loosened by a rule either.
    expect(pageAccess(c, '/reference/partner/listdeals/')).toEqual([['partners']]);
  });

  it('keeps restricted pages out of public files; private mode keeps pages open to any signed-in reader', () => {
    expect(isPublicPage(config(), '/internal/runbook')).toBe(false);
    expect(isPublicPage(config(), '/changelog')).toBe(false);
    expect(isPublicPage(config(), '/quickstart')).toBe(true);
    expect(isPublicPage(config('private'), '/changelog')).toBe(true);
    expect(isPublicPage(config('private'), '/internal/runbook')).toBe(false);
    expect(isPublicOperation(config(), 'admin', '/reference/admin/deleteuser/')).toBe(false);
    expect(isPublicOperation(config(), 'partner', '/reference/partner/listdeals/')).toBe(false);
    expect(isPublicOperation(config(), 'public', '/reference/public/listpets/')).toBe(true);
  });
});

describe('llms.txt and llms-full.txt', () => {
  it('leave out pages and operations restricted by config rules or frontmatter', async () => {
    const llms = createLlms(config(), source);
    for (const text of [await llms.index(), await llms.full()]) {
      expect(text).toContain('Quickstart');
      expect(text).toContain('List pets');
      for (const hidden of ['Incident runbook', 'Internal hub', 'Secret plan', 'Changelog', 'Delete user', 'Admin API', 'Partner API', 'List deals', 'Delete everything']) {
        expect(text).not.toContain(hidden);
      }
    }
  });
});

describe('search index', () => {
  it('leaves out pages and operations restricted by config rules or frontmatter', async () => {
    const search = createOrbitSearch(config(), source);
    const res = await search.staticGET();
    const index = JSON.stringify(await res.json());
    expect(index).toContain('Quickstart');
    expect(index).toContain('List pets');
    for (const hidden of ['Incident runbook', 'Internal hub', 'Secret plan', 'Changelog', 'Delete user', 'List deals', 'Delete everything']) {
      expect(index).not.toContain(hidden);
    }
  });
});
