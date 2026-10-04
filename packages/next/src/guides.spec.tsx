import { resolveConfig } from '@orbitdocs/core';
import * as DocsUI from 'fumadocs-ui/layouts/docs';
import * as GlassUI from 'fumadocs-ui/layouts/glass';
import * as NotebookUI from 'fumadocs-ui/layouts/notebook';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { OrbitOverrides } from './overrides';

// Fumadocs' Next provider imports next/navigation, which plain Node can't resolve; only its props matter here.
vi.mock('fumadocs-ui/provider/next', () => ({ RootProvider: () => null }));

import { GuidePage, GuidesLayout } from './guides';
import { OrbitRoot } from './root';
import { OrbitSearchDialog } from './search-dialog';
import { DocsLayoutWithoutSidebar, FluxLayoutWithoutSidebar, GlassLayoutWithoutSidebar, NotebookLayoutWithoutSidebar } from './sidebar-off';

const tree = { name: 'Docs', children: [] };
const layout = (l: Record<string, unknown>, overrides?: OrbitOverrides, rest: Record<string, unknown> = {}) =>
  GuidesLayout({ config: resolveConfig({ site: { title: 'Acme' }, layout: l, ...rest }), tree, overrides, children: null }) as ReactElement<Record<string, unknown>>;

describe('GuidesLayout', () => {
  it('uses the Fumadocs layouts while the sidebar is on', () => {
    expect(layout({}).type).toBe(NotebookUI.DocsLayout);
    expect(layout({ type: 'docs' }).type).toBe(DocsUI.DocsLayout);
    expect(layout({ type: 'glass' }).type).toBe(GlassUI.GlassLayout);
  });

  it('hides the sidebar in every layout when sidebar.enabled is false', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notebook = layout({ sidebar: { enabled: false }, navMode: 'auto', tabMode: 'sidebar' });
    expect(notebook.type).toBe(NotebookLayoutWithoutSidebar);
    // The title and tabs move to the navbar.
    expect((notebook.props.nav as { mode: string }).mode).toBe('top');
    expect(notebook.props.tabMode).toBe('navbar');
    expect(layout({ type: 'docs', sidebar: { enabled: false } }).type).toBe(DocsLayoutWithoutSidebar);
    expect(layout({ type: 'flux', sidebar: { enabled: false } }).type).toBe(FluxLayoutWithoutSidebar);
    expect(layout({ type: 'glass', sidebar: { enabled: false } }).type).toBe(GlassLayoutWithoutSidebar);
  });

  it('no longer passes an `enabled` prop Fumadocs ignores', () => {
    expect(layout({}).props.sidebar).not.toHaveProperty('enabled');
  });
});

describe('layouts without a sidebar', () => {
  it('replace the sidebar slots and collapse its column', () => {
    const el = NotebookLayoutWithoutSidebar({ tree } as never) as ReactElement<Record<string, unknown>>;
    expect(el.type).toBe(NotebookUI.DocsLayout);
    const slots = el.props.slots as { sidebar: Record<string, unknown> };
    expect(Object.keys(slots.sidebar).sort()).toEqual(['collapseTrigger', 'provider', 'root', 'trigger', 'useSidebar']);
    expect((el.props.containerProps as { style: Record<string, string> }).style['--fd-sidebar-col']).toBe('0px');
    const flux = FluxLayoutWithoutSidebar({ tree } as never) as ReactElement<Record<string, unknown>>;
    expect((flux.props.sidebar as { enabled: boolean }).enabled).toBe(false);
    const glass = GlassLayoutWithoutSidebar({ tree } as never) as ReactElement<Record<string, unknown>>;
    expect((glass.props.sidebar as { collapsible: boolean }).collapsible).toBe(false);
  });
});

