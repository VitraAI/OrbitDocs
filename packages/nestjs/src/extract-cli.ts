/**
 * Child-process entry used by `orbitdocs extract`:
 *   node extract-cli.cjs <request.json>
 * Prints one line `ORBITDOCS_RESULT <json>` on success.
 */
import { readFileSync } from 'node:fs';

import { extract, extractMany, type ExtractManyRequest, type ExtractRequest } from './extract';
import { writeThenExit } from './write-then-exit';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: extract-cli <request.json>');
  const req = JSON.parse(readFileSync(file, 'utf8')) as ExtractRequest | ExtractManyRequest;
  // `targets`: several APIs from one boot (one result per target, in order).
  const result = 'targets' in req ? await extractMany(req) : await extract(req);
  // Exit explicitly (some apps leave handles open: timers in module scope), but only once the
  // result is flushed: a large one was cut off by exiting straight after the write.
  writeThenExit(process.stdout, `ORBITDOCS_RESULT ${JSON.stringify(result)}\n`, 0);
}

main().catch((err: unknown) => {
  writeThenExit(process.stderr, `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`, 1);
});
