import type { OrbitOverrides } from '@vitra-ai/orbitdocs-next';

/**
 * Fumadocs options that take React, merged over orbitdocs.config.ts (plain
 * options belong there). Passed to OrbitRoot, the layouts and the guide pages
 * in app/. Components used in slots or as a search dialog need 'use client'.
 */
export const overrides: OrbitOverrides = {
  // root: { search: { options: { footer: <p>Can't find it? Ask in our forum.</p> } } },
  // layout: {
  //   nav: { title: <MyLogo /> },
  //   links: [{ type: 'custom', children: <VersionPicker /> }],
  //   sidebar: { footer: <StatusBadge /> },
  // },
  // page: { tableOfContent: { footer: <a href="https://github.com/acme/docs/issues">Report an issue</a> } },
};
