import type { OrbitDocsConfig } from '@orbitdocs/core';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import Link from 'next/link';
import { Children, type ComponentType, isValidElement, type ReactElement, type ReactNode } from 'react';
import { LuArrowRight, LuBookOpen, LuCheck, LuMinus } from 'react-icons/lu';

import { loadApis } from './apis';
import { BrowserFrame as BrowserFrameClient, CountUp, FlowLine, Reveal, RevealGroup, RevealItem, ShowcaseTabs, Terminal } from './landing-client';
import { namedIcon, orbitLayoutOptions } from './layout';
import type { OrbitOverrides } from './overrides';

export interface LandingAction {
  text: string;
  href: string;
  /** Icon name (Lucide `rocket`, or a Simple Icons brand like `SiGithub`). */
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

const isExternal = (href: string) => /^(https?:|mailto:)/.test(href);

/** A link styled as a button. Internal links get the site's base path. */
export function LinkButton({ href, variant = 'primary', icon, children }: { href: string; variant?: LandingAction['variant']; icon?: string; children: ReactNode }) {
  const className = `od-btn od-btn-${variant}`;
  const content = (
    <>
      {namedIcon(icon, 16)}
      {children}
      {variant === 'primary' ? <LuArrowRight size={15} className="od-btn-arrow" aria-hidden /> : null}
    </>
  );
  return isExternal(href) ? (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <Link className={className} href={href}>
      {content}
    </Link>
  );
}

function Actions({ actions }: { actions?: LandingAction[] }) {
  if (!actions?.length) return null;
  return (
    <div className="od-actions">
      {actions.map((a, i) => (
        <LinkButton key={a.href} href={a.href} icon={a.icon} variant={a.variant ?? (i === 0 ? 'primary' : 'secondary')}>
          {a.text}
        </LinkButton>
      ))}
    </div>
  );
}

/** Words in the brand gradient, with a slow shimmer. Use inside titles. */
export function Highlight({ children }: { children: ReactNode }) {
  return <span className="od-highlight">{children}</span>;
}

/** Splits `title` around `highlight` so that part gets the gradient. */
function withHighlight(title: ReactNode, highlight?: string): ReactNode {
  if (!highlight || typeof title !== 'string' || !title.includes(highlight)) return title;
  const [before, ...rest] = title.split(highlight);
  return (
    <>
      {before}
      <Highlight>{highlight}</Highlight>
      {rest.join(highlight)}
    </>
  );
}

/**
 * The top of a landing page. Children (a code block, an image, a <Terminal>)
 * go in a second column beside the text. Everything animates in on load.
 *
 *   <Hero title="Docs your API deserves" highlight="your API" description="…" actions={[…]} />
 */
export function Hero({
  title,
  highlight,
  description,
  logo,
  badge,
  badgeHref,
  actions,
  footnote,
  align = 'left',
  backdrop = 'glow',
  children,
}: {
  title: ReactNode;
  /** Part of a string `title` shown in the brand gradient. */
  highlight?: string;
  description?: ReactNode;
  /** Your brand above everything else, e.g. an animated logo. It brings its own entrance animation. */
  logo?: ReactNode;
  /** Small pill above the title, e.g. "New: webhooks v2". */
  badge?: ReactNode;
  badgeHref?: string;
  actions?: LandingAction[];
  /** A small line under the buttons, e.g. "No sign-up needed" or who builds the product. */
  footnote?: ReactNode;
  align?: 'left' | 'center';
  /** Background: soft moving glow (default), a fading grid, both, or nothing. */
  backdrop?: 'glow' | 'grid' | 'glow-grid' | 'none';
  children?: ReactNode;
}) {
  const pill = badge ? (
    badgeHref ? (
      <Link className="od-hero-badge" href={badgeHref}>
        <span className="od-hero-badge-dot" aria-hidden />
        {badge}
        <LuArrowRight size={13} aria-hidden />
      </Link>
    ) : (
      <span className="od-hero-badge">
        <span className="od-hero-badge-dot" aria-hidden />
        {badge}
      </span>
    )
  ) : null;
  return (
    <section className="od-hero not-prose" data-align={align} data-split={children ? '' : undefined} data-backdrop={backdrop}>
      {backdrop !== 'none' ? (
        <div className="od-hero-backdrop" aria-hidden>
          {backdrop.includes('grid') ? <div className="od-hero-grid" /> : null}
          {backdrop.includes('glow') ? (
            <>
              <span className="od-orb od-orb-1" />
              <span className="od-orb od-orb-2" />
              <span className="od-orb od-orb-3" />
            </>
          ) : null}
        </div>
      ) : null}
      <RevealGroup className="od-hero-text" stagger={0.1} immediate>
        {logo ? <div className="od-hero-logo">{logo}</div> : null}
        {pill ? <RevealItem>{pill}</RevealItem> : null}
        <RevealItem>
          <h1>{withHighlight(title, highlight)}</h1>
        </RevealItem>
        {description ? (
          <RevealItem>
            <p className="od-hero-description">{description}</p>
          </RevealItem>
        ) : null}
        {actions?.length ? (
          <RevealItem>
            <Actions actions={actions} />
          </RevealItem>
        ) : null}
        {footnote ? (
          <RevealItem>
            <div className="od-hero-footnote">{footnote}</div>
          </RevealItem>
        ) : null}
      </RevealGroup>
      {children ? (
        <Reveal className="od-hero-visual" delay={0.35} y={32} immediate>
          {children}
        </Reveal>
      ) : null}
    </section>
  );
}

/** A titled band of a landing page; its heading fades in on scroll. */
export function Section({
  title,
  description,
  eyebrow,
  align = 'left',
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Small label above the title, e.g. "API client". */
  eyebrow?: ReactNode;
  align?: 'left' | 'center';
  children?: ReactNode;
}) {
  return (
    <section className="od-section not-prose" data-align={align}>
      {title || description || eyebrow ? (
        <Reveal className="od-section-head">
          {eyebrow ? <span className="od-eyebrow">{eyebrow}</span> : null}
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </Reveal>
      ) : null}
      {children}
    </section>
  );
}

/** A grid of <Feature> cards that appear one after another. */
export function Features({
  title,
  description,
  eyebrow,
  align,
  columns = 3,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  align?: 'left' | 'center';
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <Section title={title} description={description} eyebrow={eyebrow} align={align}>
      <RevealGroup className="od-features" style={{ '--od-cols': columns } as React.CSSProperties}>
        {children}
      </RevealGroup>
    </Section>
  );
}

export function Feature({ icon, title, href, children }: { icon?: string; title: ReactNode; href?: string; children?: ReactNode }) {
  const body = (
    <>
      {icon ? <span className="od-feature-icon">{namedIcon(icon, 18)}</span> : null}
      <h3>{title}</h3>
      {children ? <div className="od-feature-body">{children}</div> : null}
      {href ? <LuArrowRight size={16} className="od-feature-arrow" aria-hidden /> : null}
    </>
  );
  return (
    <RevealItem className="od-card-cell" spotlight>
      {href ? (
        <Link className="od-feature" data-link="" href={href}>
          {body}
        </Link>
      ) : (
        <div className="od-feature">{body}</div>
      )}
    </RevealItem>
  );
}

/**
 * An asymmetric grid of cards (a "bento" grid). Each <BentoItem> spans
 * `size` columns of six and may hold a visual: code, an image, a <Terminal>.
 */
export function Bento({ title, description, eyebrow, align, children }: { title?: ReactNode; description?: ReactNode; eyebrow?: ReactNode; align?: 'left' | 'center'; children: ReactNode }) {
  return (
    <Section title={title} description={description} eyebrow={eyebrow} align={align}>
      <RevealGroup className="od-bento">{children}</RevealGroup>
    </Section>
  );
}

export function BentoItem({
  icon,
  title,
  description,
  href,
  size = 'md',
  tall,
  children,
}: {
  icon?: string;
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  /** Width: sm = a third, md = half, lg = two thirds, full = the whole row. */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Twice as tall, for a bigger visual. */
  tall?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="od-bento-text">
        {icon ? <span className="od-feature-icon">{namedIcon(icon, 18)}</span> : null}
        <h3>
          {title}
          {href ? <LuArrowRight size={16} className="od-feature-arrow" aria-hidden /> : null}
        </h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="od-bento-visual">{children}</div> : null}
    </>
  );
  return (
    <RevealItem className="od-bento-cell" spotlight style={{ gridColumn: `span ${{ sm: 2, md: 3, lg: 4, full: 6 }[size]}`, gridRow: tall ? 'span 2' : undefined }}>
      {href ? (
        <Link className="od-bento-item" data-link="" href={href}>
          {body}
        </Link>
      ) : (
        <div className="od-bento-item">{body}</div>
      )}
    </RevealItem>
  );
}

