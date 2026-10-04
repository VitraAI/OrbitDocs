import { GuidePage } from '@orbitdocs/next';
import { orbitMdxComponents } from '@orbitdocs/next/mdx';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug: string[] }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return (
    <GuidePage
      config={orbit}
      page={page}
      // Add your own MDX components here.
      components={orbitMdxComponents(orbit, { a: createRelativeLink(source, page) }) as Record<string, unknown>}
      overrides={overrides}
    />
  );
}

/** Every guide except the home page (app/(home)/page.tsx renders content/index.mdx). */
export function generateStaticParams() {
  return source.generateParams().filter((p) => p.slug.length > 0);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
