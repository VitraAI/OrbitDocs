import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { specFile } from '@vitra-ai/orbitdocs-core';
import type { LoadedConfig } from '@vitra-ai/orbitdocs-core/loader';
import { buildReferenceModel, loadDocument } from '@vitra-ai/orbitdocs-openapi';

/** Every .md/.mdx file under `dir`. */
function contentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return contentFiles(full);
    return /\.mdx?$/.test(name) ? [full] : [];
  });
}

interface Reference {
  kind: 'link' | 'endpoint';
  api: string;
  op?: string;
}

/**
 * One JSX attribute from a tag's attribute list: the string for `name="v"`,
 * `name='v'` or `name={"v"}`, `null` for any other expression (not checkable
 * statically) and `undefined` when the attribute is absent.
 */
function attribute(attrs: string, name: string): string | null | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)')\\s*\\}|(\\{))`).exec(attrs);
  if (!m) return undefined;
  return m[5] ? null : (m[1] ?? m[2] ?? m[3] ?? m[4]!);
}

/** `op:` links and `<Endpoint>` tags in an MD/MDX file, skipping code (examples in the docs are not links). */
export function references(source: string): Reference[] {
  const text = source.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  const refs: Reference[] = [];
  for (const m of text.matchAll(/\]\(op:([a-z0-9-]+)(?:\/([a-z0-9-]+))?\)/g)) refs.push({ kind: 'link', api: m[1]!, op: m[2] });
  // Attributes may come in any order, quoted either way, and span lines.
  for (const m of text.matchAll(/<Endpoint\b([^>]*?)\/?>/g)) {
    const api = attribute(m[1]!, 'api');
    const op = attribute(m[1]!, 'op');
    // `<Endpoint>` with neither prop is prose (e.g. in a card description); a prop set from a variable can't be checked here.
    if (api === null || op === null || (api === undefined && op === undefined)) continue;
    refs.push({ kind: 'endpoint', api: api ?? '', op: op ?? '' });
  }
  return refs;
}

/**
 * Problems a build would ship: missing specs, `op:` links and `<Endpoint>`s
 * pointing at operations that no longer exist.
 */
export async function check(loaded: LoadedConfig): Promise<string[]> {
  const { config, dir } = loaded;
  const problems: string[] = [];
  const ops = new Map<string, Set<string>>();
  for (const api of config.apis) {
    const file = specFile(dir, api.id);
    if (!existsSync(file)) {
      problems.push(`${api.id}: no spec at ${relative(dir, file)} (run \`orbitdocs extract\`)`);
      continue;
    }
    const { document } = await loadDocument(readFileSync(file, 'utf8'));
    ops.set(api.id, new Set(buildReferenceModel(document, api.id).operations.map((o) => o.slug)));
  }
  const exists = (api: string, op?: string) => ops.has(api) && (!op || ops.get(api)!.has(op));

  // /reference/<id> belongs to the API references, so guides there would never render.
  for (const reserved of ['reference', 'client']) {
    const clash = [join(dir, 'content', reserved), join(dir, 'content', `${reserved}.mdx`), join(dir, 'content', `${reserved}.md`)].find((p) => existsSync(p));
    if (clash) problems.push(`${relative(dir, clash)}: /${reserved} is reserved for the ${reserved === 'client' ? 'API client' : 'API references'}; rename it (e.g. content/docs-${reserved}/)`);
  }

  // Guides and reference/<api>/*.mdx (overview, group and operation content) both link.
  for (const file of [...contentFiles(join(dir, 'content')), ...contentFiles(join(dir, 'reference'))]) {
    const where = relative(dir, file);
    for (const ref of references(readFileSync(file, 'utf8'))) {
      // <Endpoint> needs both attributes; a bare op: link may name just the API.
      if (exists(ref.api, ref.op) && (ref.kind === 'link' || ref.op)) continue;
      problems.push(
        ref.kind === 'link'
          ? `${where}: link op:${ref.api}${ref.op ? `/${ref.op}` : ''} does not exist`
          : `${where}: <Endpoint api="${ref.api}" op="${ref.op ?? ''}"> does not exist`,
      );
    }
  }
  // reference/<api>/<operation>.mdx must name a real API and operation.
  const refDir = join(dir, 'reference');
  for (const file of contentFiles(refDir)) {
    const parts = relative(refDir, file).replace(/\.mdx?$/, '').split(/[\\/]/);
    const [api, op, extra] = parts;
    const where = relative(dir, file);
    if (!api || !ops.has(api)) {
      problems.push(`${where}: no API with id "${api}"`);
      continue;
    }
    if (!op || op === 'index' || op === '_groups' || extra !== undefined) continue;
    if (!exists(api, op)) problems.push(`${where}: no operation "${op}" in ${api}`);
  }
  return problems;
}
