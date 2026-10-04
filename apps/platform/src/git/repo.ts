import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import type { GitSettings } from '../db/schema';

/** The repository's HTTPS base (`https://host/owner/repo`), or null for a local clone path. */
function httpsBase(git: Pick<GitSettings, 'provider' | 'repo' | 'apiUrl' | 'cloneUrl'>): string | null {
  if (git.cloneUrl) return /^https?:\/\//.test(git.cloneUrl) ? git.cloneUrl.replace(/\.git\/?$/, '').replace(/\/$/, '') : null;
  const api = new URL(git.apiUrl || (git.provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com/api/v4'));
  let host = api.host;
  // GitHub.com and GitHub Enterprise Cloud with data residency: https://api.<host> → https://<host>.
  if (git.provider === 'github' && host.startsWith('api.')) host = host.slice(4);
  // GitHub Enterprise Server (/api/v3) and GitLab (/api/v4), possibly under a path prefix.
  const prefix = api.pathname.replace(/\/+$/, '').replace(/\/api\/v\d+$/, '');
  return `${api.protocol}//${host}${prefix}/${git.repo}`;
}

/**
 * Where to clone from, without credentials: the configured clone URL (a local path in
 * development), or derived from the API URL (GitHub, GitHub Enterprise, GitLab, self-managed GitLab).
 */
export function cloneUrl(git: Pick<GitSettings, 'provider' | 'repo' | 'apiUrl' | 'cloneUrl'>): string {
  return git.cloneUrl || `${httpsBase(git)}.git`;
}

/** The repository's page in the browser, or null when it is cloned from a local path. */
export function repoWebUrl(git: Pick<GitSettings, 'provider' | 'repo' | 'apiUrl' | 'cloneUrl'>): string | null {
  const base = httpsBase(git);
  if (!base) return null;
  // Credentials in a configured clone URL never reach the browser.
  const u = new URL(base);
  u.username = '';
  u.password = '';
  return u.href.replace(/\/$/, '');
}

/**
 * Git config for the clone and fetch only, passed in the environment: the token is never in the
 * command line, the log or `.git/config`, so install and build commands cannot read it.
 */
export function gitAuthEnv(git: Pick<GitSettings, 'provider'>, token: string | undefined, url: string): Record<string, string> {
  if (!token || !/^https?:\/\//.test(url)) return {};
  const user = git.provider === 'github' ? 'x-access-token' : 'oauth2';
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`,
  };
}

/** Variables passed through from the platform's environment to Git and build commands. Nothing else is. */
const PASS = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  // Node.js and TLS: trust the same certificates and run the same Node.js.
  'NODE_EXTRA_CA_CERTS',
  'NODE_VERSION',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  // Package managers: caches, registries, Corepack.
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_REGISTRY',
  'NPM_CONFIG_PREFIX',
  'COREPACK_HOME',
  'COREPACK_ENABLE_DOWNLOAD_PROMPT',
  'COREPACK_ENABLE_STRICT',
  'PNPM_HOME',
  'YARN_CACHE_FOLDER',
  'BUN_INSTALL',
  // Outbound proxies.
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
]);

/** Set on every build command; project variables cannot change them. */
export const RESERVED_BUILD_ENV = ['CI', 'ORBITDOCS_PLATFORM_BUILD', 'GIT_TERMINAL_PROMPT', 'PATH', 'HOME'];

/**
 * The environment of Git and build commands: an allowlist of the platform's own variables
 * (never PLATFORM_SECRET, DATABASE_URL, SSO secrets…), then the project's build variables,
 * then the fixed ones. NODE_ENV is not passed: `production` would make `npm ci` skip devDependencies.
 */
export function buildEnv(platform: NodeJS.ProcessEnv, project: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(platform)) {
    if (v !== undefined && (PASS.has(k.toUpperCase()) || /^npm_config_(cache|registry|prefix)$/i.test(k))) env[k] = v;
  }
  for (const [k, v] of Object.entries(project)) if (!RESERVED_BUILD_ENV.includes(k)) env[k] = v;
  return { ...env, CI: 'true', ORBITDOCS_PLATFORM_BUILD: '1', GIT_TERMINAL_PROMPT: '0' };
}

const LOCKFILES: Array<[string, (dir: string) => string]> = [
  ['pnpm-lock.yaml', () => 'pnpm install --frozen-lockfile'],
  ['bun.lock', () => 'bun install --frozen-lockfile'],
  ['bun.lockb', () => 'bun install --frozen-lockfile'],
  ['yarn.lock', (dir) => (existsSync(join(dir, '.yarnrc.yml')) ? 'yarn install --immutable' : 'yarn install --frozen-lockfile')],
  ['package-lock.json', () => 'npm ci'],
  ['npm-shrinkwrap.json', () => 'npm ci'],
];

/** The install command for a folder from its lockfile, or null without one. */
export function installFor(dir: string): string | null {
  for (const [file, command] of LOCKFILES) if (existsSync(join(dir, file))) return command(dir);
  return null;
}

const isWorkspaceRoot = (dir: string) => {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return true;
  try {
    return Boolean((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { workspaces?: unknown }).workspaces);
  } catch {
    return false;
  }
};

/**
 * The automatic install (an empty Install Command): `orbitdocs build` needs the docs app and the
 * Nest app one folder up installed. Every folder from the repository root down to the docs folder
 * that has a lockfile is installed with its package manager, top-down; a workspace root installs
 * the folders below it at once. Folders without any lockfile above them get `npm install`.
 * Returns `[folder relative to the repository, command]` pairs.
 */
export function autoInstall(repo: string, docs: string): Array<[string, string]> {
  const chain: string[] = [];
  for (let dir = docs; ; dir = dirname(dir)) {
    chain.unshift(dir);
    if (dir === repo || !dir.startsWith(repo + sep)) break;
  }
  const steps: Array<[string, string]> = [];
  let workspace = false;
  for (const dir of chain) {
    if (!existsSync(join(dir, 'package.json'))) continue;
    const command = installFor(dir);
    if (command) {
      steps.push([relative(repo, dir) || '.', command]);
      if (isWorkspaceRoot(dir)) workspace = true;
    } else if (!workspace && (dir === docs || dir === dirname(docs))) {
      steps.push([relative(repo, dir) || '.', 'npm install']);
    }
  }
  return steps;
}
