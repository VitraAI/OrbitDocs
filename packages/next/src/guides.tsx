import { layoutWarnings, type OrbitDocsConfig } from '@vitra-ai/orbitdocs-core';
import * as DocsUI from 'fumadocs-ui/layouts/docs';
import * as DocsPageUI from 'fumadocs-ui/layouts/docs/page';
import * as FluxUI from 'fumadocs-ui/layouts/flux';
import * as FluxPageUI from 'fumadocs-ui/layouts/flux/page';
import * as GlassUI from 'fumadocs-ui/layouts/glass';
import * as GlassPageUI from 'fumadocs-ui/layouts/glass/page';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import * as NotebookUI from 'fumadocs-ui/layouts/notebook';
import { getLayoutTabs, type LayoutTab } from 'fumadocs-ui/layouts/shared';
import * as NotebookPageUI from 'fumadocs-ui/layouts/notebook/page';
import type { ComponentType, ReactNode } from 'react';

import { LandingLayout, LandingPage } from './landing';
import { namedIcon, orbitLayoutOptions } from './layout';
import type { GuidePageInfo, GuidePageOverrides, OrbitOverrides } from './overrides';
import { PageActions } from './page-actions';
import { DocsLayoutWithoutSidebar, FluxLayoutWithoutSidebar, GlassLayoutWithoutSidebar, NotebookLayoutWithoutSidebar } from './sidebar-off';
import { readerMayOpen } from './variants';

type Tree = Parameters<typeof DocsUI.DocsLayout>[0]['tree'];

function SidebarFooter({ config }: { config: OrbitDocsConfig }) {
  if (!config.navigation.sidebar.length) return null;
  return (
    <div className="od-sidebar-links">
      {config.navigation.sidebar.map((l) => (
        <a key={l.url} href={l.url} target={/^https?:/.test(l.url) ? '_blank' : undefined} rel="noreferrer">
          {namedIcon(l.icon)}
          {l.text}
        </a>
      ))}
    </div>
  );
}

let warned = false;
/** Logs layout options the chosen layout can't honour, once per server. */
function warnLayout(config: OrbitDocsConfig) {
  if (warned) return;
  warned = true;
  for (const w of layoutWarnings(config)) console.warn(`[orbitdocs] ${w}`);
}

/**
 * Layout tabs: `overrides.layout.tabs`, else `layout.tabs`, else Fumadocs'
 * default (one per root folder; undefined). Listed tabs keep only pages the
 * layout's readers may open. `{ transform }` is applied here, on the server:
 * flux and glass are client components, which can't receive a function.
 */
function layoutTabs(config: OrbitDocsConfig, tree: Tree, overrides: OrbitOverrides | undefined, readerOf: string | undefined): LayoutTab[] | false | undefined {
  const tabs = overrides?.layout?.tabs ?? config.layout.tabs;
  if (tabs === undefined || tabs === false) return tabs;
  if (!Array.isArray(tabs)) return getLayoutTabs(tree, tabs);
  const may = readerMayOpen(readerOf);
  return tabs
    .filter((t) => may(t.url))
    .map((t) => (typeof t.icon === 'string' ? { ...t, icon: namedIcon(t.icon) } : (t as LayoutTab)));
}

/**
 * The guides layout, chosen by `layout.type`: notebook (default), docs, flux,
 * glass or home. Every option in `layout` maps to the Fumadocs prop of the
 * same meaning; `overrides.layout` (React: sidebar banner and footer, tree
 * components, tabs, slots, container props) is merged over them.
 * `layout.sidebar.enabled: false` works in every layout: no sidebar (or
 * sidebar column) on wide screens, the menu drawer on small ones (see
 * sidebar-off.tsx).
 */