/** One card per API in the config, with its version, size and groups. */
async function ApiCards({ config, ids, title, description, eyebrow, align }: { config: OrbitDocsConfig; ids?: string[]; title?: ReactNode; description?: ReactNode; eyebrow?: ReactNode; align?: 'left' | 'center' }) {
  const apis = (await loadApis(config)).filter((a) => !ids || ids.includes(a.id));
  return (
    <Section title={title} description={description} eyebrow={eyebrow} align={align}>
      <RevealGroup className="od-features" style={{ '--od-cols': Math.min(apis.length, 3) } as React.CSSProperties}>
        {apis.map(({ id, model, route }) => (
          <RevealItem key={id} className="od-card-cell" spotlight>
            <Link className="od-feature od-api-card" data-link="" href={`${route}/`}>
              <span className="od-feature-icon">
                <LuBookOpen size={18} aria-hidden />
              </span>
              <h3>
                {model.title}
                <span className="od-api-version">v{model.version}</span>
              </h3>
              {model.description ? <p className="od-feature-body">{model.description.split('\n')[0]}</p> : null}
              <div className="od-api-meta">
                <span>{model.operations.length} endpoints</span>
                {model.groups.slice(0, 5).map((g) => (
                  <span key={g.slug} className="od-api-chip">
                    {g.name}
                  </span>
                ))}
              </div>
              <LuArrowRight size={16} className="od-feature-arrow" aria-hidden />
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}

/** Text on one side, code (fenced blocks, <Tabs>, a <Terminal>) on the other. */
export function CodeShowcase({
  title,
  description,
  eyebrow,
  actions,
  reverse,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: LandingAction[];
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="od-showcase" data-reverse={reverse ? '' : undefined}>
      <Reveal className="od-showcase-text not-prose">
        {eyebrow ? <span className="od-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        <Actions actions={actions} />
      </Reveal>
      <Reveal className="od-showcase-code" delay={0.15} y={32}>
        {children}
      </Reveal>
    </section>
  );
}

/**
 * Numbered steps joined by a line that draws itself in. Put <FlowStep>
 * items inside; three or four read best.
 */
export function Flow({ title, description, eyebrow, align, children }: { title?: ReactNode; description?: ReactNode; eyebrow?: ReactNode; align?: 'left' | 'center'; children: ReactNode }) {
  const count = Children.toArray(children).filter(isValidElement).length;
  return (
    <Section title={title} description={description} eyebrow={eyebrow} align={align}>
      <div className="od-flow" style={{ '--od-steps': count } as React.CSSProperties}>
        <FlowLine />
        <RevealGroup className="od-flow-steps" stagger={0.18}>
          {children}
        </RevealGroup>
      </div>
    </Section>
  );
}

export function FlowStep({ icon, title, children }: { icon?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <RevealItem className="od-flow-step">
      <span className="od-flow-marker">{icon ? namedIcon(icon, 18) : <span className="od-flow-number" />}</span>
      <h3>{title}</h3>
      {children ? <div className="od-flow-body">{children}</div> : null}
    </RevealItem>
  );
}

/** A row of big numbers; numbers count up when they scroll into view. */
export function Stats({ children }: { children: ReactNode }) {
  return <RevealGroup className="od-stats not-prose">{children}</RevealGroup>;
}

export function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <RevealItem className="od-stat">
      <strong>{typeof value === 'string' || typeof value === 'number' ? <CountUp value={String(value)} /> : value}</strong>
      <span>{label}</span>
    </RevealItem>
  );
}

/** "Trusted by" row of <Logo> items; `marquee` scrolls them in an endless loop. */
export function Logos({ title, marquee, children }: { title?: ReactNode; marquee?: boolean; children: ReactNode }) {
  return (
    <Reveal className="od-logos not-prose">
      {title ? <p>{title}</p> : null}
      {marquee ? (
        <div className="od-marquee">
          <div className="od-marquee-track">
            <div className="od-logos-row">{children}</div>
            <div className="od-logos-row" aria-hidden>
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div className="od-logos-row">{children}</div>
      )}
    </Reveal>
  );
}

function LogoItem({ name, src, icon, href }: { name: string; src?: string; icon?: string; href?: string }) {
  const content = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} />
  ) : (
    <>
      {namedIcon(icon, 22)}
      <span>{name}</span>
    </>
  );
  return href ? (
    <a className="od-logo" href={href} target="_blank" rel="noreferrer" title={name}>
      {content}
    </a>
  ) : (
    <span className="od-logo" title={name}>
      {content}
    </span>
  );
}

/** One tab of a <Showcase>: a title, a short description and the visual shown beside the tabs. */
export function ShowcaseItem(_props: { title: string; description?: ReactNode; icon?: string; children?: ReactNode }) {
  // Read by <Showcase>; never rendered on its own.
  return null;
}

/**
 * Tabs beside a large visual that changes with the tab; it plays through the
 * tabs on its own until someone picks one.
 *
 *   <Showcase>
 *     <ShowcaseItem title="Reference" icon="book-open" description="…"><BrowserFrame src="/screens/reference.png" /></ShowcaseItem>
 *   </Showcase>
 */
export function Showcase({ title, description, eyebrow, align, interval, children }: { title?: ReactNode; description?: ReactNode; eyebrow?: ReactNode; align?: 'left' | 'center'; interval?: number; children: ReactNode }) {
  const items = Children.toArray(children)
    .filter(isValidElement)
    .map((el) => {
      const p = (el as ReactElement<{ title: string; description?: ReactNode; icon?: string; children?: ReactNode }>).props;
      return { title: p.title, description: p.description, icon: namedIcon(p.icon, 18), content: p.children };
    });
  return (
    <Section title={title} description={description} eyebrow={eyebrow} align={align}>
      <Reveal>
        <ShowcaseTabs items={items} interval={interval} />
      </Reveal>
    </Section>
  );
}

export interface ComparisonRow {
  feature: string;
  /** One value per column: true (✓), false (–) or a short text. */
  values: Array<boolean | string>;
  /** Small text under the feature name. */
  note?: string;
}

/** A feature table with ✓ and – per column; `highlight` marks one column (default the first). */
export function Comparison({
  title,
  description,
  eyebrow,
  align,
  columns,
  rows,
  highlight = 0,
}: {
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  align?: 'left' | 'center';
  columns: string[];
  rows: ComparisonRow[];
  highlight?: number;
}) {
  const cell = (v: boolean | string) =>
    v === true ? <LuCheck size={18} className="od-cmp-yes" aria-label="Yes" /> : v === false ? <LuMinus size={18} className="od-cmp-no" aria-label="No" /> : <span className="od-cmp-text">{v}</span>;
  return (
    <Section title={title} description={description} eyebrow={eyebrow} align={align}>
      <Reveal className="od-comparison" style={{ '--od-cmp-cols': columns.length, '--od-cmp-hl': highlight + 2 } as React.CSSProperties}>
        <div className="od-cmp-row od-cmp-head" role="row">
          <span role="columnheader">Feature</span>
          {columns.map((c, i) => (
            <span key={c} role="columnheader" data-hl={i === highlight ? '' : undefined}>
              {c}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.feature} className="od-cmp-row" role="row">
            <span role="rowheader">
              {r.feature}
              {r.note ? <small>{r.note}</small> : null}
            </span>
            {r.values.map((v, i) => (
              <span key={i} role="cell" data-hl={i === highlight ? '' : undefined}>
                {cell(v)}
              </span>
            ))}
          </div>
        ))}
      </Reveal>
    </Section>
  );
}

