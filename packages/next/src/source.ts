import type { LoaderPlugin } from 'fumadocs-core/source';

type Tree = Parameters<NonNullable<NonNullable<LoaderPlugin['transformPageTree']>['root']>>[0];
type TreeNode = Tree['children'][number];

const LANDING = '$orbitLanding';

function prune(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .filter((n) => !(n.type === 'page' && (n as unknown as Record<string, unknown>)[LANDING]))
    .map((n) => {
      if (n.type !== 'folder') return n;
      const index = n.index && (n.index as unknown as Record<string, unknown>)[LANDING] ? undefined : n.index;
      return { ...n, index, children: prune(n.children) };
    });
}

/**
 * Loader plugin: pages with `layout: landing` in their frontmatter stay
 * routable but are left out of the sidebar.
 *
 *   loader({ baseUrl: '/', source, plugins: [orbitSourcePlugin()] })
 */
export function orbitSourcePlugin(): LoaderPlugin {
  return {
    name: 'orbitdocs:landing',
    transformPageTree: {
      file(node, filePath) {
        const file = filePath ? this.storage.read(filePath) : undefined;
        const layout = file && 'format' in file && file.format === 'page' ? (file.data as { layout?: string }).layout : undefined;
        return layout === 'landing' ? ({ ...node, [LANDING]: true } as typeof node) : node;
      },
      root(root) {
        return { ...root, children: prune(root.children) };
      },
    },
  };
}
