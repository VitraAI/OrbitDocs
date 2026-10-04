import { readAiManifest } from '@orbitdocs/next/server';

export const revalidate = false;

/**
 * The AI index (guides, API operations and MCP tools), copied into the build
 * for the server that runs Ask AI and MCP (mountOrbitDocs). Never served to readers.
 */
export function GET() {
  return Response.json(readAiManifest());
}