/** Closing banner with a call to action, framed by a slowly turning gradient. */
export function CallToAction({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: LandingAction[] }) {
  return (
    <Reveal className="od-cta-wrap not-prose">
      <section className="od-cta">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        <Actions actions={actions} />
      </section>
    </Reveal>
  );
}

/** Landing components for MDX; `config` is bound for the ones that read APIs or need the base path. */
export function landingComponents(config: OrbitDocsConfig) {
  const base = config.output.basePath;
  const asset = (src?: string) => (src?.startsWith('/') ? `${base}${src}` : src);
  return {
    Hero,
    Highlight,
    Section,
    Features,
    Feature,
    Bento,
    BentoItem,
    ApiCards: (props: { ids?: string[]; title?: ReactNode; description?: ReactNode; eyebrow?: ReactNode; align?: 'left' | 'center' }) => <ApiCards config={config} {...props} />,
    CodeShowcase,
    Terminal,
    Flow,
    FlowStep,
    Stats,
    Stat,
    Logos,
    Logo: (props: { name: string; src?: string; icon?: string; href?: string }) => <LogoItem {...props} src={asset(props.src)} />,
    Showcase,
    ShowcaseItem,
    Comparison,
    BrowserFrame: (props: { url?: string; src?: string; srcDark?: string; alt?: string; tilt?: boolean; children?: ReactNode }) => (
      <BrowserFrameClient {...props} src={asset(props.src)} srcDark={asset(props.srcDark)} />
    ),
    CallToAction,
    LinkButton,
  };
}

