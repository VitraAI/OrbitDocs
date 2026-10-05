import { GuidePage } from '@vitra-ai/orbitdocs-next';
import { orbitMdxComponents } from '@vitra-ai/orbitdocs-next/mdx';
import { guideVariantParams, isGuideVariantPage } from '@vitra-ai/orbitdocs-next/server';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';
import { source } from '@/lib/source';

type Props = { params: Promise<{ variant: string; slug?: string[] }> };

/** A guide as readers of one sidebar variant see it (private docs, see the layout next to this folder). */
export default async function Page({ params }: Props) {
  const { variant, slug = [] } = await params;
  const page = source.getPage(slug);
  if (!page || !isGuideVariantPage(variant, page)) notFound();
  return (
    <GuidePage
      config={orbit}
      page={page}
      // Keep in sync with app/(guides)/[...slug]/page.tsx.
      components={orbitMdxComponents(orbit, { a: createRelativeLink(source, page) }) as Record<string, unknown>}
      overrides={overrides}
    />
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return guideVariantParams(source);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return slug.length ? { title: page.data.title, description: page.data.description } : { title: { absolute: page.data.title }, description: page.data.description };
}
