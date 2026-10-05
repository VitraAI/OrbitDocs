import { layoutWarnings } from '@vitra-ai/orbitdocs-core';
import { loadConfig } from '@vitra-ai/orbitdocs-core/loader';
import { createInterface } from 'node:readline/promises';

import { Command } from 'commander';

import { build } from './commands/build';
import { check } from './commands/check';
import { deploy, type DeployTarget } from './commands/deploy';
import { dev } from './commands/dev';
import { extract } from './commands/extract';
import { detectNest, init } from './commands/init';
import { lint, printLint } from './commands/lint';
import { mock } from './commands/mock';
import { publish, type PublishOptions } from './commands/publish';
import { sdk, writeWorkflow } from './commands/sdk';
import { sdkTest } from './commands/sdk-test';
import { start } from './commands/start';
import { fail, log } from './util';
import { CLI_VERSION } from './version';

const program = new Command()
  .name('orbitdocs')
  .description('API documentation from your NestJS code: write guides in MDX, deploy anywhere.')
  .version(CLI_VERSION);

const wrap =
  <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
  async (...args: A) => {
    try {
      await fn(...args);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  };

/** Asks which routes the docs should show; Swagger-heavy projects get `all` as the suggestion. */
async function askRoutes(swaggerOperations: number): Promise<'opt-in' | 'all'> {
  const suggestAll = swaggerOperations > 0;
  console.log(`
Which routes should the docs show?
  1) Only routes marked with @DocsOperation (internal routes can't leak)
  2) Every route @nestjs/swagger documents (hide one with @ApiExcludeEndpoint)${
    suggestAll ? `\n     Found ${swaggerOperations} @ApiOperation decorator${swaggerOperations === 1 ? '' : 's'} in this project.` : ''
  }`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Choose 1 or 2 [${suggestAll ? 2 : 1}]: `)).trim();
  rl.close();
  if (answer === '1') return 'opt-in';
  if (answer === '2') return 'all';
  return suggestAll ? 'all' : 'opt-in';
}

program
  .command('init')
  .description('Create a docs app in this Nest project')
  .option('-d, --dir <dir>', 'folder for the docs app', 'docs')
  .option('-t, --title <title>', 'site title')
  .option('--workspace', 'use workspace:* versions (OrbitDocs monorepo)')
  .option('-f, --force', 'write into a non-empty folder')
  .option('--routes <routes>', 'which routes reach the docs: opt-in (marked with @DocsOperation) or all (everything @nestjs/swagger sees)')
  .action(wrap(async (opts: { dir: string; title?: string; workspace?: boolean; force?: boolean; routes?: string }) => {
    if (opts.routes && opts.routes !== 'opt-in' && opts.routes !== 'all') fail('--routes must be opt-in or all');
    let routes = opts.routes as 'opt-in' | 'all' | undefined;
    if (!routes && process.stdin.isTTY) routes = await askRoutes(detectNest(process.cwd()).swaggerOperations);
    init(process.cwd(), { ...opts, routes });
  }));

program
  .command('extract')
  .description('Write openapi/<api>.json from each configured source')
  .option('--api <id>', 'only this API')
  .option('--skip-build', 'do not run the configured build command')
  .action(wrap(async (opts: { api?: string; skipBuild?: boolean }) => {
    const results = await extract(await loadConfig(), { only: opts.api, skipBuild: opts.skipBuild });
    if (results.some((r) => !r.ok)) fail('Documentation gaps (completeness: error).');
  }));

program
  .command('check')
  .description('Find broken op: links and <Endpoint>s (guides and reference content) and missing specs')
  .action(wrap(async () => {
    const loaded = await loadConfig();
    for (const w of layoutWarnings(loaded.config)) log.warn(w);
    const problems = await check(loaded);
    for (const p of problems) log.error(p);
    if (problems.length) fail(`${problems.length} problem(s).`);
    log.ok('No problems found.');
  }));

program
  .command('dev')
  .description('Run the docs locally; re-extract when the API changes')
  .option('-p, --port <port>', 'port')
  .action(wrap(async (opts: { port?: string }) => dev(await loadConfig(), opts)));

program
  .command('build')
  .description('Extract, check and build the site (static by default)')
  .option('--skip-extract', 'use the specs already in openapi/')
  .action(wrap(async (opts: { skipExtract?: boolean }) => {
    await build(await loadConfig(), opts);
  }));

program
  .command('start')
  .description('Serve the production build: out/ (static) or `next start` (server)')
  .option('-p, --port <port>', 'port (default: PORT or 3000)')
  .action(wrap(async (opts: { port?: string }) => start(await loadConfig(), opts)));

program
  .command('deploy')
  .description('Build and deploy')
  .requiredOption('--target <target>', 'vercel | static | nest | docker')
  .option('--prod', 'production deployment (vercel)')
  .option('--skip-build', 'deploy the existing build')
  .action(wrap(async (opts: { target: DeployTarget; prod?: boolean; skipBuild?: boolean }) => {
    if (!['vercel', 'static', 'nest', 'docker'].includes(opts.target)) fail(`Unknown target ${opts.target}`);
    await deploy(await loadConfig(), opts.target, opts);
  }));

program
  .command('publish')
  .description('Build and upload the site and its specs to an OrbitDocs platform')
  .option('--platform <url>', 'platform URL (or ORBITDOCS_PLATFORM_URL)')
  .option('--token <token>', 'project token (or ORBITDOCS_TOKEN)')
  .option('--preview <label>', 'publish a preview (e.g. mr-42) instead of production')
  .option('--skip-build', 'upload the existing build')
  .option('-m, --message <text>', 'describe this publish (default: the last commit message)')
  .action(wrap(async (opts: PublishOptions) => publish(await loadConfig(), opts)));

program
  .command('lint')
  .description('Lint the specs with Spectral (OpenAPI rules, or lint.ruleset)')
  .option('--api <id>', 'only this API')
  .action(wrap(async (opts: { api?: string }) => {
    const loaded = await loadConfig();
    const ok = printLint(await lint(loaded, opts), loaded.config.lint.failOn);
    if (!ok) process.exit(1);
  }));

program
  .command('mock')
  .description('Serve a mock of an API that validates requests against the spec')
  .option('--api <id>', 'which API (default: the first)')
  .option('-p, --port <port>', 'port (default: mock.port or 4010)')
  .action(wrap(async (opts: { api?: string; port?: string }) => mock(await loadConfig(), opts)));

program
  .command('sdk')
  .description('Generate the SDKs configured in `sdks` (TypeScript, Python, Go, Java, C#, PHP)')
  .option('--lang <languages>', 'comma-separated languages (default: all configured)')
  .option('--api <id>', 'only this API')
  .option('--workflow <provider>', 'write a CI workflow that regenerates SDKs: github | gitlab')
  .argument('[action]', '`test`: call every operation through the TypeScript SDK against the mock')
  .action(wrap(async (action: string | undefined, opts: { lang?: string; api?: string; workflow?: string }) => {
    const loaded = await loadConfig();
    if (action === 'test') {
      if (!(await sdkTest(loaded, opts))) process.exit(1);
      return;
    }
    if (action) fail(`Unknown action "${action}". Use \`orbitdocs sdk\` or \`orbitdocs sdk test\`.`);
    if (opts.workflow) {
      if (opts.workflow !== 'github' && opts.workflow !== 'gitlab') fail('--workflow is github or gitlab');
      log.ok(`Wrote ${writeWorkflow(loaded, opts.workflow)}`);
      return;
    }
    await sdk(loaded, opts);
  }));

await program.parseAsync();
