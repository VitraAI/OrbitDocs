import type { OrbitDocsConfig } from '@orbitdocs/core';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';

import { loadApis } from './apis';
import { landingComponents } from './landing';

/** `op:<api>/<operation-slug>` → that operation's reference URL. */
export function resolveOpLink(href: string | undefined): string | undefined {
  if (!href?.startsWith('op:')) return href;
  const [api, slug] = href.slice(3).split('/');
  return `/reference/${api}/${slug ? `${slug}/` : ''}`;
}

/**
 * Inline link to an operation: method badge + path (or title).
 *
 *   <Endpoint api="travel" op="create-a-booking" />
 */
async function Endpoint({ config, api, op }: { config: OrbitDocsConfig; api: string; op: string }) {
  const apis = await loadApis(config);
  const found = apis.find((a) => a.id === api)?.model.operations.find((o) => o.slug === op);
  if (!found) throw new Error(`<Endpoint api="${api}" op="${op}">: no such operation`);
  const A = defaultMdxComponents.a as (p: ComponentProps<'a'>) => React.ReactNode;
  return (
    <A href={`/reference/${api}/${op}/`} className="od-endpoint not-prose">
      <span className={`od-method od-method-${found.method}`}>{found.method.toUpperCase()}</span>{' '}
      <code>{found.path}</code>
    </A>
  );
}

/** MDX components available in every guide page. */
export function orbitMdxComponents(config: OrbitDocsConfig, extra?: MDXComponents): MDXComponents {
  // Wrap whatever link component the page passes (e.g. Fumadocs' createRelativeLink) so op: links always resolve.
  const BaseA = (extra?.a ?? defaultMdxComponents.a) as (p: ComponentProps<'a'>) => React.ReactNode;
  return {
    ...defaultMdxComponents,
    ...extra,
    a: (props: ComponentProps<'a'>) => <BaseA {...props} href={resolveOpLink(props.href)} />,
    Accordion,
    Accordions,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    Endpoint: (props: { api: string; op: string }) => <Endpoint config={config} {...props} />,
    // Hero, Features, ApiCards, CodeShowcase, Stats, Logos, CallToAction: usable on any page.
    ...landingComponents(config),
  };
}
