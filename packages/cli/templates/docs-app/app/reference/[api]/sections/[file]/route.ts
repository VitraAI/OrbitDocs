import { referenceSections, referenceSectionsParams } from '@orbitdocs/next';

import { orbit } from '@/lib/orbit';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** The reference sections a page doesn't carry (one file per group, plus models.json), loaded as the reader scrolls. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ api: string; file: string }> },
) {
  return referenceSections(orbit, await params);
}

export function generateStaticParams() {
  return referenceSectionsParams(orbit);
}