export function GuidesLayout({
  config,
  tree,
  variant,
  overrides,
  children,
}: {
  config: OrbitDocsConfig;
  tree: Tree;
  /** Private docs: the guides variant this layout renders (app/~/[variant]), so the top bar may list what its readers may open. */
  variant?: string;
  /** React-only Fumadocs options (lib/overrides.tsx). */
  overrides?: OrbitOverrides;
  children: ReactNode;
}) {
  warnLayout(config);
  const readerOf = variant ? `/~/${variant}` : undefined;
  const base = orbitLayoutOptions(config, { readerOf, overrides });
  const l = config.layout;
  const o = overrides?.layout ?? {};
  const off = !l.sidebar.enabled;
  const sidebar = {
    collapsible: l.sidebar.collapsible,
    defaultOpenLevel: l.sidebar.defaultOpenLevel,
    // `true` would force Next's full prefetch, which ignores static export and fetches
    // the page HTML instead of its .txt payload. Next's automatic prefetch handles both.
    prefetch: l.sidebar.prefetch ? undefined : false,
    banner: o.sidebar?.banner ?? (l.sidebar.banner ? <p className="od-sidebar-banner">{l.sidebar.banner}</p> : undefined),
    footer: o.sidebar?.footer ?? <SidebarFooter config={config} />,
    ...(o.sidebar?.components ? { components: o.sidebar.components } : {}),
  };
  const tabs = layoutTabs(config, tree, overrides, readerOf);
  const extra = {
    ...(tabs !== undefined ? { tabs } : {}),
    ...(o.containerProps ? { containerProps: o.containerProps } : {}),
  };
  switch (l.type) {
    case 'docs': {
      const Layout = off ? DocsLayoutWithoutSidebar : DocsUI.DocsLayout;
      return (
        <Layout {...base} {...extra} tree={tree} sidebar={sidebar} tabMode={l.tabMode === 'auto' ? 'auto' : 'top'}>
          {children}
        </Layout>
      );
    }
    case 'flux': {
      const Layout = off ? FluxLayoutWithoutSidebar : FluxUI.DocsLayout;
      const { collapsible: _, ...flux } = sidebar;
      return (
        <Layout {...base} {...extra} tree={tree} sidebar={flux}>
          {children}
        </Layout>
      );
    }
    case 'glass': {
      // Glass's sidebar takes only provider options: no banner, footer or tree components.
      const Layout = off ? GlassLayoutWithoutSidebar : GlassUI.GlassLayout;
      return (
        <Layout {...base} tree={tree} {...(tabs !== undefined ? { tabs } : {})} sidebar={{ collapsible: sidebar.collapsible }}>
          {children}
        </Layout>
      );
    }
    case 'home':
      return <HomeLayout {...base}>{children}</HomeLayout>;
    default: {
      const Layout = off ? NotebookLayoutWithoutSidebar : NotebookUI.DocsLayout;
      return (
        <Layout
          {...base}
          {...extra}
          // Without a sidebar the title and the tabs need the navbar.
          nav={{ ...base.nav, mode: off ? 'top' : l.navMode }}
          tabMode={off || l.tabMode !== 'sidebar' ? 'navbar' : 'sidebar'}
          tree={tree}
          sidebar={sidebar}
        >
          {children}
        </Layout>
      );
    }
  }
}

interface GuidePageData {
  title?: string;
  description?: string;
  /** Compiled MDX component. */
  body: unknown;
  toc?: unknown;
  full?: boolean;
  lastModified?: Date;
}

const PAGE_UI = {
  docs: DocsPageUI,
  notebook: NotebookPageUI,
  flux: FluxPageUI,
  glass: GlassPageUI,
  home: DocsPageUI,
} as const;

/**
 * One guide page with the configured TOC, breadcrumb, footer, last-updated
 * and actions; `overrides.page` (TOC header and footer, previous / next
 * items, page slots) is merged over them.
 */
