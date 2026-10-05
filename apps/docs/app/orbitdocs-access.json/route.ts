import { readAccessManifest } from '@vitra-ai/orbitdocs-next/server';

export const revalidate = false;

/**
 * The access manifest, copied into the build for the server that enforces it
 * (mountOrbitDocs). It is never served to readers.
 */
export function GET() {
  return Response.json(readAccessManifest());
}
