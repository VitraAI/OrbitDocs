import { normalize, upgrade, validate } from '@scalar/openapi-parser';

import type { Document } from './types';

export interface LoadedDocument {
  document: Document;
  /** Validation problems (the document is still returned). */
  errors: string[];
}

/**
 * Parses JSON or YAML (or takes an object), upgrades Swagger 2.0 / OpenAPI 3.0
 * to 3.1, and validates it. Never throws for an invalid document: problems
 * come back in `errors` so the caller decides how strict to be.
 */
export async function loadDocument(input: string | Record<string, unknown>): Promise<LoadedDocument> {
  const value = normalize(input) as Record<string, unknown>;
  const { specification } = upgrade(value);
  const result = await validate(specification as Record<string, unknown>);
  const errors = (result.errors ?? []).map((e) => {
    const where = (e as { path?: string }).path;
    return where ? `${where}: ${e.message}` : e.message;
  });
  return { document: specification as unknown as Document, errors };
}
