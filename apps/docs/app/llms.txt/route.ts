import { createLlms } from '@vitra-ai/orbitdocs-next/server';

import { orbit } from '@/lib/orbit';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  return new Response(await createLlms(orbit, source).index(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
