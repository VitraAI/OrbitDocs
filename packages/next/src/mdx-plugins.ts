import type { OrbitDocsConfig } from '@vitra-ai/orbitdocs-core';
import type { applyMdxPreset, DefaultMDXOptions } from 'fumadocs-mdx/config';

/** What a collection's `mdxOptions` takes: a function of the build environment. */
export type MdxOptionsFn = ReturnType<typeof applyMdxPreset>;

/** GitHub alert kinds → Fumadocs Callout type and title (titles match the reference's alerts). */
export const GITHUB_ALERTS = {
  NOTE: { type: 'info', title: 'Note' },
  TIP: { type: 'success', title: 'Tip' },
  IMPORTANT: { type: 'idea', title: 'Important' },
  WARNING: { type: 'warning', title: 'Warning' },
  CAUTION: { type: 'error', title: 'Caution' },
} as const;

/** Just the mdast we touch. */
interface Node {
  type: string;
  value?: string;
  children?: Node[];
  [key: string]: unknown;
}

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i;

/** A blockquote that starts with `[!KIND]` → `<Callout type title>` with the rest of the quote. */
function toCallout(quote: Node): Node | undefined {
  const first = quote.children?.[0];
  const text = first?.type === 'paragraph' ? first.children?.[0] : undefined;
  if (text?.type !== 'text' || !text.value) return undefined;
  const m = MARKER.exec(text.value);
  if (!m) return undefined;
  const alert = GITHUB_ALERTS[m[1]!.toUpperCase() as keyof typeof GITHUB_ALERTS];
  const rest = text.value.slice(m[0].length);
  let inline = first!.children!.slice(1);
  if (rest) inline = [{ ...text, value: rest }, ...inline];
  // `> [!NOTE]` alone on its line: the soft line break after it goes too.
  else if (inline[0]?.type === 'break') inline = inline.slice(1);
  const children = [...(inline.length ? [{ ...first!, children: inline }] : []), ...quote.children!.slice(1)];
  return {
    type: 'mdxJsxFlowElement',
    name: 'Callout',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'type', value: alert.type },
      { type: 'mdxJsxAttribute', name: 'title', value: alert.title },
    ],
    children,
    position: quote.position,
  };
}

function walk(node: Node, convert: (n: Node) => Node | undefined) {
  if (!node.children) return;
  node.children = node.children.map((child) => convert(child) ?? child);
  for (const child of node.children) walk(child, convert);
}

/**
 * Remark plugin: GitHub alerts in MDX (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
 * `[!WARNING]`, `[!CAUTION]`) render as Fumadocs Callouts, the way the API
 * reference renders them in spec descriptions.
 *
 * `orbitMdxOptions()` uses the rehype twin below instead: remark runs before
 * Fumadocs writes the page's processed Markdown (llms.txt, /md/ pages,
 * "Copy Markdown"), which should keep the `> [!NOTE]` syntax.
 */
export function remarkGithubAlerts() {
  return (tree: Node) => walk(tree, (n) => (n.type === 'blockquote' ? toCallout(n) : undefined));
}

/** `<blockquote><p>[!KIND] …</p>…</blockquote>` (hast) → `<Callout type title>`. */
function hastToCallout(quote: Node): Node | undefined {
  const blocks = (quote.children ?? []).filter((c) => !(c.type === 'text' && !c.value?.trim()));
  const first = blocks[0];
  if (first?.type !== 'element' || first.tagName !== 'p') return undefined;
  const text = first.children?.[0];
  if (text?.type !== 'text' || !text.value) return undefined;
  const m = MARKER.exec(text.value);
  if (!m) return undefined;
  const alert = GITHUB_ALERTS[m[1]!.toUpperCase() as keyof typeof GITHUB_ALERTS];
  const rest = text.value.slice(m[0].length);
  let inline = first.children!.slice(1);
  if (rest) inline = [{ ...text, value: rest }, ...inline];
  else if (inline[0]?.type === 'element' && inline[0].tagName === 'br') inline = inline.slice(1);
  if (inline[0]?.type === 'text') inline = [{ ...inline[0], value: inline[0].value!.replace(/^\s+/, '') }, ...inline.slice(1)];
  const hasInline = inline.some((c) => c.type !== 'text' || c.value?.trim());
  return {
    type: 'mdxJsxFlowElement',
    name: 'Callout',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'type', value: alert.type },
      { type: 'mdxJsxAttribute', name: 'title', value: alert.title },
    ],
    children: [...(hasInline ? [{ ...first, children: inline }] : []), ...blocks.slice(1)],
    position: quote.position,
  };
}

/** Rehype plugin: GitHub alerts as Fumadocs Callouts, after the processed Markdown is taken. */
export function rehypeGithubAlerts() {
  return (tree: Node) => walk(tree, (n) => (n.type === 'element' && n.tagName === 'blockquote' ? hastToCallout(n) : undefined));
}

let codeBlocks: Promise<Record<string, unknown>> | undefined;

/** `codeBlocks` from the docs app's orbitdocs.config.ts (the build's working directory), as Shiki options. */
function codeBlockOptions(): Promise<Record<string, unknown>> {
  codeBlocks ??= (async () => {
    const { findConfigFile, loadConfig } = await import('@vitra-ai/orbitdocs-core/loader');
    if (!findConfigFile(process.cwd())) return {};
    const { themes, defaultLanguage }: OrbitDocsConfig['codeBlocks'] = (await loadConfig()).config.codeBlocks;
    return { ...(themes ? { themes } : {}), ...(defaultLanguage ? { defaultLanguage } : {}) };
  })();
  return codeBlocks;
}

/**
 * MDX options for OrbitDocs collections (guides in `content/` and reference
 * content in `reference/`): Fumadocs' defaults plus GitHub alerts, and
 * `codeBlocks` from orbitdocs.config.ts (Shiki themes, default language).
 *
 *   defineDocs({ dir: 'content', docs: { mdxOptions: orbitMdxOptions(), ... } })
 *
 * Your own options are passed to Fumadocs' preset: `remarkPlugins` and
 * `rehypePlugins` (an array is added to the defaults, a function gets them),
 * `rehypeCodeOptions` (merged over the config's), and the rest as they are.
 * A collection's own `mdxOptions` replaces Fumadocs' defaults, hence the preset.
 */
export function orbitMdxOptions(options: DefaultMDXOptions = {}): MdxOptionsFn {
  const { rehypePlugins, rehypeCodeOptions } = options;
  // Loaded when content is compiled: an app that imports lib/source.ts at runtime (where the macro has
  // dropped these options) doesn't pull in the MDX toolchain.
  return async (environment) => {
    const { applyMdxPreset: preset } = await import('fumadocs-mdx/config');
    return preset({
      ...options,
      rehypeCodeOptions: rehypeCodeOptions === false ? false : ({ ...(await codeBlockOptions()), ...rehypeCodeOptions } as DefaultMDXOptions['rehypeCodeOptions']),
      rehypePlugins: (defaults) => {
        const own = typeof rehypePlugins === 'function' ? rehypePlugins(defaults) : [...defaults, ...(rehypePlugins ?? [])];
        return [rehypeGithubAlerts, ...own];
      },
    })(environment);
  };
}
