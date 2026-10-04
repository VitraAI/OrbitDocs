import type { OrbitDocsConfig } from '@orbitdocs/core';
import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import * as Lu from 'react-icons/lu';
import * as Si from 'react-icons/si';
import { createElement, type ReactNode } from 'react';
import type { IconType } from 'react-icons';

import { AskAi } from '@orbitdocs/ui/ask-ai';

import type { OrbitOverrides } from './overrides';
import { UserMenu } from './user-menu';
import { readerMayOpen } from './variants';

type HeaderItem = OrbitDocsConfig['navigation']['header'][number];

type IconSet = Record<string, IconType>;

/**
 * An icon by name, from react-icons: Lucide names (`Github`, `BookOpen`,
 * `book-open`) or any brand icon from Simple Icons (`SiOkta`, `SiStripe`).
 */
export function namedIcon(name: string | undefined, size = 16): ReactNode {
  if (!name) return undefined;
  if (/^Si[A-Z]/.test(name)) {
    const Brand = (Si as unknown as IconSet)[name];
    return Brand ? createElement(Brand, { size, 'aria-hidden': true }) : undefined;
  }
  const key = `Lu${name.replace(/(^|[-_ ])(\w)/g, (_, __, c: string) => c.toUpperCase())}`;
  const Icon = (Lu as unknown as IconSet)[key];
  return Icon ? createElement(Icon, { size, 'aria-hidden': true }) : undefined;
}

const isExternal = (url: string, external?: boolean) => external ?? /^https?:/.test(url);

function headerLink(item: HeaderItem): LinkItemType {
  const on = item.on;
  if (item.type === 'menu') {
    return {
      type: 'menu',
      text: item.text,
      icon: namedIcon(item.icon),
      on,
      items: item.items.map((l) => ({ text: l.text, url: l.url, description: l.description, icon: namedIcon(l.icon), external: isExternal(l.url, l.external) })),
    };
  }
  const active = item.active;
  if (item.type === 'icon') {
    return { type: 'icon', text: item.text, label: item.text, url: item.url, icon: namedIcon(item.icon), external: isExternal(item.url, item.external), on, active };
  }
  if (item.type === 'button') {
    return { type: 'button', text: item.text, url: item.url, icon: namedIcon(item.icon), secondary: item.secondary, external: isExternal(item.url, item.external), on, active };
  }
  return { text: item.text, url: item.url, icon: namedIcon(item.icon), description: item.description, external: isExternal(item.url, item.external), on, active };
}

function Logo({ config }: { config: OrbitDocsConfig }) {
  const { logo, title } = config.site;
  const base = config.output.basePath;
  if (!logo) return <span className="font-semibold">{title}</span>;
  const src = (p: string) => (p.startsWith('/') ? `${base}${p}` : p);
  if (typeof logo === 'string') return <img src={src(logo)} alt={title} className="h-6 w-auto" />;
  return (
    <>
      <img src={src(logo.light)} alt={title} className="h-6 w-auto dark:hidden" />
      <img src={src(logo.dark)} alt={title} className="hidden h-6 w-auto dark:block" />
    </>
  );
}

/**
 * The APIs a page's readers may open: with private docs, an API limited to
 * some groups (`apis[].access`, an `access.rules` entry over its reference)
 * is listed only where every reader of the page may open it. `readerOf` is
 * the page's site path; without it, every reader of the site.
 */
export function readableApis(config: OrbitDocsConfig, readerOf?: string): OrbitDocsConfig['apis'] {
  const may = readerMayOpen(readerOf);
  return config.apis.filter((a) => may(`/reference/${a.id}`));
}

/**
 * Shared top-bar options for guide and reference layouts. `readerOf` is the
 * site path of the page (or variant) the bar is for, e.g. `/reference/admin`:
 * the API menu lists only APIs its readers may open (see readableApis).
 * `overrides.layout` (nav, links, slots, …) is merged over the config's.
 */
export function orbitLayoutOptions(
  config: OrbitDocsConfig,
  extra: { title?: ReactNode; readerOf?: string; overrides?: OrbitOverrides } = {},
): BaseLayoutProps {
  const apis = readableApis(config, extra.readerOf);
  const apiLinks: LinkItemType[] =
    apis.length === 1
      ? [{ text: 'API Reference', url: `/reference/${apis[0]!.id}`, active: 'nested-url' }]
      : apis.length > 1 && config.navigation.apiSwitcher === 'sidebar'
        ? // The reference sidebar has the API dropdown (see reference.tsx).
          [{ text: 'API Reference', url: `/reference/${apis[0]!.id}`, active: 'none' }]
        : apis.length > 1
        ? [
            {
              type: 'menu',
              text: 'API Reference',
              items: apis.map((a) => ({ text: a.title ?? a.id, description: a.description?.split('\n')[0], url: `/reference/${a.id}` })),
            },
          ]
        : [];
  const links: LinkItemType[] = [
    ...(config.navigation.guides ? [{ text: config.navigation.guides.text, url: config.navigation.guides.url, active: 'url' } as LinkItemType] : []),
    ...apiLinks,
    ...(apis.length && config.client.enabled ? [{ text: 'API Client', url: '/client', active: 'nested-url' } as LinkItemType] : []),
    ...config.navigation.header.map(headerLink),
    ...(config.ai?.askAi.enabled ? [{ type: 'custom', secondary: true, children: <AskAi base={config.output.basePath} /> } as LinkItemType] : []),
    ...(config.access ? [{ type: 'custom', secondary: true, children: <UserMenu base={config.output.basePath} /> } as LinkItemType] : []),
  ];
  const o = extra.overrides?.layout ?? {};
  return {
    nav: { title: extra.title ?? <Logo config={config} />, url: config.navigation.titleUrl, transparentMode: config.layout.transparentNav, ...o.nav },
    githubUrl: o.githubUrl ?? config.site.github,
    themeSwitch: { enabled: config.theme.switch.enabled, mode: config.theme.switch.mode, ...o.themeSwitch },
    searchToggle: { enabled: config.search.enabled, ...o.searchToggle },
    links: typeof o.links === 'function' ? o.links(links) : [...links, ...(o.links ?? [])],
    ...(o.slots ? { slots: o.slots as BaseLayoutProps['slots'] } : {}),
  };
}
