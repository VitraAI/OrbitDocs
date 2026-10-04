import 'reflect-metadata';

import { Body, Controller, Get, Injectable, Module, Param, Post, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiProperty } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';

import { createOrbitDocument, DocsErrors, DocsHidden, DocsOperation, DocsSamples } from './index';

class CreatePlanetDto {
  @ApiProperty({ description: 'Planet name.', example: 'Kepler-22b' })
  name!: string;
}

class PlanetDto {
  @ApiProperty({ description: 'Id.', example: 'pl_1' })
  id!: string;
  @ApiProperty({ description: 'Planet name.', example: 'Kepler-22b' })
  name!: string;
}

@Injectable()
class Db {
  constructor() {
    // Preview mode must never instantiate providers.
    throw new Error('Db must not be constructed during extraction');
  }
}

@Controller({ path: 'planets', version: '1' })
class PlanetsController {
  constructor(private readonly db: Db) {}

  @Get(':id')
  @DocsOperation({ group: 'Planets', title: 'Get a planet', order: 2 })
  @DocsErrors({ 404: 'No planet with this id.' })
  get(@Param('id') id: string): PlanetDto {
    return { id, name: '' };
  }

  @Post()
  @DocsOperation({ group: 'Planets', title: 'Create a planet', order: 1, stability: 'beta' })
  @DocsSamples([{ lang: 'typescript', source: 'await client.planets.create({ name })' }])
  create(@Body() dto: CreatePlanetDto): PlanetDto {
    return { id: 'x', name: dto.name };
  }

  @Get('internal/stats')
  stats() {
    return {};
  }

  @Get('legacy')
  @DocsOperation({ group: 'Planets' })
  @DocsHidden()
  legacy() {
    return {};
  }
}

@Module({ controllers: [PlanetsController], providers: [Db] })
class AppModule {}

async function previewApp() {
  const app = await NestFactory.create(AppModule, { preview: true, abortOnError: false, logger: false });
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
  return app;
}

describe('createOrbitDocument (preview mode)', () => {
  it('keeps only documented routes without instantiating providers', async () => {
    const app = await previewApp();
    const doc = createOrbitDocument(app);
    expect(Object.keys(doc.paths).sort()).toEqual(['/v1/planets', '/v1/planets/{id}']);
    await app.close();
  });

  it('applies markers, errors and samples', async () => {
    const app = await previewApp();
    const doc = createOrbitDocument(app);
    const get = doc.paths['/v1/planets/{id}']!.get!;
    expect(get.summary).toBe('Get a planet');
    expect(get.operationId).toBe('get-a-planet');
    expect(get.responses!['404']!.description).toBe('No planet with this id.');
    const post = doc.paths['/v1/planets']!.post!;
    expect(post['x-orbitdocs-stability']).toBe('beta');
    expect(post['x-codeSamples']).toHaveLength(1);
    expect(doc.tags!.map((t) => t.name)).toEqual(['Planets']);
    expect(Object.keys(doc.components!.schemas!)).toContain('CreatePlanetDto');
    await app.close();
  });
});
