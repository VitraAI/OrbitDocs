import { defineConfig } from '@vitra-ai/orbitdocs-next/config';

export default defineConfig({
  site: {
    title: 'Orbit Travel',
    description: 'Book interstellar flights from your own app.',
    logo: { light: '/logo-light.png', dark: '/logo-dark.png' },
  },
  apis: [
    {
      id: 'travel',
      title: 'Orbit Travel API',
      version: '1.0.0',
      description:
        'Search destinations, flights and seat maps, book and pay, manage saved passengers and Orbit Miles, and receive booking and payment events by webhook or from the Events API.\n\nEvery request needs an API key in the `x-api-key` header, or an OAuth access token from Create an access token in `Authorization: Bearer …`. Each credential can make 60 requests a minute.',
      source: {
        nest: {
          module: 'dist/app.module.js',
          build: 'nest build',
          versioning: { type: 'uri', prefix: 'v' },
        },
      },
      servers: [
        { url: 'http://localhost:3010', description: 'Local' },
        { url: 'https://api.orbit-travel.example', description: 'Production' },
      ],
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Your API key. The sample server accepts `otk_test_4f9a2c1b8e7d6a5f`.',
        },
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An OAuth access token from `POST /v1/oauth/token` (client credentials). The sample server accepts client `oc_test_orbit_demo` with secret `ocs_test_5e8d2a7c9b1f`. Tokens last an hour.',
        },
      },
      // Each route declares its own security in the Nest app (API key OR bearer token;
      // none on the token endpoint), so there is no API-wide `security` here.
      completeness: 'error',
    },
  ],
  navigation: {
    // The home page is a landing page, so "Guides" opens the first guide.
    guides: { text: 'Guides', url: '/quickstart' },
    header: [{ text: 'Status', url: 'https://status.orbit-travel.example' }],
  },
  access: {
    mode: 'public',
    groups: {
      staff: { domains: ['orbit-travel.example'] },
      partners: { emails: ['pat@partner.example'] },
    },
    // Staff sign in with company SSO: google, microsoft, okta, auth0, clerk or keycloak.
    // Here a local Keycloak-style realm (pnpm mock-idp).
    providers: [
      { type: 'keycloak', name: 'Orbit SSO', url: 'http://localhost:8090', realm: 'orbit', clientId: 'orbit-docs', clientSecretEnv: 'MOCK_OIDC_SECRET' },
    ],
    // Customers reuse their Orbit Travel account: supabase, clerk, firebase or appwrite.
    // Here a local Supabase-style sign-in (pnpm mock-idp).
    appSession: {
      type: 'supabase',
      name: 'Orbit Travel account',
      projectUrl: 'http://localhost:8090',
      loginUrl: 'http://localhost:8090/app/login',
      logoutUrl: 'http://localhost:8090/app/logout',
    },
    loginPage: { title: 'Sign in to Orbit Travel docs' },
    personalization: { url: 'http://localhost:3010/internal/docs-user', secretEnv: 'DOCS_HOOK_SECRET' },
    audit: { file: 'docs-audit.jsonl' },
  },
  // Ask AI, docs MCP (/docs/mcp) and API MCP (/docs/mcp/travel). Use your own provider and key in
  // production, e.g. { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKeyEnv: 'ANTHROPIC_API_KEY' }.
  // Here a local OpenAI-compatible mock (node scripts/mock-llm.mjs).
  ai: {
    provider: 'openai-compatible',
    model: 'orbit-mock',
    baseUrl: 'http://localhost:8091/v1',
    apiKeyEnv: 'DOCS_LLM_KEY',
    askAi: {
      suggestions: ['How do I authenticate?', 'How do I paginate results?', 'How do I verify webhook signatures?'],
    },
  },
  // `orbitdocs sdk` builds these; each SDK's samples show up in the reference.
  sdks: {
    typescript: { package: '@orbit-travel/sdk' },
    python: { package: 'orbit_travel' },
    go: { module: 'github.com/orbit-travel/orbit-go' },
  },
  // `orbitdocs mock`: a mock of the API on :4010 that checks requests against the spec.
  mock: {
    // This sample runs locally, so readers can pick the mock in the client and the reference.
    url: 'http://localhost:4010',
    handlers: {
      // Bookings made against the mock are remembered and listed.
      'create-a-booking': "return store.create('bookings', { id: 'bk_' + faker.string.alphanumeric(6), status: 'pending', ...req.body })",
      'list-bookings': "return { data: store.list('bookings'), page: { nextCursor: null, hasMore: false } }",
      // Tokens from the mock work against the mock (it only checks a bearer token is present).
      'create-an-access-token':
        "return { access_token: 'oat_test_' + faker.string.alphanumeric(24), token_type: 'Bearer', expires_in: 3600, scope: (req.body && req.body.scope) || 'bookings:read bookings:write' }",
      // Saved passengers are remembered and listed too.
      'create-a-passenger':
        "const now = new Date().toISOString(); return store.create('passengers', { id: 'psg_' + faker.string.alphanumeric(6), passport: null, loyaltyNumber: null, preferences: { seat: 'no_preference', meal: 'standard', cryosleep: false }, metadata: {}, ...req.body, createdAt: now, updatedAt: now })",
      'list-passengers': "return { data: store.list('passengers'), page: { nextCursor: null, hasMore: false } }",
    },
  },
  // Static files served by the Nest app; ORBITDOCS_MODE=server runs it as a Next server (Vercel, Docker).
  output: { mode: process.env.ORBITDOCS_MODE === 'server' ? 'server' : 'static', basePath: '/docs' },
});
