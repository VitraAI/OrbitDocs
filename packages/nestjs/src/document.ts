import type { INestApplicationContext } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { type Document, filterDocument, type FilterOptions } from '@orbitdocs/openapi';

export interface OrbitDocumentOptions extends FilterOptions {
  /** Base document (title, version, servers). Defaults to `{ title: 'API', version: '1.0.0' }`. */
  base?: Omit<OpenAPIObject, 'paths'>;
}

/** The complete OpenAPI document Nest would serve, before any filtering. */
export function createFullDocument(
  app: INestApplicationContext,
  base?: Omit<OpenAPIObject, 'paths'>,
): Document {
  const doc = SwaggerModule.createDocument(
    app as Parameters<typeof SwaggerModule.createDocument>[0],
    base ?? new DocumentBuilder().setTitle('API').setVersion('1.0.0').build(),
    { deepScanRoutes: true },
  );
  return doc as unknown as Document;
}

/**
 * The public document: only routes marked with `@DocsOperation`, with
 * readable operationIds, standard errors and unused schemas pruned.
 */
export function createOrbitDocument(app: INestApplicationContext, options: OrbitDocumentOptions = {}): Document {
  const { base, ...filter } = options;
  return filterDocument(createFullDocument(app, base), filter);
}
