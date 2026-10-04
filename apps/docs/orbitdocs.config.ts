import { defineConfig } from '@orbitdocs/next/config';

export default defineConfig({
  // Until the packages are on npm, the install commands in these docs don't work yet.
  // Remove this banner on the day of the first npm release.
  banner: {
    content: 'OrbitDocs packages are coming to npm soon. Until then, run it from the GitHub repo →',
    url: 'https://github.com/VitraAI/OrbitDocs',
    dismissible: false,
  },
  site: {
    title: 'OrbitDocs',
    url: 'https://orbitdocs.vitra.ai',
    logo: { light: '/logo-light.png', dark: '/logo-dark.png' },
    description: 'Open-source API documentation for NestJS: guides in MDX, a Scalar-style reference, deploy anywhere.',
    github: 'https://github.com/VitraAI/OrbitDocs',
  },
  navigation: {
    guides: { text: 'Docs', url: '/get-started' },
    footer: {
      description: 'Open-source API docs for NestJS. A Scalar-style reference, MDX guides, an API client, private docs, Ask AI and SDKs. Self-hosted, free, MIT.',
      columns: [
        {
          title: 'Product',
          links: [
            { text: 'API reference', url: '/api-reference' },
            { text: 'API client', url: '/api-client' },
            { text: 'Private docs', url: '/private-docs' },
            { text: 'Ask AI and MCP', url: '/ai' },
            { text: 'SDKs and mock server', url: '/sdks' },
            { text: 'Self-hosted platform', url: '/platform' },
          ],
        },
        {
          title: 'Docs',
          links: [
            { text: 'Quickstart', url: '/get-started/quickstart' },
            { text: 'How it works', url: '/get-started/how-it-works' },
            { text: 'NestJS', url: '/nestjs' },
            { text: 'Landing pages', url: '/writing/landing-pages' },
            { text: 'Deploy', url: '/deploy' },
          ],
        },
        {
          title: 'Reference',
          links: [
            { text: 'Configuration', url: '/docs-reference/configuration' },
            { text: 'CLI', url: '/docs-reference/cli' },
            { text: 'Decorators', url: '/docs-reference/decorators' },
            { text: 'Components', url: '/docs-reference/components' },
            { text: 'Environment variables', url: '/docs-reference/environment-variables' },
          ],
        },
        {
          title: 'Demo and help',
          links: [
            { text: 'Live API reference', url: '/reference/demo' },
            { text: 'Try the API client', url: '/client' },
            { text: 'Troubleshooting', url: '/help/troubleshooting' },
            { text: 'FAQ', url: '/help/faq' },
            { text: 'OrbitDocs vs Scalar', url: '/help/scalar-comparison' },
          ],
        },
      ],
      links: [
        { text: 'MIT License', url: 'https://github.com/VitraAI/OrbitDocs/blob/main/LICENSE' },
        { text: 'llms.txt', url: '/llms.txt', external: true },
        { text: 'Brand', url: '/brand' },
      ],
      copyright: '© 2026 Vitra.ai and OrbitDocs contributors',
      poweredBy: false,
      builtBy: { name: 'Vitra.ai', url: 'https://vitra.ai', logo: { light: '/vitra/vitra-logo.png', dark: '/vitra/vitra-logo-white.png' } },
    },
  },
  apis: [
    {
      // A spec file works too: a snapshot of the sample Orbit Travel API
      // (examples/nest-sample), refreshed with `pnpm demo:sync`.
      id: 'demo',
      title: 'Demo: Orbit Travel API',
      source: { file: 'demo/travel.json' },
      completeness: 'off',
      // A fictional API: no server answers, so readers copy requests instead of sending them.
      send: false,
    },
  ],
  output: { mode: 'static', basePath: '' },
});
