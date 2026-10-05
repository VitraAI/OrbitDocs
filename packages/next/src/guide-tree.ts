import { implies, type Requirement } from '@vitra-ai/orbitdocs-auth/edge';
import type * as PageTree from 'fumadocs-core/page-tree';

import { accessAt, accessManifest, siteDefault, variantOptions } from './variants';

type Node = PageTree.Node;

/** The tree without pages `visible` rejects, folders left empty and separators with nothing under them. */
export function filterTree(tree: PageTree.Root, visible: (url: string) => boolean): PageTree.Root {
  // Links to other sites are never guide pages.
  const keep = (item: PageTree.Item) => item.external || /^[a-z][a-z0-9+.-]*:/i.test(item.url) || visible(item.url);
  const walk = (nodes: Node[]): Node[] => {
    const out: Node[] = [];
    for (const n of nodes) {
      if (n.type === 'page') {
        if (keep(n)) out.push(n);
      } else if (n.type === 'folder') {
        const index = n.index && keep(n.index) ? n.index : undefined;
        const children = walk(n.children);
        if (index || children.some((c) => c.type !== 'separator')) out.push({ ...n, index, children });
      } else {
        out.push(n);
      }
    }
    // A separator heads the pages after it: drop it when none is left before the next one.
    return out.filter((n, i) => n.type !== 'separator' || (out[i + 1] && out[i + 1]!.type !== 'separator'));
  };
  return {
    ...tree,
    children: walk(tree.children),
    ...(tree.fallback ? { fallback: filterTree(tree.fallback, visible) } : {}),
  };
}

/** What the reader of a guides variant (or of the canonical pages) satisfies. undefined = unknown variant. */
function viewerOf(variant?: string): { viewer: Requirement | null } | undefined {
  const manifest = accessManifest();
  if (!manifest) return { viewer: null };
  if (!variant) return { viewer: siteDefault(manifest) };
  const option = variantOptions(manifest, 'guides').find((o) => o.key === variant);
  return option ? { viewer: option.requires } : undefined;
}

/** Whether a reader who satisfies `viewer` may open the guide at `url`. */
function opens(viewer: Requirement | null, url: string): boolean {
  const manifest = accessManifest();
  return !manifest || implies(viewer, accessAt(manifest, url));
}

/**
 * The guides sidebar for one reader variant, or for the canonical pages (no
 * `variant`): only pages that reader may open, so no restricted title or URL
 * reaches a reader who can't open it, in the sidebar, the breadcrumb or the
 * previous/next links. Canonical pages show what every reader may open (no
 * restricted page in `public` mode); the server serves readers who may open
 * more the variant pages built for them (`/~/<variant>/…`).
 *
 * Without private docs the tree is returned as is.
 *
 *   <GuidesLayout config={orbit} tree={guidesTree(source.getPageTree())}>
 */
export function guidesTree(tree: PageTree.Root, variant?: string): PageTree.Root {
  const manifest = accessManifest();
  if (!manifest) return tree;
  const v = viewerOf(variant);
  const viewer = v ? v.viewer : siteDefault(manifest);
  const out = filterTree(tree, (url) => opens(viewer, url));
  return variant ? { ...out, $id: `${tree.$id ?? 'root'}~${variant}` } : out;
}

interface SourceLike {
  getPages(): Array<{ url: string; slugs: string[]; data: { layout?: string } }>;
}

/**
 * `app/~/[variant]/[[...slug]]/page.tsx`: each guides variant's pages, only
 * those its readers may open. A build without variants still needs one
 * parameter for a static export: `{ variant: '_' }`, which renders not-found.
 */
export function guideVariantParams(source: SourceLike): Array<{ variant: string; slug: string[] }> {
  const out: Array<{ variant: string; slug: string[] }> = [];
  for (const o of variantOptions(accessManifest(), 'guides')) {
    for (const page of source.getPages()) {
      if (page.data.layout === 'landing' || !opens(o.requires, page.url)) continue;
      out.push({ variant: o.key, slug: page.slugs });
    }
  }
  return out.length ? out : [{ variant: '_', slug: [] }];
}

/** Whether a guides variant page exists: a known variant whose readers may open the page. */
export function isGuideVariantPage(variant: string, page: { url: string; data: { layout?: string } }): boolean {
  const option = variantOptions(accessManifest(), 'guides').find((o) => o.key === variant);
  return Boolean(option) && page.data.layout !== 'landing' && opens(option!.requires, page.url);
}
