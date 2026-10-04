import { GuidesLayout } from '@orbitdocs/next';
import { guidesTree } from '@orbitdocs/next/server';
import type { ReactNode } from 'react';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';
import { source } from '@/lib/source';

/**
 * Layout, sidebar, tabs and nav come from `layout` in orbitdocs.config.ts;
 * React-only options (slots, sidebar banner, custom links) from lib/overrides.tsx.
 * With private docs the sidebar holds only pages every reader may open;
 * readers who may open more get app/~/[variant] instead.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <GuidesLayout config={orbit} tree={guidesTree(source.getPageTree())} overrides={overrides}>
      {children}
    </GuidesLayout>
  );
}
