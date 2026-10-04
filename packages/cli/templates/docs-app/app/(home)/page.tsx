import { HomePage } from '@orbitdocs/next';
import { orbitMdxComponents } from '@orbitdocs/next/mdx';
import { guidesTree } from '@orbitdocs/next/server';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';
import { source } from '@/lib/source';

/**
 * The home page, from content/index.mdx. Add `layout: landing` to its
 * frontmatter for a full-width landing page (Hero, Features, ApiCards, …);
 * without it, it is the first guide.
 */
export default function Home() {
  const page = source.getPage([]);
  if (!page) notFound();
  return (
    <HomePage
      config={orbit}
      tree={guidesTree(source.getPageTree())}
      page={page}
      overrides={overrides}
      components={orbitMdxComponents(orbit, { a: createRelativeLink(source, page) }) as Record<string, unknown>}
    />
  );
}

export function generateMetadata(): Metadata {
  const page = source.getPage([]);
  return { title: { absolute: page?.data.title ?? orbit.site.title }, description: page?.data.description };
}
