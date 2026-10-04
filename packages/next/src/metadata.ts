import type { OrbitDocsConfig } from '@orbitdocs/core';
import type { Metadata } from 'next';

/**
 * `icons` for the root layout's metadata: `site.favicon` (default
 * `/icon.png`) and `/apple-icon.png`, from public/, with the base path (Next's
 * file-based icon links leave it out). The sign-in pages use the same files.
 */
export function siteIcons(config: OrbitDocsConfig): NonNullable<Metadata['icons']> {
  const base = config.output.basePath;
  const favicon = config.site.favicon ?? '/icon.png';
  return { icon: favicon.startsWith('/') ? `${base}${favicon}` : favicon, apple: `${base}/apple-icon.png` };
}
