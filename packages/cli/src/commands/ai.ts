import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { buildAiManifest } from '@vitra-ai/orbitdocs-ai';
import { referenceRoute, specFile } from '@vitra-ai/orbitdocs-core';
import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';
import { buildReferenceModel, loadDocument } from '@vitra-ai/orbitdocs-openapi';
import { parse } from 'yaml';

import { log } from '../util';

function mdxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? mdxFiles(f) : /\.mdx?$/.test(n) ? [f] : [];
  });
}

/** Guides as Markdown: frontmatter read, MDX imports and exports dropped. */
export function guidePages(contentDir: string) {
  return mdxFiles(contentDir).map((file) => {
    const raw = readFileSync(file, 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    const fm = (m ? parse(m[1]!) : {}) as { title?: string; description?: string };
    const body = (m ? raw.slice(m[0].length) : raw).replace(/^(import|export)\s.*$/gm, '').trim();
    // Route groups `(name)` are not part of the URL; `index` is the folder itself.
    const slugs = relative(contentDir, file)
      .replace(/\.mdx?$/, '')
      .split(/[\\/]/)
      .filter((s) => s !== 'index' && !/^\(.+\)$/.test(s));
    return { url: `/${slugs.join('/')}`, title: fm.title ?? slugs.at(-1) ?? 'Home', description: fm.description, markdown: body };
  });
}

/**
 * Writes `.orbitdocs/ai.json` (no secrets): guides, API operations and tools
 * for Ask AI and the MCP servers. `null` when the config has no `ai` section.
 */
export async function writeAiManifest(loaded: LoadedConfig): Promise<void> {
  const { config, dir } = loaded;
  mkdirSync(join(dir, '.orbitdocs'), { recursive: true });
  const file = join(dir, '.orbitdocs', 'ai.json');
  if (!config.ai) {
    writeFileSync(file, 'null\n');
    return;
  }
  const apis = [];
  for (const api of config.apis) {
    const spec = specFile(dir, api.id);
    if (!existsSync(spec)) continue;
    const { document } = await loadDocument(readFileSync(spec, 'utf8'));
    if (api.title) document.info.title = api.title;
    if (api.description) document.info.description = api.description;
    apis.push({ id: api.id, route: referenceRoute(api.id), model: buildReferenceModel(document, api.id) });
  }
  const manifest = buildAiManifest({ site: config.site, output: config.output, ai: config.ai, guides: guidePages(join(dir, 'content')), apis });
  writeFileSync(file, `${JSON.stringify(manifest)}\n`);
  log.ok(`AI index: ${manifest.pages.length} pages, ${manifest.apis.reduce((n, a) => n + a.operations.length, 0)} API tools → .orbitdocs/ai.json`);
}
