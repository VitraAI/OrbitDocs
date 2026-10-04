import { notFound } from 'next/navigation';

import { source } from '@/lib/source';

export const revalidate = false;

/** Each guide as Markdown at /md/<slug>/content.md (Copy page, AI tools). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();
  const body = await page.data.getText('processed');
  return new Response(`# ${page.data.title}\n\n${body}`, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: [...page.slugs, 'content.md'] }));
}
