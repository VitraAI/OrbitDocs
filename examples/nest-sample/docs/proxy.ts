import { orbitProxy } from '@vitra-ai/orbitdocs-next/proxy';

/**
 * Private docs when this app runs as a server (`output.mode: 'server'`, e.g.
 * Vercel or Docker). Static builds ignore it: there, the Nest server enforces
 * access (mountOrbitDocs).
 */
export default orbitProxy();

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
