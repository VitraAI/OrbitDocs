import { join } from 'node:path';

/** Folder (inside the docs app) where `orbitdocs extract` writes specs. */
export const SPEC_DIR = 'openapi';

/** Where the spec for one API lives inside the docs app. */
export function specFile(appDir: string, apiId: string): string {
  return join(appDir, SPEC_DIR, `${apiId}.json`);
}

/** Default URL path of an API's reference. */
export function referenceRoute(apiId: string): string {
  return `/reference/${apiId}`;
}
