import type { OrbitDocsConfig } from '@vitra-ai/orbitdocs-core';
import type { StructuredData } from 'fumadocs-core/mdx-plugins';
import { type AdvancedIndex, createSearchAPI, type SearchAPI } from 'fumadocs-core/search/server';

import { isPublicOperation, isPublicPage } from './access';
import { loadApis } from './apis';

interface SourceLike {
  getPages(): Array<{ url: string; data: { title?: string; description?: string; structuredData?: StructuredData; access?: string[] } }>;
}

/**
 * Search over guides AND API operations (title, method + path, description,
 * parameter names). Export `staticGET as GET` for static builds. With
 * `search.tags`, guides are tagged `guides` and operations `api:<id>` (the
 * filters OrbitRoot offers).
 */
export function createOrbitSearch(config: OrbitDocsConfig, source: SourceLike): Pick<SearchAPI, 'GET' | 'staticGET' | 'search'> {
  const tag = (value: string) => (config.search.tags ? { tag: value } : {});
  return createSearchAPI('advanced', {
    indexes: async (): Promise<AdvancedIndex[]> => {
      // One index serves every reader: pages and operations limited to some groups stay out of it,
      // whether frontmatter `access`, an `access.rules` entry or `apis[].access` restricts them.
      const pages: AdvancedIndex[] = source.getPages().filter((page) => isPublicPage(config, page.url, page.data.access)).map((page) => ({
        id: page.url,
        title: page.data.title ?? page.url,
        description: page.data.description,
        url: page.url,
        ...tag('guides'),
        structuredData: page.data.structuredData ?? {
          headings: [],
          contents: [{ heading: undefined, content: page.data.description ?? '' }],
        },
      }));
      const apis = await loadApis(config);
      const ops: AdvancedIndex[] = apis.flatMap((api) =>
        api.model.operations.filter((op) => isPublicOperation(config, api.id, `${api.route}/${op.slug}/`)).map((op) => ({
          id: `${api.id}/${op.slug}`,
          title: op.summary,
          description: `${op.method.toUpperCase()} ${op.path}`,
          breadcrumbs: [api.model.title, ...(op.group ? [op.group] : [])],
          url: `/reference/${api.id}/${op.slug}/`,
          ...tag(`api:${api.id}`),
          structuredData: {
            headings: [],
            contents: [
              { heading: undefined, content: `${op.method.toUpperCase()} ${op.path}` },
              ...(op.description ? [{ heading: undefined, content: op.description }] : []),
              ...op.parameters.map((p) => ({ heading: undefined, content: `${p.name} ${p.description ?? ''}` })),
            ],
          },
        })),
      );
      return [...pages, ...ops];
    },
  });
}
