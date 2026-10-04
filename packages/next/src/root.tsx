import type { OrbitDocsConfig } from '@orbitdocs/core';
import { Banner } from 'fumadocs-ui/components/banner';
import type { ReactNode } from 'react';

import { readableApis } from './layout';
import type { OrbitOverrides } from './overrides';
import { OrbitRootProvider } from './root-provider';
import { OrbitSearchDialog } from './search-dialog';

/**
 * Search filters (`search.tags`): Guides, then one per API the search index
 * holds. The index is one file for every reader, so restricted APIs are left
 * out here as they are there.
 */
function searchTags(config: OrbitDocsConfig) {
  if (!config.search.tags || !config.apis.length) return undefined;
  return [{ name: 'Guides', value: 'guides' }, ...readableApis(config).map((a) => ({ name: a.title ?? a.id, value: `api:${a.id}` }))];
}

/**
 * Wraps the app: Fumadocs provider (theme, search dialog), the site accent
 * colour and the optional announcement banner. `overrides.root` (a custom
 * search dialog, dialog footer, theme options, React banner content) is
 * merged over the config's.
 */
export function OrbitRoot({ config, overrides, children }: { config: OrbitDocsConfig; overrides?: OrbitOverrides; children: ReactNode }) {
  const base = config.output.basePath;
  const { search, banner } = config;
  const o = overrides?.root ?? {};
  const tags = searchTags(config);
  // Fumadocs' default dialog draws tags and a footer outside the dialog (see search-dialog.tsx).
  const fixDialog = Boolean(tags || o.search?.options?.footer);
  return (
    <OrbitRootProvider
      dir={config.site.dir}
      theme={{
        defaultTheme: config.theme.defaultMode,
        enableSystem: config.theme.defaultMode === 'system' || config.theme.switch.mode === 'light-dark-system',
        hotKey: config.theme.hotKey,
        ...o.theme,
      }}
      components={o.components}
      search={{
        enabled: search.enabled,
        // ⌘/Ctrl+K is Fumadocs' default; any other key opens search on its own (e.g. '/').
        ...(search.hotKey !== 'k' ? { hotKey: [{ display: search.hotKey.toUpperCase(), key: search.hotKey }] } : {}),
        links: search.links.map((l) => [l.text, l.url] as [string, string]),
        ...(fixDialog ? { SearchDialog: OrbitSearchDialog } : {}),
        ...o.search,
        options: {
          type: 'static',
          api: `${base}/api/search`,
          ...(search.delayMs !== undefined ? { delayMs: search.delayMs } : {}),
          ...(tags ? { tags, allowClear: search.allowClear } : {}),
          ...o.search?.options,
        },
      }}
    >
      {banner ? (
        <Banner
          id={banner.dismissible ? banner.id : undefined}
          variant={banner.variant}
          height={banner.height}
          rainbowColors={banner.rainbowColors}
          changeLayout={banner.changeLayout}
        >
          {o.banner ?? (banner.url ? <a href={banner.url}>{banner.content}</a> : banner.content)}
        </Banner>
      ) : null}
      {children}
    </OrbitRootProvider>
  );
}
