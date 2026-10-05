import { orbitProxy } from '@vitra-ai/orbitdocs-next/proxy';

/**
 * Private docs when this app runs as a server (`output.mode: 'server'`, e.g.
 * Vercel or Docker). Without `access` in orbitdocs.config.ts it lets
 * everything through; static builds ignore it (mountOrbitDocs enforces access
 * when Nest serves them).
 */
export default orbitProxy();

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
