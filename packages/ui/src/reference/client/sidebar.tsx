'use client';

import { Button, ListBox, SearchField, Select } from '@heroui/react';
import { LuChevronRight as ChevronRight, LuMenu as Menu, LuX as X } from 'react-icons/lu';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useSections } from './sections';
import { NO_AUTOFILL } from '../../no-autofill';

export interface SidebarGroup {
  name?: string;
  slug: string;
  items: Array<{ slug: string; title: string; method: string; path: string; deprecated?: boolean }>;
}

const METHOD_LABEL: Record<string, string> = { delete: 'DEL', options: 'OPT' };

/** An API the reader can switch to (config `navigation.apiSwitcher: 'sidebar'`). */
export interface SidebarApi {
  id: string;
  title: string;
  description?: string;
  /** URL of its reference, base path included. */
  href: string;
}

/** The sidebar title as a HeroUI Select of the site's APIs; picking one opens its reference. */
function ApiSwitcher({ apis, current }: { apis: SidebarApi[]; current: string }) {
  return (
    <Select
      aria-label="API"
      fullWidth
      variant="secondary"
      className="od-api-switcher"
      value={current}
      onChange={(key) => {
        const api = apis.find((a) => a.id === String(key));
        if (api && api.id !== current) window.location.assign(api.href);
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {apis.map((a) => (
            <ListBox.Item key={a.id} id={a.id} textValue={a.title}>
              {a.title}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/**
 * Scalar-style sidebar. Every operation has its own pre-rendered URL
 * (`<base>/<slug>`), but the whole reference is one page: clicks scroll in
 * place and the URL follows the section in view.
 */
export function ReferenceSidebar({
  title,
  base,
  groups,
  hasModels,
  initial,
  apis,
  apiId,
}: {
  /** Other APIs of the site: shown as a dropdown under the filter. */
  apis?: SidebarApi[];
  apiId?: string;
  title: string;
  base: string;
  groups: SidebarGroup[];
  hasModels: boolean;
  initial?: string;
}) {
  const [active, setActive] = useState<string | undefined>(initial);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const g = groups.find((x) => x.items.some((i) => i.slug === initial)) ?? groups[0];
    return g ? { [g.slug]: true } : {};
  });
  const navRef = useRef<HTMLElement>(null);
  const lazy = useSections();
  const [mobileOpen, setMobileOpen] = useState(false);
  const switcher = Boolean(apiId && apis && apis.length > 1);

  // Track the section in view and keep the URL in sync (replaceState: no history spam).
  // The current section is the last one whose top has passed under the header.
  const lock = useRef(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < lock.current) return;
      const sections = [...document.querySelectorAll<HTMLElement>('[data-od-section]')];
      if (!sections.length) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = sections[0]!;
      for (const s of sections) if (s.getBoundingClientRect().top <= 140) current = s;
      if (atBottom) current = sections.at(-1)!;
      const slug = current.dataset.odSection!;
      setActive(slug);
      const url = slug === 'introduction' ? `${base}/` : `${base}/${slug}/`;
      if (window.location.pathname !== url) window.history.replaceState(null, '', url);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [base]);

  // Open the group of the active operation and keep its link visible.
  useEffect(() => {
    const group = groups.find((g) => g.items.some((i) => i.slug === active));
    if (group) setOpen((o) => (o[group.slug] ? o : { ...o, [group.slug]: true }));
    navRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => `${i.title} ${i.method} ${i.path}`.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length);
  }, [groups, query]);

  const go = (slug: string) => (e: React.MouseEvent) => {
    const target = document.querySelector(`[data-od-section="${slug}"]`);
    if (!target) return;
    e.preventDefault();
    // Ignore scroll tracking while the smooth scroll runs, so the clicked item stays active.
    lock.current = Date.now() + 1000;
    // Sections above may still be loading: keep the target where the scroll lands.
    lazy?.pin(slug);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.pushState(null, '', slug === 'introduction' ? `${base}/` : `${base}/${slug}/`);
    setActive(slug);
    setMobileOpen(false);
  };
  const activeTitle =
    active === 'introduction' ? 'Introduction' : active === 'models' ? 'Models' : groups.flatMap((g) => g.items).find((i) => i.slug === active)?.title;

  return (
    <>
    {/* Phones: a sticky bar shows where you are and opens the sidebar as a panel. */}
    <div className="od-mobile-bar">
      <Button variant="ghost" size="sm" className="od-mobile-toggle" aria-expanded={mobileOpen} onPress={() => setMobileOpen((o) => !o)}>
        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        <span className="od-mobile-current">{activeTitle ?? title}</span>
      </Button>
    </div>
    <aside className="od-sidebar" data-mobile-open={mobileOpen || undefined}>
      {switcher ? <ApiSwitcher apis={apis!} current={apiId!} /> : <div className="od-sidebar-title">{title}</div>}
      <SearchField aria-label="Filter operations" value={query} onChange={setQuery} className="od-sidebar-search">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Filter operations" {...NO_AUTOFILL} name="od-operation-filter" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <nav ref={navRef} className="od-sidebar-nav">
        {!query ? (
          <a href={`${base}/`} onClick={go('introduction')} className="od-sidebar-link od-sidebar-top" data-active={active === 'introduction'}>
            Introduction
          </a>
        ) : null}
        {filtered.map((g) => {
          const isOpen = Boolean(query) || open[g.slug] || !g.name;
          return (
            <div key={g.slug} className="od-sidebar-group">
              {g.name ? (
                <button
                  type="button"
                  className="od-sidebar-link od-sidebar-top"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [g.slug]: !isOpen }))}
                >
                  <span>{g.name}</span>
                  <ChevronRight size={14} className="od-chevron" />
                </button>
              ) : null}
              {isOpen ? (
                <div className={g.name ? 'od-sidebar-children' : undefined}>
                  {g.items.map((i) => (
                    <a
                      key={i.slug}
                      href={`${base}/${i.slug}/`}
                      onClick={go(i.slug)}
                      className="od-sidebar-link"
                      data-active={active === i.slug}
                      data-deprecated={i.deprecated || undefined}
                    >
                      <span className="od-sidebar-label">{i.title}</span>
                      <span className={`od-sidebar-method od-method-${i.method}`}>{METHOD_LABEL[i.method] ?? i.method.toUpperCase()}</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {hasModels && !query ? (
          <a href={`${base}/models/`} onClick={go('models')} className="od-sidebar-link od-sidebar-top" data-active={active === 'models'}>
            Models
          </a>
        ) : null}
      </nav>
    </aside>
    </>
  );
}

/** Scrolls to the operation of a per-operation URL on first load. */
export function InitialScroll({ slug }: { slug?: string }) {
  useEffect(() => {
    if (!slug || slug === 'introduction') return;
    document.querySelector(`[data-od-section="${slug}"]`)?.scrollIntoView({ block: 'start' });
  }, [slug]);
  return null;
}
