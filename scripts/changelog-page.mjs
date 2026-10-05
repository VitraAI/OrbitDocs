// Builds apps/docs/content/help/changelog.mdx from the CHANGELOG.md files that
// `changeset version` writes. Run by `pnpm version-packages`; run it alone with
// `pnpm changelog:page`.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'apps/docs/content/help/changelog.mdx');

/** The npm packages, released together under one version (`fixed` in .changeset/config.json). */
const packages = readdirSync(join(root, 'packages'))
  .map((dir) => join(root, 'packages', dir))
  .filter(
    (dir) =>
      existsSync(join(dir, 'CHANGELOG.md')) &&
      !JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).private,
  );
const platform = join(root, 'apps/platform');

const KINDS = {
  'Major Changes': 'Breaking changes',
  'Minor Changes': 'Features',
  'Patch Changes': 'Fixes',
  'Initial release': 'Initial release',
};
const ORDER = ['Initial release', 'Breaking changes', 'Features', 'Fixes'];

/** `{ version: { kind: [entry] } }` from one CHANGELOG.md, without dependency-bump lines. */
function parse(file) {
  const releases = {};
  let version;
  let kind;
  let entry;
  const flush = () => {
    if (version && kind && entry) (releases[version][kind] ??= []).push(entry.trim());
    entry = undefined;
  };
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const v = /^## (\S+)/.exec(line);
    const h = /^### (.+)/.exec(line);
    if (v) {
      flush();
      version = v[1];
      releases[version] = {};
      kind = undefined;
    } else if (h) {
      flush();
      kind = KINDS[h[1].trim()] ?? h[1].trim();
    } else if (/^- /.test(line)) {
      flush();
      // "- Updated dependencies" / "- @vitra-ai/orbitdocs-ai@0.2.0" (and their lists): dependencies moved with the release.
      if (!/^- (@vitra-ai\/orbitdocs(-[\w-]+)?@\d|Updated dependencies)/.test(line))
        entry = line.slice(2).replace(/^[0-9a-f]{7,}: /, '');
      else entry = undefined;
    } else if (
      entry !== undefined &&
      /^\s+\S/.test(line) &&
      !/^\s+- @vitra-ai\/orbitdocs(-[\w-]+)?@\d/.test(line)
    ) {
      entry += `\n${line}`;
    }
  }
  flush();
  return releases;
}

/** MDX treats `{` and `<` as code: escape them outside inline code. */
const mdx = (text) =>
  text
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/[{}]/g, (c) => `\\${c}`).replace(/</g, '&lt;')))
    .join('');

const semverDesc = (a, b) => {
  const pa = a.split(/[.-]/).map((n) => (Number.isNaN(Number(n)) ? n : Number(n)));
  const pb = b.split(/[.-]/).map((n) => (Number.isNaN(Number(n)) ? n : Number(n)));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++)
    if (pa[i] !== pb[i])
      return pa[i] === undefined ? -1 : pb[i] === undefined ? 1 : pa[i] > pb[i] ? -1 : 1;
  return 0;
};

/** One section per version; an entry several packages share is listed once, with each package named. */
function render(sources, headingLevel) {
  const merged = {};
  for (const { name, releases } of sources)
    for (const [version, kinds] of Object.entries(releases))
      for (const [kind, entries] of Object.entries(kinds))
        for (const entry of entries) {
          const byEntry = ((merged[version] ??= {})[kind] ??= new Map());
          byEntry.set(entry, [...new Set([...(byEntry.get(entry) ?? []), name])]);
        }
  const h = '#'.repeat(headingLevel);
  return Object.keys(merged)
    .sort(semverDesc)
    .map((version) => {
      const kinds = Object.keys(merged[version]).sort(
        (a, b) => ((ORDER.indexOf(a) + 99) % 99) - ((ORDER.indexOf(b) + 99) % 99),
      );
      const body = kinds
        .map((kind) => {
          // The first release lists what each package does: one group per package reads better.
          if (kind === 'Initial release' && sources.length > 1) {
            const groups = sources
              .map(({ name }) => [
                name,
                [...merged[version][kind]]
                  .filter(([, names]) => names.includes(name))
                  .map(([entry]) => `- ${mdx(entry)}`),
              ])
              .filter(([, items]) => items.length)
              .map(([name, items]) => `**\`${name}\`**\n\n${items.join('\n')}`);
            return `${h}# ${kind}\n\n${groups.join('\n\n')}`;
          }
          const items = [...merged[version][kind]].map(([entry, names]) => {
            const label = sources.length > 1 ? ` (${names.map((n) => `\`${n}\``).join(', ')})` : '';
            const [first, ...rest] = mdx(entry).split('\n');
            return [`- ${first}${label}`, ...rest].join('\n');
          });
          return `${h}# ${kind}\n\n${items.join('\n')}`;
        })
        .join('\n\n');
      return `${h} ${version}\n\n${body || 'No changes in this release.'}`;
    })
    .join('\n\n');
}

const npm = packages.map((dir) => ({
  name: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name,
  releases: parse(join(dir, 'CHANGELOG.md')),
}));
const page = `---
title: Changelog
description: What changed in each OrbitDocs release, for the npm packages and the self-hosted platform.
---

{/* Generated by scripts/changelog-page.mjs from each package's CHANGELOG.md. Don't edit this page: add a changeset (pnpm changeset). */}

The npm packages (\`@vitra-ai/orbitdocs\` and \`@vitra-ai/orbitdocs-*\`) are released together and share one version: install the same version of each. The self-hosted platform has its own versions.

## npm packages

${render(npm, 3)}
${
  existsSync(join(platform, 'CHANGELOG.md'))
    ? `
## Self-hosted platform

${render([{ name: '@vitra-ai/orbitdocs-platform', releases: parse(join(platform, 'CHANGELOG.md')) }], 3)}
`
    : ''
}`;
writeFileSync(out, page);
console.log(`Wrote ${out.slice(root.length + 1)}`);