export { LogoItem as Logo, Terminal };

type FooterLink = { text: string; url: string; external?: boolean; icon?: string };

function FooterAnchor({ link, className, children }: { link: FooterLink; className?: string; children?: ReactNode }) {
  const external = link.external ?? isExternal(link.url);
  return external ? (
    <a className={className} href={link.url} target="_blank" rel="noreferrer">
      {children ?? link.text}
    </a>
  ) : (
    <Link className={className} href={link.url}>
      {children ?? link.text}
    </Link>
  );
}

/**
 * The site footer under landing pages, from `navigation.footer`: logo and
 * tagline, columns of links, social icons, and a bottom row with the
 * copyright and small links. A plain list of links renders as one row.
 */
export function SiteFooter({ config }: { config: OrbitDocsConfig }) {
  const raw = config.navigation.footer;
  const footer = Array.isArray(raw) ? { columns: [], social: [], links: raw, poweredBy: true, description: undefined, copyright: undefined, builtBy: undefined } : raw;
  const { site } = config;
  const base = config.output.basePath;
  const src = (p: string) => (p.startsWith('/') ? `${base}${p}` : p);
  const social: FooterLink[] = [...footer.social];
  if (site.github && !social.some((l) => l.url === site.github)) social.push({ text: 'GitHub', url: site.github, icon: 'SiGithub' });
  const copyright = footer.copyright === false ? null : (footer.copyright ?? `© ${new Date().getFullYear()} ${site.title}`);
  const description = footer.description ?? site.description;
  const logo = site.logo;
  return (
    <footer className="od-footer not-prose">
      <Reveal className="od-footer-inner">
        <div className="od-footer-top">
          <div className="od-footer-brand">
            <Link href="/" className="od-footer-logo" aria-label={site.title}>
              {!logo ? (
                <span>{site.title}</span>
              ) : typeof logo === 'string' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src(logo)} alt={site.title} />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(logo.light)} alt={site.title} className="od-only-light" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(logo.dark)} alt={site.title} className="od-only-dark" />
                </>
              )}
            </Link>
            {description ? <p>{description}</p> : null}
            {social.length ? (
              <div className="od-footer-social">
                {social.map((l) => (
                  <FooterAnchor key={l.url} link={l} className="od-footer-icon">
                    {namedIcon(l.icon, 17)}
                    <span className="sr-only">{l.text}</span>
                  </FooterAnchor>
                ))}
              </div>
            ) : null}
          </div>
          {footer.columns.length ? (
            <nav className="od-footer-columns" aria-label="Footer">
              {footer.columns.map((col) => (
                <div key={col.title} className="od-footer-column">
                  <h3>{col.title}</h3>
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.url + l.text}>
                        <FooterAnchor link={l} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          ) : null}
        </div>
        {copyright || footer.links.length || footer.poweredBy || footer.builtBy ? (
          <div className="od-footer-bottom">
            {copyright ? <span>{copyright}</span> : null}
            {footer.links.length ? (
              <ul className="od-footer-links">
                {footer.links.map((l) => (
                  <li key={l.url + l.text}>
                    <FooterAnchor link={l} />
                  </li>
                ))}
              </ul>
            ) : null}
            {footer.poweredBy || footer.builtBy ? (
              <div className="od-footer-credits">
                {footer.poweredBy ? (
                  <a className="od-footer-powered" href="https://github.com/VitraAI/OrbitDocs" target="_blank" rel="noreferrer">
                    Built with OrbitDocs
                  </a>
                ) : null}
                {footer.builtBy ? <BuiltBy {...footer.builtBy} src={src} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Reveal>
    </footer>
  );
}

/** "Built by <logo>" in the footer's bottom row. */
function BuiltBy({ name, url, logo, text, src }: { name: string; url: string; logo?: string | { light: string; dark: string }; text: string; src: (p: string) => string }) {
  const external = /^https?:\/\//.test(url);
  return (
    <a className="od-footer-builtby" href={src(url)} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      <span>{text}</span>
      {!logo ? (
        <strong>{name}</strong>
      ) : typeof logo === 'string' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src(logo)} alt={name} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(logo.light)} alt={name} className="od-only-light" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(logo.dark)} alt={name} className="od-only-dark" />
        </>
      )}
    </a>
  );
}

/** The frame of a landing page: the site's top nav, no sidebar, full width, and the site footer. */
export function LandingLayout({ config, overrides, children }: { config: OrbitDocsConfig; overrides?: OrbitOverrides; children: ReactNode }) {
  return (
    <HomeLayout {...orbitLayoutOptions(config, { overrides })}>
      {children}
      <SiteFooter config={config} />
    </HomeLayout>
  );
}

/** A page whose frontmatter says `layout: landing`, rendered edge to edge. */
export function LandingPage({ page, components }: { page: { data: { body: unknown } }; components: Record<string, unknown> }) {
  const MDX = page.data.body as ComponentType<{ components?: Record<string, unknown> }>;
  return (
    <main className="od-landing prose">
      <MDX components={components} />
    </main>
  );
}
