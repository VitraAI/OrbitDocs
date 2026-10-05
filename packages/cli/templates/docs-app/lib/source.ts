import { orbitMdxOptions } from '@vitra-ai/orbitdocs-next/mdx-plugins';
import { orbitSourcePlugin } from '@vitra-ai/orbitdocs-next/source';
import { loader } from 'fumadocs-core/source';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { defineDocs } from 'fumadocs-mdx/macro';
import { z } from 'zod';

const docs = defineDocs({
  dir: 'content',
  // lastModified: git dates for "Last updated" (layout.lastUpdated).
  docs: {
    schema: pageSchema.extend({
      // access: groups that can read the page (private docs, see `access` in orbitdocs.config.ts).
      access: z.array(z.string()).optional(),
      // layout: landing renders the page full width with landing components (home page).
      layout: z.enum(['docs', 'landing']).optional(),
    }),
    postprocess: { includeProcessedMarkdown: true },
    lastModified: true,
    // Fumadocs' MDX defaults plus GitHub alerts (> [!NOTE], [!TIP], …) as callouts, and codeBlocks
    // from orbitdocs.config.ts. Your plugins go here, e.g. orbitMdxOptions({ remarkPlugins: [remarkMath],
    // rehypePlugins: [rehypeKatex] }); use the same options for `reference` below.
    mdxOptions: orbitMdxOptions(),
  },
  meta: { schema: metaSchema },
});

/** Guides: every .mdx file under content/, ordered by meta.json. Landing pages stay out of the sidebar. */
export const source = loader({ baseUrl: '/', source: docs.toFumadocsSource(), plugins: [orbitSourcePlugin()] });

const reference = defineDocs({
  dir: 'reference',
  docs: {
    schema: pageSchema.extend({
      title: z.string().optional(),
      /** Where the content goes in the operation: before-parameters | after-description | after-responses | aside. */
      position: z.enum(['before-parameters', 'after-description', 'after-responses', 'aside']).optional(),
      /** index.mdx only: replace the spec's description instead of adding to it. */
      replace: z.boolean().optional(),
    }),
    mdxOptions: orbitMdxOptions(),
  },
  meta: { schema: metaSchema },
});

/**
 * Extra content for the API reference:
 *   reference/<api>/index.mdx              API introduction
 *   reference/<api>/_groups/<group>.mdx    under a group heading
 *   reference/<api>/<operation>.mdx        inside one operation
 */
export const referenceContent = loader({ baseUrl: '/_reference', source: reference.toFumadocsSource() });
