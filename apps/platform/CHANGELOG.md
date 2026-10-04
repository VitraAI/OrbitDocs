# @orbitdocs/platform

## 0.1.1

### Patch Changes

- Updated dependencies [f0882a8]
- Updated dependencies [f0bd3ea]
- Updated dependencies [f0bd3ea]
  - @orbitdocs/openapi@0.2.0
  - @orbitdocs/ai@0.2.0
  - @orbitdocs/auth@0.2.0

## 0.1.0

### Initial release

- Self-hosted platform: a dashboard with projects, production and preview deployments, rollback, an API registry with lint, analytics and an audit log.
- Git sync with GitHub and GitLab (including self-managed), with a build queue on pg-boss, commit statuses and preview comments.
- Team roles, invitations, password and SSO sign-in, and SCIM provisioning.
- Custom domains with automatic TLS (Caddy), and Docker Compose deployment.
- Encrypted per-project build variables and site environment variables; hosted sites never see the platform's own environment.
- Hosted sites can't reach private, loopback or link-local addresses; `SITE_OUTBOUND_ALLOW` lists the exceptions.
