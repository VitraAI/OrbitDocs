# Releasing OrbitDocs

## npm packages

The eight npm packages (`orbitdocs` and `@orbitdocs/*`) are released together, with one version, by
[Changesets](https://github.com/changesets/changesets) and the `Release` workflow
(`.github/workflows/release.yml`).

1. Every pull request with a change users will notice adds a changeset: `pnpm changeset`.
2. When changesets reach `main`, the workflow opens or updates a **chore: version packages** pull
   request. It bumps the versions, writes each package's `CHANGELOG.md` and rebuilds the
   [Changelog page](apps/docs/content/help/changelog.mdx).
3. Merging that pull request publishes the packages to npm with
   [provenance](https://docs.npmjs.com/generating-provenance-statements) and creates GitHub releases.

Pull requests opened by the workflow don't trigger the `CI` workflow (a GitHub rule for
`GITHUB_TOKEN`). Close and reopen the version pull request to run CI on it.

### Turning publishing on

Publishing is off until the npm side is ready: without it, step 3 only merges the version bump.

1. On npmjs.com, make sure the `orbitdocs` organization exists and owns the `@orbitdocs` scope, and that
   the publishing account is a member with publish rights.
2. Create a **granular access token** with read and write access to the `@orbitdocs` packages and the
   `orbitdocs` package.
3. In GitHub, **Settings → Secrets and variables → Actions**:
   - Secrets: `NPM_TOKEN` = the token.
   - Variables: `NPM_PUBLISH_ENABLED` = `true`.
4. Re-run the latest `Release` workflow on `main`, or merge the next version pull request.
5. Remove the "coming to npm soon" `banner` from `apps/docs/orbitdocs.config.ts`: the install commands in the docs work from now on.

### After the first publish: trusted publishing

Once each package exists on npm, switch from the token to
[trusted publishing](https://docs.npmjs.com/trusted-publishers): on each package's npm settings page,
add GitHub Actions as a trusted publisher (organization `VitraAI`, repository `OrbitDocs`, workflow
`release.yml`). Then delete the `NPM_TOKEN` secret.

## The self-hosted platform

`apps/platform` is private and not published to npm. It is versioned by the same changesets and gets
its own `CHANGELOG.md`; operators update with `git pull` and `docker compose up -d --build`.

## The documentation site (Vercel)

`apps/docs` is a static export, deployed by Vercel's Git integration. Its settings live in
[`apps/docs/vercel.json`](apps/docs/vercel.json).

1. In Vercel, **Add New → Project** and import `VitraAI/OrbitDocs`.
2. **Root Directory**: `apps/docs`. Leave **Include files outside the root directory** on: the build
   uses the workspace packages.
3. **Framework Preset**: Other. Install, build and output come from `vercel.json`
   (`turbo run build --filter=@orbitdocs/docs`, output `out`).
4. Deploy. Every push to `main` deploys production; every pull request gets a preview.

The demo API on the site is a snapshot of the sample app's spec, `apps/docs/demo/travel.json`. After
changing `examples/nest-sample`, run `pnpm --filter @orbitdocs/docs demo:sync` and commit the snapshot;
CI fails while it is out of date.
