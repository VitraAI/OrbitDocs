import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runExtractor } from './extract';

/** A stand-in for the extractor child: prints `body` to stdout, then exits with `code`. */
function child(body: string, code = 0): { cli: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orbitdocs-extract-'));
  const cli = join(dir, 'child.cjs');
  writeFileSync(join(dir, 'body.txt'), body);
  writeFileSync(
    cli,
    `const body = require('node:fs').readFileSync(${JSON.stringify(join(dir, 'body.txt'))}, 'utf8');
process.stdout.write(body, () => process.exit(${code}));`,
  );
  return { cli, dir };
}

describe('runExtractor', () => {
  it('reads a result far larger than a pipe buffer to the end', async () => {
    // ~2 MB, as many APIs with documentation gaps produce: was cut off at 64 KB.
    const gaps = Array.from({ length: 20_000 }, (_, i) => `GET /v1/thing/${i}: 200.field has no description`);
    const result = [{ operations: 20_000, gaps }];
    const { cli, dir } = child(`ORBITDOCS_RESULT ${JSON.stringify(result)}\n`);

    await expect(runExtractor(cli, 'request.json', dir)).resolves.toEqual(result);
  });

  it('rejects with the output when the child fails', async () => {
    const { cli, dir } = child('no result here\n', 1);
    await expect(runExtractor(cli, 'request.json', dir)).rejects.toThrow(/Extraction failed:\nno result here/);
  });
});
