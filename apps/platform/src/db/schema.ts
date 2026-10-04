import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export interface GitSettings {
  provider: 'github' | 'gitlab';
  /** `owner/repo` (GitHub) or `group/project` (GitLab). */
  repo: string;
  /** Branch that publishes production. */
  branch: string;
  /** API base: https://api.github.com, https://gitlab.com/api/v4, or your self-hosted instance. */
  apiUrl: string;
  /** Where to clone from; default derived from the provider and repo. */
  cloneUrl?: string;
  /** Access token, encrypted with PLATFORM_SECRET (AES-GCM). */
  tokenEncrypted?: string;
  /** Secret the provider signs webhooks with. */
  webhookSecret: string;
  /** Folder of the docs app inside the repo. */
  docsDir: string;
  /** Empty: install automatically from the lockfiles between the repository root and the docs app. */
  installCommand: string;
  buildCommand: string;
  /** Build output, relative to the docs app. */
  outputDir: string;
  /** Extra variables for install and build commands; each value encrypted with PLATFORM_SECRET (AES-GCM). */
  buildEnv?: Array<{ key: string; valueEncrypted: string }>;
}

/** Spectral counts for one spec of a deployment (previews included). */
export interface SpecLint {
  apiId: string;
  title: string;
  version: string;
  /** The registry revision with identical content, or null (a preview's changed spec). */
  revision: number | null;
  errors: number;
  warnings: number;
  /** The first problems, for the dashboard. */
  problems: Array<{ severity: string; code: string; message: string; path: string }>;
}

export const roleEnum = pgEnum('role', ['owner', 'admin', 'editor', 'viewer']);
export const deploymentKind = pgEnum('deployment_kind', ['production', 'preview']);

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Dashboard users. A password is optional: SSO users have none. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  /** Platform admins manage every project, users and settings. */
  isAdmin: boolean('is_admin').notNull().default(false),
  /** Deactivated by an admin or SCIM: cannot sign in. */
  active: boolean('active').notNull().default(true),
  /** The identity provider's id, when provisioned by SCIM. */
  externalId: text('external_id'),
  createdAt: created(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** Sessions issued before this are rejected (password changed or reset). */
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
});

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  /** Optional: invite straight into a project with this role. */
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('viewer'),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: created(),
});

/** A docs site: one repo's guides and APIs. */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** URL-safe name: `<slug>.<platform domain>`. */
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  /** The live deployment. */
  productionDeploymentId: uuid('production_deployment_id'),
  /** Analytics provider and its settings (built-in, Plausible, Umami, PostHog). */
  analytics: jsonb('analytics').$type<{ provider: 'builtin' | 'plausible' | 'umami' | 'posthog'; siteId?: string; host?: string }>().notNull().default({ provider: 'builtin' }),
  /** Block a publish when a spec has lint errors. */
  blockOnLint: boolean('block_on_lint').notNull().default(false),
  /** Git sync: the repository this project builds from. */
  git: jsonb('git').$type<GitSettings | null>(),
  /**
   * Secrets the hosted site's sign-in and Ask AI read (OIDC client secrets, AI keys), each
   * value encrypted with PLATFORM_SECRET (AES-GCM). The site sees only these, never the platform's env.
   */
  siteEnv: jsonb('site_env').$type<Array<{ key: string; valueEncrypted: string }>>().notNull().default([]),
  createdAt: created(),
});

export const memberships = pgTable(
  'memberships',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/** Tokens for `orbitdocs publish` from CI. Only a hash is stored. */
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** First characters, to recognise a token in the list. */
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: created(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** One published build of a project's site. */
export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: deploymentKind('kind').notNull(),
    /** Previews: their label in the URL (`mr-42`). */
    label: text('label'),
    /** Branch, MR title, commit… whatever the publisher sent. */
    meta: jsonb('meta').$type<{ branch?: string; commit?: string; message?: string; title?: string; url?: string }>().notNull().default({}),
    /** Site path prefix the build was made for (`/docs` or ''). */
    basePath: text('base_path').notNull().default(''),
    files: integer('files').notNull().default(0),
    bytes: integer('bytes').notNull().default(0),
    /** Spectral counts per spec, for production and previews. */
    lint: jsonb('lint').$type<SpecLint[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Set when a preview is closed: its files are deleted. */
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index('deployments_project_idx').on(t.projectId, t.createdAt)],
);

/** Registry: every published version of every API spec. */
export const specVersions = pgTable(
  'spec_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    apiId: text('api_id').notNull(),
    /** Increases by one per new spec content of this API. */
    revision: integer('revision').notNull(),
    /** `info.version` of the spec. */
    version: text('version').notNull(),
    title: text('title').notNull(),
    spec: jsonb('spec').notNull(),
    /** SHA-256 of the canonical spec: an unchanged spec makes no new revision. */
    hash: text('hash').notNull(),
    operations: integer('operations').notNull().default(0),
    lint: jsonb('lint').$type<{ errors: number; warnings: number; problems: Array<{ severity: string; code: string; message: string; path: string }> }>().notNull(),
    deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
    /** Only production publishes make registry versions; previews are linked here when identical. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: created(),
  },
  (t) => [uniqueIndex('spec_versions_rev_idx').on(t.projectId, t.apiId, t.revision)],
);

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull().unique(),
  /** The DNS record points at the platform (checked with a TXT/CNAME lookup). */
  verified: boolean('verified').notNull().default(false),
  verifyToken: text('verify_token').notNull(),
  createdAt: created(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id'),
    /** Kept even after the user is deleted. */
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    target: text('target'),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    ip: text('ip'),
  },
  (t) => [index('audit_at_idx').on(t.at)],
);

/** Built-in analytics: page views and Ask AI questions (no cookies, visitor hashed per day). */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    type: text('type').notNull(),
    path: text('path'),
    /** Search or Ask AI text. */
    query: text('query'),
    /** Ask AI: how many sources the answer had (0 = docs did not cover it). */
    results: integer('results'),
    referrer: text('referrer'),
    visitor: text('visitor'),
  },
  (t) => [index('analytics_project_at_idx').on(t.projectId, t.at)],
);

export const buildStatus = pgEnum('build_status', ['queued', 'running', 'succeeded', 'failed', 'cancelled']);

/** Git sync builds: one per push to the production branch or per pull/merge request update. */
export const builds = pgTable(
  'builds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: deploymentKind('kind').notNull(),
    /** Previews: `mr-42` / `pr-42`. */
    label: text('label'),
    /** The pull/merge request number, for comments. */
    request: integer('request'),
    branch: text('branch').notNull(),
    commit: text('commit').notNull(),
    message: text('message'),
    status: buildStatus('status').notNull().default('queued'),
    log: text('log').notNull().default(''),
    deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
    trigger: text('trigger').notNull(),
    createdAt: created(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('builds_project_idx').on(t.projectId, t.createdAt)],
);
