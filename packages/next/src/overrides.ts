import type { DocsLayoutProps, DocsSlots } from 'fumadocs-ui/layouts/docs';
import type { DocsPageProps } from 'fumadocs-ui/layouts/docs/page';
import type { SidebarProps } from 'fumadocs-ui/layouts/docs/slots/sidebar';
import type { DocsSlots as FluxSlots } from 'fumadocs-ui/layouts/flux';
import type { GlassSlots } from 'fumadocs-ui/layouts/glass';
import type { HomeSlots } from 'fumadocs-ui/layouts/home';
import type { DocsSlots as NotebookSlots } from 'fumadocs-ui/layouts/notebook';
import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import type { RootProviderProps } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

/*
 * Fumadocs options that take React (components, elements, functions), so they
 * can't live in orbitdocs.config.ts. The docs app passes one `overrides` object
 * (lib/overrides.tsx) to OrbitRoot, the layouts and the guide pages; each part
 * is merged over what the config sets. Types are Fumadocs' own.
 *
 * Components given here from a server file (the app's files are) must be
 * client components ('use client') wherever Fumadocs renders them on the
 * client: slots, `nav.title` as a component, `search.SearchDialog`.
 */

/** RootProvider (app/layout.tsx). */
export interface OrbitRootOverrides {
  /**
   * Search: a custom dialog (`SearchDialog`, e.g. Algolia or Orama Cloud), or
   * props for the default one (`options.footer`, …). Merged over `search` in
   * the config; `options` are merged too.
   */
  search?: RootProviderProps['search'];
  /** next-themes options, over `theme.defaultMode` and `theme.hotKey`. */
  theme?: RootProviderProps['theme'];
  /** Link and Image components. */
  components?: RootProviderProps['components'];
  /** Banner content as React, in place of `banner.content` (the other `banner` options still apply). */
  banner?: ReactNode;
}

/** Top bar and guides layout (every layout, the reference and client pages too). */
export interface GuidesLayoutOverrides extends Omit<BaseLayoutProps, 'links' | 'children' | 'i18n' | 'slots'> {
  /**
   * Link items after the config's (e.g. `{ type: 'custom', children: <VersionPicker /> }`),
   * or a function that gets the config's items and returns the list to show.
   */
  links?: LinkItemType[] | ((links: LinkItemType[]) => LinkItemType[]);
  /** Layout slots (`navTitle`, `searchTrigger`, `themeSwitch`, `header`, `sidebar`, …), by `layout.type`. */
  slots?: Partial<NotebookSlots> | Partial<DocsSlots> | Partial<FluxSlots> | Partial<GlassSlots> | Partial<HomeSlots>;
  /**
   * Guides sidebar as React: `banner` and `footer` replace `layout.sidebar.banner`
   * and the `navigation.sidebar` links; `components` renders tree items your way.
   * Not in the glass layout (Fumadocs' glass sidebar takes none of these).
   */
  sidebar?: Pick<SidebarProps, 'banner' | 'footer' | 'components'>;
  /** Layout tabs: a list (React icons allowed) or `{ transform }` over the root-folder tabs. Replaces `layout.tabs`. */
  tabs?: DocsLayoutProps['tabs'];
  /** Props of the guides layout's container (docs, notebook and flux). */
  containerProps?: DocsLayoutProps['containerProps'];
}

type TableOfContent = NonNullable<DocsPageProps['tableOfContent']>;
type TableOfContentPopover = NonNullable<DocsPageProps['tableOfContentPopover']>;

/** Guide pages (DocsPage). */
export interface GuidePageOverrides {
  /** Table of contents: content above (`header`) and below (`footer`) it, props of its `container`. Every layout. */
  tableOfContent?: Pick<TableOfContent, 'header' | 'footer' | 'container'>;
  /** The table of contents menu on small screens (docs and notebook). */
  tableOfContentPopover?: Pick<TableOfContentPopover, 'header' | 'footer'>;
  /** Previous / next links: `items` replaces the ones taken from the sidebar order. Not in glass. */
  footer?: Pick<NonNullable<DocsPageProps['footer']>, 'items'>;
  /** Page slots (`container`, `breadcrumb`, `footer`, `toc`). Not in glass. */
  slots?: DocsPageProps['slots'];
}

/** What a function in `overrides.page` gets: the page being rendered. */
export interface GuidePageInfo {
  url: string;
  slugs: string[];
  path?: string;
  /** Frontmatter and compiled content. */
  data: { title?: string; description?: string } & Record<string, unknown>;
}

/** Everything the docs app can override, in one object (lib/overrides.tsx). */
export interface OrbitOverrides {
  root?: OrbitRootOverrides;
  layout?: GuidesLayoutOverrides;
  /** The same for every page, or a function of the page (e.g. previous / next links from its frontmatter). */
  page?: GuidePageOverrides | ((page: GuidePageInfo) => GuidePageOverrides);
}
