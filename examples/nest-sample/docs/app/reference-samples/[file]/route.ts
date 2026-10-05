import { referenceSamples, referenceSamplesParams } from '@vitra-ai/orbitdocs-next';

import { orbit } from '@/lib/orbit';

export const dynamic = 'force-static';

/** Code samples in every language, loaded when a reader picks one the page doesn't carry. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  return referenceSamples(orbit, (await params).file);
}

export function generateStaticParams() {
  return referenceSamplesParams(orbit);
}
