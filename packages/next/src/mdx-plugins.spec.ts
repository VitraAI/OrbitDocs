import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { orbitMdxOptions, rehypeGithubAlerts, remarkGithubAlerts } from './mdx-plugins';

// @mdx-js/mdx is fumadocs-mdx's compiler; load the same copy.
const require = createRequire(createRequire(import.meta.url).resolve('fumadocs-mdx/package.json'));
const { compile } = (await import(require.resolve('@mdx-js/mdx'))) as typeof import('@mdx-js/mdx');

const compileWith = async (source: string, stage: 'remark' | 'rehype') =>
  String(await compile(source, { ...(stage === 'remark' ? { remarkPlugins: [remarkGithubAlerts] } : { rehypePlugins: [rehypeGithubAlerts] }), jsx: true }));

describe.each(['remark', 'rehype'] as const)('%sGithubAlerts', (stage) => {
  const compileMdx = (source: string) => compileWith(source, stage);
  it('turns each GitHub alert into a Callout', async () => {
    const out = await compileMdx(
      ['> [!NOTE]', '> Read **this**.', '', '> [!TIP]', '> A tip.', '', '> [!IMPORTANT]', '> Key.', '', '> [!WARNING]', '> Careful.', '', '> [!CAUTION]', '> Danger.'].join('\n'),
    );
    expect(out).toContain('<Callout type="info" title="Note"><_components.p>{"Read "}<_components.strong>{"this"}</_components.strong>{"."}</_components.p></Callout>');
    expect(out).toContain('<Callout type="success" title="Tip">');
    expect(out).toContain('<Callout type="idea" title="Important">');
    expect(out).toContain('<Callout type="warning" title="Warning">');
    expect(out).toContain('<Callout type="error" title="Caution">');
    expect(out).not.toContain('[!');
    expect(out).not.toContain('blockquote');
  });

  it('keeps several paragraphs and lists, and leaves plain quotes alone', async () => {
    const out = await compileMdx('> [!warning]\n> First.\n>\n> - one\n\n> Just a quote [!NOTE]');
    expect(out).toContain('<Callout type="warning" title="Warning"><_components.p>{"First."}</_components.p>');
    expect(out).toContain('<_components.li>');
    expect(out).toContain('<_components.blockquote>');
  });

  it('handles nested alerts inside components', async () => {
    const out = await compileMdx('<Tabs>\n\n> [!NOTE]\n> Inside.\n\n</Tabs>');
    expect(out).toContain('<Callout type="info" title="Note">');
  });
});

describe('orbitMdxOptions', () => {
  it("adds the rehype plugin to Fumadocs' defaults, leaving the Markdown stage (processed Markdown) as written", async () => {
    const options = await orbitMdxOptions()('bundler');
    expect(options.rehypePlugins?.[0]).toBe(rehypeGithubAlerts);
    expect(options.remarkPlugins).not.toContain(remarkGithubAlerts);
    expect((options.remarkPlugins ?? []).length).toBeGreaterThan(3);
  });

  it("keeps the app's plugins and Shiki options", async () => {
    const mine = () => () => {};
    const options = await orbitMdxOptions({ remarkPlugins: [mine], rehypePlugins: [mine], rehypeCodeOptions: { defaultLanguage: 'ts' } })('bundler');
    expect(options.remarkPlugins).toContain(mine);
    expect(options.rehypePlugins).toContain(mine);
    const code = options.rehypePlugins!.find((p) => Array.isArray(p) && (p[1] as { defaultLanguage?: string })?.defaultLanguage);
    expect(code).toBeTruthy();
  });

  it('keeps the blockquote in the Markdown tree', async () => {
    let quote = false;
    const spy = () => (tree: { children: Array<{ type: string }> }) => {
      quote = tree.children.some((c) => c.type === 'blockquote');
    };
    const out = String(await compile('> [!NOTE]\n> Hi.', { remarkPlugins: [spy], rehypePlugins: [rehypeGithubAlerts], jsx: true }));
    expect(quote).toBe(true);
    expect(out).toContain('<Callout type="info" title="Note"><_components.p>{"Hi."}</_components.p></Callout>');
  });
});