export function GuidePage({
  config,
  page,
  components,
  overrides,
}: {
  config: OrbitDocsConfig;
  page: { url: string; slugs: string[]; path?: string; data: GuidePageData };
  /** MDX components (from orbitMdxComponents). */
  components: Record<string, unknown>;
  /** React-only Fumadocs options (lib/overrides.tsx). */
  overrides?: OrbitOverrides;
}) {
  const own = overrides?.page;
  const o: GuidePageOverrides = (typeof own === 'function' ? own(page as unknown as GuidePageInfo) : own) ?? {};
  const l = config.layout;
  const UI = PAGE_UI[l.type];
  const base = config.output.basePath;
  const MDX = page.data.body as ComponentType<{ components?: Record<string, unknown> }>;
  const full = l.full || page.data.full;
  // Glass draws its own TOC, breadcrumb and footer: its DocsPage takes only
  // `toc` and `tableOfContent: { container, header, footer }` (fumadocs-ui
  // 16.15), so toc.style/single, breadcrumb and footer can't reach it;
  // layoutWarnings() says so. toc.enabled still works through `toc`.
  const tocProps =
    l.type === 'glass'
      ? { ...(o.tableOfContent ? { tableOfContent: o.tableOfContent } : {}) }
      : {
          tableOfContent: { enabled: l.toc.enabled, style: l.toc.style, single: l.toc.single, ...o.tableOfContent },
          ...(l.type === 'flux' ? {} : { tableOfContentPopover: { enabled: l.toc.enabled, style: l.toc.style, ...o.tableOfContentPopover } }),
          breadcrumb: {
            enabled: l.breadcrumb.enabled,
            includeRoot: l.breadcrumb.includeRoot,
            includePage: l.breadcrumb.includePage,
            includeSeparator: l.breadcrumb.includeSeparator,
          },
          footer: { enabled: l.footer, ...o.footer },
          ...(o.slots ? { slots: o.slots } : {}),
        };
  const Page = UI.DocsPage as ComponentType<Record<string, unknown>>;
  const gh = l.editOnGithub;
  return (
    <Page toc={l.toc.enabled ? page.data.toc : undefined} full={full} {...tocProps}>
      <UI.DocsTitle>{page.data.title}</UI.DocsTitle>
      {page.data.description ? <UI.DocsDescription className="mb-2">{page.data.description}</UI.DocsDescription> : null}
      {l.pageActions.length ? (
        <PageActions
          markdownUrl={`${base}/md/${[...page.slugs, 'content.md'].join('/')}`}
          pageUrl={`${config.site.url ?? ''}${base}${page.url}`}
          actions={l.pageActions}
        />
      ) : null}
      <UI.DocsBody>
        <MDX components={components} />
      </UI.DocsBody>
      {(l.lastUpdated && page.data.lastModified) || gh ? (
        <div className="od-page-meta">
          {gh && page.path ? (
            <UI.EditOnGitHub href={`https://github.com/${gh.owner}/${gh.repo}/blob/${gh.branch}/${gh.dir}/${page.path}`} />
          ) : null}
          {l.lastUpdated && page.data.lastModified ? <UI.PageLastUpdate date={new Date(page.data.lastModified)} /> : null}
        </div>
      ) : null}
    </Page>
  );
}

/**
 * The site root (`content/index.mdx`). With `layout: landing` in its
 * frontmatter it renders as a full-width landing page with the top nav and no
 * sidebar; otherwise it is an ordinary guide page.
 */
export function HomePage({
  config,
  tree,
  page,
  components,
  overrides,
}: {
  config: OrbitDocsConfig;
  tree: Tree;
  page: { url: string; slugs: string[]; path?: string; data: GuidePageData & { layout?: string } };
  components: Record<string, unknown>;
  /** React-only Fumadocs options (lib/overrides.tsx). */
  overrides?: OrbitOverrides;
}) {
  if (page.data.layout === 'landing') {
    return (
      <LandingLayout config={config} overrides={overrides}>
        <LandingPage page={page} components={components} />
      </LandingLayout>
    );
  }
  return (
    <GuidesLayout config={config} tree={tree} overrides={overrides}>
      <GuidePage config={config} page={page} components={components} overrides={overrides} />
    </GuidesLayout>
  );
}
