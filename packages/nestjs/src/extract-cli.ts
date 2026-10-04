/**
 * Child-process entry used by `orbitdocs extract`:
 *   node extract-cli.cjs <request.json>
 * Prints one line `ORBITDOCS_RESULT <json>` on success.
 */
import { readFileSync } from 'node:fs';

import { extract, extractMany, type ExtractManyRequest, type ExtractRequest } from './extract';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: extract-cli <request.json>');
  const req = JSON.parse(readFileSync(file, 'utf8')) as ExtractRequest | ExtractManyRequest;
  // `targets`: several APIs from one boot (one result per target, in order).
  const result = 'targets' in req ? await extractMany(req) : await extract(req);
  process.stdout.write(`ORBITDOCS_RESULT ${JSON.stringify(result)}\n`);
  // Some apps leave handles open (timers in module scope); extraction is done.
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
