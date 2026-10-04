import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { webMiddleware } from '@orbitdocs/auth/express';
import express from 'express';

import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { CONFIG, type PlatformConfig } from './config';
import { runMigrations } from './db';
import { HostingService } from './hosting/hosting.service';

async function bootstrap() {
  const log = new Logger('Platform');
  const url = process.env.DATABASE_URL ?? 'postgres://orbitdocs:orbitdocs@localhost:5433/orbitdocs';
  await runMigrations(url);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: true });
  const config = app.get<PlatformConfig>(CONFIG);
  app.set('trust proxy', true);
  // SCIM clients send application/scim+json.
  app.useBodyParser('json', { limit: '2mb', type: ['application/json', 'application/*+json'] });

  // Sites on project hosts and custom domains are served before anything else.
  app.use(app.get(HostingService).middleware());

  // Dashboard SSO: the same OpenID Connect presets as private docs.
  const auth = app.get(AuthService);
  if (auth.sso) {
    const sso = auth.sso;
    app.use(
      '/api/sso',
      webMiddleware(async (request) => {
        const path = new URL(request.url).pathname;
        if (path === '/api/sso/finish') {
          const docsUser = await sso.user(request);
          if (!docsUser) return Response.redirect(new URL('/login?error=sso', request.url), 302);
          try {
            const req = { headers: Object.fromEntries(request.headers), ip: request.headers.get('x-forwarded-for') ?? undefined };
            const user = await auth.ssoUser(docsUser.email, docsUser.name, req);
            const headers = new Headers({ location: '/' });
            headers.append('set-cookie', auth.cookie(await auth.session(user), request.url.startsWith('https')));
            headers.append('set-cookie', 'od_session=; Path=/api/sso; Max-Age=0; HttpOnly; SameSite=Lax');
            return new Response(null, { status: 302, headers });
          } catch (err) {
            return Response.redirect(new URL(`/login?error=${encodeURIComponent((err as Error).message)}`, request.url), 302);
          }
        }
        return sso.handle(request);
      }),
    );
  }

  // The dashboard: a static Next export.
  const web = join(__dirname, '..', 'web', 'out');
  if (existsSync(web)) {
    app.use(express.static(web, { extensions: ['html'], index: ['index.html'] }));
  } else {
    log.warn(`No dashboard build at ${web} (pnpm --filter @orbitdocs/platform-web build)`);
  }

  // Lets the build queue stop its workers on SIGTERM.
  app.enableShutdownHooks();
  await app.listen(config.port);
  log.log(`Dashboard on ${config.publicUrl} · sites on <project>.${config.domain}`);
}

void bootstrap();