describe('Fumadocs options', () => {
  it('passes the plain ones from the config', () => {
    const el = layout(
      { tabs: [{ title: 'API', url: '/api', icon: 'Code' }] },
      undefined,
      { navigation: { titleUrl: '/start', header: [{ text: 'Blog', url: '/blog', active: 'nested-url' }] } },
    );
    expect((el.props.nav as { url: string }).url).toBe('/start');
    expect(el.props.links).toContainEqual(expect.objectContaining({ text: 'Blog', active: 'nested-url' }));
    const [tab] = el.props.tabs as Array<{ title: string; icon: unknown }>;
    expect(tab!.title).toBe('API');
    expect(tab!.icon).toBeTruthy();
    expect(layout({ tabs: false }).props.tabs).toBe(false);
    expect(layout({})).not.toHaveProperty('props.tabs');
  });

  it('merges React overrides over them', () => {
    const banner = <b>New</b>;
    const el = layout(
      { sidebar: { banner: 'Text banner' } },
      {
        layout: {
          nav: { title: 'Custom' },
          links: [{ type: 'custom', children: <i>v2</i> }],
          sidebar: { banner },
          containerProps: { className: 'mine' },
          tabs: { transform: (t) => ({ ...t, title: `> ${String(t.title)}` }) },
        },
      },
    );
    expect((el.props.nav as { title: unknown; url: string }).title).toBe('Custom');
    expect((el.props.nav as { url: string }).url).toBe('/');
    expect((el.props.links as Array<{ type?: string }>).at(-1)!.type).toBe('custom');
    expect((el.props.sidebar as { banner: unknown }).banner).toBe(banner);
    expect(el.props.containerProps).toEqual({ className: 'mine' });
    // `{ transform }` is resolved on the server (no root folders here, so no tabs).
    expect(el.props.tabs).toEqual([]);
    const replaced = layout({}, { layout: { links: (links) => links.filter((l) => l.type === 'custom') } });
    expect(replaced.props.links).toEqual([]);
  });

  it('gives guide pages the breadcrumb separator option and page overrides', () => {
    const config = resolveConfig({ site: { title: 'Acme' }, layout: { breadcrumb: { includeSeparator: true } } });
    const page = { url: '/a', slugs: ['a'], data: { title: 'A', body: () => null, next: '/b' } };
    const el = GuidePage({
      config,
      page,
      components: {},
      overrides: { page: (p) => ({ footer: { items: { next: { name: 'B', url: String(p.data.next) } } }, tableOfContent: { footer: 'Feedback' } }) },
    }) as ReactElement<Record<string, unknown>>;
    expect(el.props.breadcrumb).toMatchObject({ includeSeparator: true });
    expect(el.props.footer).toEqual({ enabled: true, items: { next: { name: 'B', url: '/b' } } });
    expect(el.props.tableOfContent).toMatchObject({ style: 'clerk', footer: 'Feedback' });
  });

  it('sets up the provider: direction, theme hotkey, search and banner', () => {
    const config = resolveConfig({
      site: { title: 'Acme', dir: 'rtl' },
      theme: { hotKey: false },
      apis: [{ id: 'core', title: 'Core API', source: { file: 'core.json' } }],
      search: { delayMs: 200, tags: true },
      banner: { content: 'Hi', height: '2rem', changeLayout: true },
    });
    const el = OrbitRoot({ config, overrides: { root: { search: { options: { footer: 'Powered by us' } } } }, children: null }) as ReactElement<
      Record<string, unknown> & { children: Array<ReactElement<Record<string, unknown>> | null> }
    >;
    expect(el.props.dir).toBe('rtl');
    expect(el.props.theme).toMatchObject({ hotKey: false });
    expect((el.props.search as { options: unknown }).options).toMatchObject({
      delayMs: 200,
      allowClear: true,
      footer: 'Powered by us',
      tags: [
        { name: 'Guides', value: 'guides' },
        { name: 'Core API', value: 'api:core' },
      ],
    });
    expect(el.props.children[0]!.props).toMatchObject({ height: '2rem', changeLayout: true });
    // Tags and a footer need the dialog that keeps them inside it.
    expect((el.props.search as { SearchDialog: unknown }).SearchDialog).toBe(OrbitSearchDialog);
  });
});
