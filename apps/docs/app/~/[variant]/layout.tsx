import { GuidesLayout } from '@vitra-ai/orbitdocs-next';
import { guidesTree } from '@vitra-ai/orbitdocs-next/server';
import type { ReactNode } from 'react';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';
import { source } from '@/lib/source';

/**
 * Private docs: the guides for readers who may open restricted pages, with
 * those pages in the sidebar. The access gate serves /~/<variant>/<page> in
 * place of /<page> to those readers; the URL they see doesn't change.
 */
export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  return (
    <GuidesLayout config={orbit} tree={guidesTree(source.getPageTree(), variant)} variant={variant} overrides={overrides}>
      {children}
    </GuidesLayout>
  );
}
