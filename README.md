<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/docs/public/logo-dark.png">
    <img src="apps/docs/public/logo-light.png" alt="OrbitDocs" height="64">
  </picture>
</p>

<p align="center">
  Built and maintained by
  <a href="https://vitra.ai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="apps/docs/public/vitra/vitra-logo-white.png">
      <img src="apps/docs/public/vitra/vitra-logo.png" alt="Vitra.ai" height="20" align="center">
    </picture>
  </a>
</p>

# OrbitDocs

Open-source, self-hosted API documentation for NestJS — a Scalar-style reference
generated from your controllers, guides in MDX next to your code, and one build
you can deploy to Vercel, any static host, Docker, or inside your Nest server.

MIT licensed. No accounts, no pricing tiers.

Documentation: **[orbitdocs.vitra.ai](https://orbitdocs.vitra.ai)**

```bash
npm install @vitra-ai/orbitdocs-nestjs
npx @vitra-ai/orbitdocs init      # creates docs/ (a Next.js app) in your Nest project
cd docs && npm install
npm run dev             # http://localhost:3000
npm run build           # static site in docs/out
```

## Packages

| Package | |
| --- | --- |
| [`@vitra-ai/orbitdocs-nestjs`](packages/nestjs) | `@DocsOperation` and friends, preview-mode spec extraction, `mountOrbitDocs` |
| [`@vitra-ai/orbitdocs-openapi`](packages/openapi) | Filter, standard errors, completeness checks, reference model, examples |
| [`@vitra-ai/orbitdocs-ui`](packages/ui) | Scalar-style API reference (React + HeroUI) and theme |
| [`@vitra-ai/orbitdocs-next`](packages/next) | Next.js/Fumadocs integration: config plugin, pages, search, llms.txt |
| [`@vitra-ai/orbitdocs-core`](packages/core) | Config schema and loader |
| [`@vitra-ai/orbitdocs`](packages/cli) | `init`, `dev`, `extract`, `check`, `build`, `deploy` |

## Repository

- `apps/docs` — OrbitDocs' own documentation, built with OrbitDocs.
- `examples/nest-sample` — a sample NestJS API (Orbit Travel) with its docs app in `docs/`,
  served by the API itself at `/docs`.

```bash
pnpm install
pnpm build && pnpm test
cp examples/nest-sample/.env.example examples/nest-sample/.env   # then fill in the secrets
cd examples/nest-sample && pnpm build && cd docs && pnpm build && cd .. && node --env-file=.env dist/main.js
# → http://localhost:3010/docs
```

`examples/nest-sample/.env.example` lists every environment variable the sample reads, what
it does, whether it is required and its default.

Requires Node 22+.

## Changelog

Every change readers or users will notice adds a changeset: run `pnpm changeset`, pick the
packages it touches and the bump (patch, minor, major), and write one or two sentences for
the changelog. Commit the file in `.changeset/` with the change.

At release, `pnpm version-packages` bumps the versions, writes each package's `CHANGELOG.md`
and rebuilds the [Changelog page](apps/docs/content/help/changelog.mdx); `pnpm release` builds
and publishes to npm. The npm packages share one version; the platform (`apps/platform`) has
its own.

## Built by Vitra.ai

OrbitDocs is built and maintained by [Vitra.ai](https://vitra.ai) and released under the
[MIT License](LICENSE). Issues and pull requests are welcome at
[github.com/VitraAI/OrbitDocs](https://github.com/VitraAI/OrbitDocs).

