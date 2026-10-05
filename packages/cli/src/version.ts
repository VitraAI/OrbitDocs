import { createRequire } from 'node:module';

/**
 * This package's version, from its package.json: `--version` prints it and
 * `init` pins new docs apps to it. Both `src/` (tests) and the bundled `dist/`
 * sit one folder below package.json.
 */
export const CLI_VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
