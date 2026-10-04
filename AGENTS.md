<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Changelog

Every change users of OrbitDocs will notice needs a changeset in `.changeset/` (a feature, a fix, a changed default, a security fix, a new config key). Write it like `pnpm changeset` would:

```md
---
'@orbitdocs/next': minor
'@orbitdocs/platform': patch
---

One or two plain sentences on what changed for the user, and what to do if they must act.
```

- List every package the change touches. The npm packages are released together, so the highest bump among them wins; `@orbitdocs/platform` is versioned on its own.
- `minor` for new features and changed defaults, `patch` for fixes, `major` for breaking changes (after 1.0).
- Skip changesets for internal-only work: tests, refactors, CI, the docs site (`apps/docs`) and the examples.
- Never edit a `CHANGELOG.md` or `apps/docs/content/help/changelog.mdx` by hand: `pnpm version-packages` writes them.
