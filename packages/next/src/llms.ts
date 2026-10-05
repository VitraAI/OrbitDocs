import type { OrbitDocsConfig } from '@vitra-ai/orbitdocs-core';
import { referenceMarkdown } from '@vitra-ai/orbitdocs-ui';

import { isPublicOperation, isPublicPage } from './access';
import { type LoadedApi, loadApis } from './apis';

interface SourceLike {
  getPages(): Array<{
    url: string;
    data: { title?: string; description?: string; access?: string[]; getText?: (type: 'raw' | 'processed') => Promise<string> };
  }>;
}

function absolute(config: OrbitDocsConfig, path: string): string {
  return `${config.site.url ?? ''}${config.output.basePath}${path}`;
}

/** The API with only the operations every reader can open; undefined when none is left. */
function publicPart(config: OrbitDocsConfig, api: LoadedApi): LoadedApi | undefined {
  const open = (op: { slug: string }) => isPublicOperation(config, api.id, `${api.route}/${op.slug}/`);
  const operations = api.model.operations.filter(open);
  if (!operations.length) return undefined;
  if (operations.length === api.model.operations.length) return api;
  const groups = api.model.groups.map((g) => ({ ...g, operations: g.operations.filter(open) })).filter((g) => g.operations.length);
  return { ...api, model: { ...api.model, operations, groups } };
}

/** `/llms.txt` and `/llms-full.txt` (https://llmstxt.org) for guides and every API. */
export function createLlms(config: OrbitDocsConfig, source: SourceLike) {
  // One file for every reader: pages and operations limited to some groups are left out,
  // whether frontmatter `access`, an `access.rules` entry or `apis[].access` restricts them.
  const pages = () => source.getPages().filter((p) => isPublicPage(config, p.url, p.data.access));
  const apis = async () => (await loadApis(config)).map((api) => publicPart(config, api)).filter((a): a is LoadedApi => Boolean(a));
  return {
    async index(): Promise<string> {
      const lines = [`# ${config.site.title}`, '', config.site.description ? `> ${config.site.description}\n` : '', '## Guides', ''];
      for (const p of pages()) {
        lines.push(`- [${p.data.title ?? p.url}](${absolute(config, p.url)})${p.data.description ? `: ${p.data.description}` : ''}`);
      }
      for (const api of await apis()) {
        lines.push('', `## ${api.model.title}`, '');
        for (const op of api.model.operations) {
          lines.push(`- [${op.summary}](${absolute(config, `${api.route}/${op.slug}/`)}): \`${op.method.toUpperCase()} ${op.path}\``);
        }
      }
      return lines.join('\n');
    },
    async full(): Promise<string> {
      const parts: string[] = [];
      for (const p of pages()) {
        const text = p.data.getText ? await p.data.getText('processed') : (p.data.description ?? '');
        parts.push(`# ${p.data.title ?? p.url} (${absolute(config, p.url)})\n\n${text}`);
      }
      for (const api of await apis()) parts.push(referenceMarkdown(api.model));
      return parts.join('\n\n---\n\n');
    },
  };
}
