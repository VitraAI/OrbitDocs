import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mountOrbitDocs } from '@orbitdocs/nestjs';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: true,
    allowedHeaders: ['content-type', 'x-api-key', 'authorization', 'idempotency-key'],
    exposedHeaders: [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after',
      'idempotent-replayed',
      'content-disposition',
      'deprecation',
      'sunset',
      'link',
    ],
  });

  // Serve the docs from this server at /docs once `orbitdocs build` has run.
  const docs = join(__dirname, '../docs/out');
  if (existsSync(docs)) mountOrbitDocs(app, { root: docs, path: '/docs' });

  const port = Number(process.env.PORT ?? 3010);
  await app.listen(port);
  console.log(`Orbit Travel API on http://localhost:${port}${existsSync(docs) ? ` · docs at /docs` : ''}`);
}

void bootstrap();
