# OrbitDocs platform: API, dashboard and site hosting in one image.
# Built from the monorepo root: docker build -f apps/platform/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@vitra-ai/orbitdocs-platform..." --filter "@vitra-ai/orbitdocs-platform-web..."
# The platform's own packages, then the server and the dashboard.
RUN pnpm --filter "@vitra-ai/orbitdocs-platform^..." run build \
 && pnpm --filter @vitra-ai/orbitdocs-platform-web run build \
 && cd apps/platform && npx nest build
# Production dependencies only, with the workspace packages copied in.
RUN pnpm --filter @vitra-ai/orbitdocs-platform deploy --prod --legacy /deploy

FROM node:22-bookworm-slim
# git clones repositories for Git sync builds; pnpm runs their install commands.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends git ca-certificates > /dev/null && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /repo/apps/platform/dist ./dist
COPY --from=build /repo/apps/platform/drizzle ./drizzle
COPY --from=build /repo/apps/platform/web/out ./web/out
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "dist/main.js"]
