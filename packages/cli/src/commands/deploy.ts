import { existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';

import { fail, log, run } from '../util';
import { build } from './build';

export type DeployTarget = 'vercel' | 'static' | 'nest' | 'docker';

const NGINX = (base: string) => `server {
  listen 80;
  root /usr/share/nginx/html;
  location ${base || '/'} {
    ${base ? `alias /usr/share/nginx/html/;\n    ` : ''}try_files $uri $uri/ $uri.html =404;
  }
  error_page 404 ${base}/404.html;
}
`;

export async function deploy(loaded: LoadedConfig, target: DeployTarget, options: { prod?: boolean; skipBuild?: boolean }) {
  const { config, dir } = loaded;
  if (config.output.mode !== 'static' && target !== 'vercel') {
    fail(`Target "${target}" needs output.mode 'static'.`);
  }
  const out = options.skipBuild ? join(dir, 'out') : await build(loaded);
  const base = config.output.basePath;

  switch (target) {
    case 'vercel': {
      log.step(`vercel deploy${options.prod ? ' --prod' : ''}`);
      const args = ['--yes', 'vercel@latest', 'deploy', config.output.mode === 'static' ? out : dir, ...(options.prod ? ['--prod'] : [])];
      const code = await run('npx', args, { cwd: dir });
      if (code !== 0) fail('vercel deploy failed (run `npx vercel login` first)');
      return;
    }
    case 'static':
      log.ok(`Upload ${relative(process.cwd(), out)}/ to any static host (Netlify, Cloudflare Pages, S3 + CloudFront, nginx).`);
      if (base) log.warn(`The site expects to live under ${base}/ — serve the folder at that path.`);
      return;
    case 'nest':
      log.ok('Serve it from your Nest app (main.ts, before app.listen()):');
      console.log(`
  import { mountOrbitDocs } from '@vitra-ai/orbitdocs-nestjs';
  mountOrbitDocs(app, { root: join(__dirname, '${relative(join(dir, '..', 'dist'), out)}'), path: '${base || '/docs'}' });
`);
      if (!base) log.warn("Set output.basePath (e.g. '/docs') so the site's links match the path Nest serves it on.");
      return;
    case 'docker': {
      const dockerfile = join(dir, 'Dockerfile');
      if (!existsSync(dockerfile)) {
        writeFileSync(join(dir, 'nginx.conf'), NGINX(base));
        writeFileSync(
          dockerfile,
          `FROM nginx:1.29-alpine\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\nCOPY out/ /usr/share/nginx/html/\nEXPOSE 80\n`,
        );
        log.ok('Wrote Dockerfile and nginx.conf');
      }
      log.ok(`Build the image: docker build -t docs ${relative(process.cwd(), dir) || '.'}`);
      return;
    }
  }
}
