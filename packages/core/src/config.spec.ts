import { describe, expect, it } from 'vitest';

import { ConfigError, layoutWarnings, resolveConfig } from './config';

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const c = resolveConfig({ site: { title: 'Acme' } });
    expect(c.apis).toEqual([]);
    expect(c.output).toEqual({ mode: 'static', basePath: '' });
    expect(c.theme.defaultMode).toBe('system');
  });

  it('defaults the Fumadocs options whether or not their section is written', () => {
    for (const c of [
      resolveConfig({ site: { title: 'Acme' } }),
      resolveConfig({ site: { title: 'Acme' }, theme: {}, navigation: {}, search: {}, layout: { breadcrumb: {} } }),
    ]) {
      expect(c.site.dir).toBe('ltr');
      expect(c.theme.hotKey).toBe('d');
      expect(c.navigation.titleUrl).toBe('/');
      expect(c.search).toMatchObject({ tags: false, allowClear: true });
      expect(c.layout.breadcrumb.includeSeparator).toBe(false);
      expect(c.codeBlocks).toEqual({});
    }
    const banner = resolveConfig({ site: { title: 'Acme' }, banner: { content: 'Hi' } }).banner!;
    expect(banner).toMatchObject({ height: '3rem', changeLayout: true });
  });

  it('defaults a Nest source', () => {
    const c = resolveConfig({
      site: { title: 'Acme' },
      apis: [{ id: 'core', source: { nest: { module: 'dist/app.module.js' } } }],
    });
    const source = c.apis[0]!.source;
    expect(source).toEqual({ nest: { module: 'dist/app.module.js', export: 'AppModule', routes: 'opt-in', root: '..', env: {} } });
    expect(c.apis[0]!.completeness).toBe('warn');
  });

  it('lists every problem', () => {
    try {
      resolveConfig({ site: {}, apis: [{ id: 'Bad Id', source: {} }] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const issues = (e as ConfigError).issues.join('\n');
      expect(issues).toContain('site.title');
      expect(issues).toContain('apis.0.id');
    }
  });

  it('rejects duplicate api ids', () => {
    const api = { id: 'a', source: { file: 'a.json' } };
    expect(() => resolveConfig({ site: { title: 'x' }, apis: [api, api] })).toThrow(/duplicate id a/);
  });

  it('validates basePath', () => {
    expect(() => resolveConfig({ site: { title: 'x' }, output: { basePath: 'docs/' } })).toThrow(ConfigError);
    expect(resolveConfig({ site: { title: 'x' }, output: { basePath: '/docs' } }).output.basePath).toBe('/docs');
  });
});

describe('layoutWarnings', () => {
  const layout = (l: Record<string, unknown>) => resolveConfig({ site: { title: 'x' }, layout: l });
  it('is quiet for the defaults and for notebook without a sidebar', () => {
    expect(layoutWarnings(layout({}))).toEqual([]);
    expect(layoutWarnings(layout({ sidebar: { enabled: false } }))).toEqual([]);
  });
  it('explains what a hidden sidebar takes with it', () => {
    expect(layoutWarnings(layout({ type: 'docs', sidebar: { enabled: false } }))[0]).toContain("layout.type 'docs'");
    expect(layoutWarnings(layout({ type: 'flux', sidebar: { enabled: false } }))[0]).toContain('flux');
    expect(layoutWarnings(layout({ sidebar: { enabled: false }, navMode: 'auto', tabMode: 'sidebar' }))).toHaveLength(2);
  });
  it('names glass options that cannot apply', () => {
    expect(layoutWarnings(layout({ type: 'glass' }))).toEqual([]);
    expect(layoutWarnings(layout({ type: 'glass', toc: { style: 'normal', single: true }, footer: false }))[0]).toBe(
      "layout.type 'glass' draws its own table of contents, breadcrumb and page footer; toc.style 'normal', toc.single, footer: false are ignored.",
    );
  });
});
