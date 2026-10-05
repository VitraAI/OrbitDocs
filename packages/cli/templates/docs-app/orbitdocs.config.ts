import { defineConfig } from '@vitra-ai/orbitdocs-next/config';

export default defineConfig({
  site: {
    title: '{{TITLE}}',
    description: 'Guides and API reference for {{TITLE}}.',
    // Your logo from public/, one file or a light and a dark version:
    // logo: { light: '/logo-light.png', dark: '/logo-dark.png' },
  },
  apis: [
    {
      id: '{{API_ID}}',
      title: '{{TITLE}} API',
      // Extracted from your Nest app in preview mode: no database or queue is started.
      source: {
        nest: {
          {{NEST_SOURCE}},
        },
      },
      servers: [{ url: 'http://localhost:3000', description: 'Local' }],
      // Fail the build when an operation lacks descriptions or examples: 'error' | 'warn' | 'off'.
      completeness: 'warn',
    },
  ],
  // 'static' builds plain files for any host; basePath must match where they are served
  // (e.g. '/docs' when your Nest app serves them with mountOrbitDocs).
  output: { mode: 'static', basePath: '' },
});
