import { createOrbitSearch } from '@orbitdocs/next/server';

import { orbit } from '@/lib/orbit';
import { source } from '@/lib/source';

// Static index: built once, searched in the browser (works on any static host).
export const revalidate = false;
export const { staticGET: GET } = createOrbitSearch(orbit, source);
