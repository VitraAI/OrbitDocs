'use client';

import { DocsLayout as DocsDocsLayout, type DocsLayoutProps as DocsProps } from 'fumadocs-ui/layouts/docs';
import * as DocsSidebar from 'fumadocs-ui/layouts/docs/slots/sidebar';
import { DocsLayout as FluxDocsLayout, type DocsLayoutProps as FluxProps } from 'fumadocs-ui/layouts/flux';
import * as FluxSidebar from 'fumadocs-ui/layouts/flux/slots/sidebar';
import { GlassLayout, type GlassLayoutProps } from 'fumadocs-ui/layouts/glass';
import * as GlassSidebar from 'fumadocs-ui/layouts/glass/slots/sidebar';
import { DocsLayout as NotebookDocsLayout, type DocsLayoutProps as NotebookProps } from 'fumadocs-ui/layouts/notebook';
import * as NotebookSidebar from 'fumadocs-ui/layouts/notebook/slots/sidebar';
import type { ComponentProps, CSSProperties } from 'react';

/*
 * Guide layouts with `layout.sidebar.enabled: false`. Fumadocs' notebook and
 * glass layouts have no such option and docs/flux leave a dead menu button, so
 * each layout gets sidebar slots instead: no sidebar on wide screens (and no
 * column for it, so pages use the width), while small screens keep the menu
 * drawer: it is where those layouts put the header links there. Slots are
 * functions, so they are set here, on the client.
 */

const Nothing = () => null;

/** Collapses the sidebar column even though the sidebar's placeholder sets its width. */
const noColumn = { '--fd-sidebar-col': '0px', '--fd-sidebar-width': '0px' } as CSSProperties;

function NotebookMobileSidebar(props: ComponentProps<typeof NotebookSidebar.Sidebar>) {
  return (
    <div className="contents md:hidden">
      <NotebookSidebar.Sidebar {...props} />
    </div>
  );
}

function DocsMobileSidebar(props: ComponentProps<typeof DocsSidebar.Sidebar>) {
  return (
    <div className="contents md:hidden">
      <DocsSidebar.Sidebar {...props} />
    </div>
  );
}

export function NotebookLayoutWithoutSidebar(props: NotebookProps) {
  return (
    <NotebookDocsLayout
      {...props}
      containerProps={{ ...props.containerProps, style: { ...props.containerProps?.style, ...noColumn } }}
      slots={{
        ...props.slots,
        sidebar: {
          provider: NotebookSidebar.SidebarProvider,
          useSidebar: NotebookSidebar.useSidebar,
          root: NotebookMobileSidebar,
          trigger: NotebookSidebar.SidebarTrigger,
          // Nothing to collapse on wide screens.
          collapseTrigger: Nothing,
        },
      }}
    />
  );
}

export function DocsLayoutWithoutSidebar(props: DocsProps) {
  return (
    <DocsDocsLayout
      {...props}
      containerProps={{ ...props.containerProps, style: { ...props.containerProps?.style, ...noColumn } }}
      slots={{
        ...props.slots,
        sidebar: {
          provider: DocsSidebar.SidebarProvider,
          useSidebar: DocsSidebar.useSidebar,
          root: DocsMobileSidebar,
          trigger: DocsSidebar.SidebarTrigger,
        },
      }}
    />
  );
}

/** Flux's sidebar is the overlay its menu button opens, on every screen size: both go. */
export function FluxLayoutWithoutSidebar(props: FluxProps) {
  return (
    <FluxDocsLayout
      {...props}
      sidebar={{ ...props.sidebar, enabled: false }}
      slots={{
        ...props.slots,
        sidebar: { provider: FluxSidebar.SidebarProvider, useSidebar: FluxSidebar.useSidebar, root: Nothing, trigger: Nothing },
      }}
    />
  );
}

export function GlassLayoutWithoutSidebar(props: GlassLayoutProps) {
  return (
    <GlassLayout
      {...props}
      // Not collapsible: no "show sidebar" button for a sidebar that isn't there.
      sidebar={{ ...props.sidebar, collapsible: false }}
      slots={{
        ...props.slots,
        sidebar: {
          provider: GlassSidebar.SidebarProvider,
          use: GlassSidebar.useSidebar,
          main: Nothing,
          drawer: GlassSidebar.SidebarDrawer,
          drawerHandle: GlassSidebar.drawerHandle,
        },
      }}
    />
  );
}
