'use client';

import { Alert, Button, Description, Dropdown, FieldError, Form, Header, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LuBookOpen, LuCheck, LuChevronsUpDown, LuKeyRound, LuLayoutGrid, LuLogOut, LuMonitor, LuMoon, LuShieldCheck, LuSun } from 'react-icons/lu';

import { api, type Me, useApi } from '@/lib/api';

export interface Crumb {
  label: ReactNode;
  href?: string;
  switcher?: CrumbSwitcher;
}

export interface NavTab {
  id: string;
  label: string;
  href: string;
}

type Theme = 'light' | 'dark' | 'system';

function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(dark ? 'dark' : 'light');
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    try {
      setTheme((localStorage.getItem('od-theme') as Theme | null) ?? 'system');
    } catch {
      // private mode
    }
  }, []);
  const pick = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      if (t === 'system') localStorage.removeItem('od-theme');
      else localStorage.setItem('od-theme', t);
    } catch {
      // private mode
    }
  };
  const options: Array<[Theme, ReactNode, string]> = [
    ['system', <LuMonitor key="s" size={13} />, 'System'],
    ['light', <LuSun key="l" size={13} />, 'Light'],
    ['dark', <LuMoon key="d" size={13} />, 'Dark'],
  ];
  return (
    <div className="flex items-center rounded-full border border-[var(--border)] p-0.5" role="radiogroup" aria-label="Theme">
      {options.map(([t, icon, label]) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          aria-label={label}
          onClick={() => pick(t)}
          className={`grid size-6 place-items-center rounded-full transition-colors ${theme === t ? 'bg-[var(--default)] text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

/** The full OrbitDocs logo; "Orbit" switches to a light colour in dark mode. */
export function Wordmark({ className = 'h-8' }: { className?: string }) {
  return (
    <>
      <img src="/logo-light.png" alt="OrbitDocs" className={`${className} w-auto dark:hidden`} />
      <img src="/logo-dark.png" alt="OrbitDocs" className={`${className} hidden w-auto dark:block`} />
    </>
  );
}

/** "Built by Vitra.ai": the team behind OrbitDocs, in the dashboard footer and on sign-in. */
export function BuiltByVitra({ className = '' }: { className?: string }) {
  return (
    <a href="https://vitra.ai" target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] ${className}`}>
      <span>Built by</span>
      <img src="/vitra/vitra-logo.png" alt="Vitra.ai" className="h-4 w-auto dark:hidden" />
      <img src="/vitra/vitra-logo-white.png" alt="Vitra.ai" className="hidden h-4 w-auto dark:block" />
    </a>
  );
}

/** The breadcrumb separator: a slanted hairline. */
const Slash = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 rotate-[20deg] bg-[var(--od-slash)]" />;

/** A crumb with a switcher next to it (Vercel's project picker). */
export interface CrumbSwitcher {
  title: string;
  items: Array<{ id: string; text: string; label: ReactNode; href: string }>;
  selected?: string;
  footer?: { label: string; href: string };
}

function Switcher({ switcher }: { switcher: CrumbSwitcher }) {
  const router = useRouter();
  return (
    <Dropdown>
      <Dropdown.Trigger aria-label={`Switch ${switcher.title.toLowerCase()}`} className="grid h-7 w-5 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--default)] hover:text-[var(--foreground)]">
        <LuChevronsUpDown size={14} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom start" className="min-w-64">
        <Dropdown.Menu
          aria-label={switcher.title}
          onAction={(key) => {
            const to = key === '__footer' ? switcher.footer?.href : switcher.items.find((i) => i.id === key)?.href;
            if (to) router.push(to);
          }}
        >
          <Dropdown.Section>
            <Header>{switcher.title}</Header>
            {switcher.items.map((item) => (
              <Dropdown.Item key={item.id} id={item.id} textValue={item.text}>
                {item.label}
                {item.id === switcher.selected ? <LuCheck size={14} className="ml-auto text-[var(--foreground)]" /> : null}
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
          {switcher.footer ? (
            <Dropdown.Section>
              <Dropdown.Item id="__footer" textValue={switcher.footer.label}>
                <span className="flex items-center gap-2.5">
                  <span className="grid size-5 place-items-center text-[var(--muted)]">
                    <LuLayoutGrid size={14} />
                  </span>
                  <Label>{switcher.footer.label}</Label>
                </span>
              </Dropdown.Item>
            </Dropdown.Section>
          ) : null}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

interface Rect {
  left: number;
  width: number;
}

/** Section tabs: a highlight glides under the pointer, the active line slides between tabs. */
function NavTabs({ tabs, active }: { tabs: NavTab[]; active?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(false);
  const [instant, setInstant] = useState(true);
  const [line, setLine] = useState<Rect | null>(null);
  const [animate, setAnimate] = useState(false);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      const tab = el.querySelector<HTMLElement>('[data-active]');
      setLine(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null);
    };
    measure();
    // On narrow screens the bar scrolls sideways: keep the active tab in view.
    const tab = el.querySelector<HTMLElement>('[data-active]');
    const bar = el.parentElement;
    if (tab && bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, tab.offsetLeft + el.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const t = setTimeout(() => setAnimate(true), 50);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [active, tabs.length]);
  const enter = (e: React.MouseEvent<HTMLElement>) => {
    // Appear in place when the pointer arrives; glide between tabs after that.
    setInstant(!visible);
    setPos({ left: e.currentTarget.offsetLeft, width: e.currentTarget.offsetWidth });
    setVisible(true);
  };
  return (
    <div ref={list} className="relative flex" onMouseLeave={() => setVisible(false)}>
      <span aria-hidden className="navtab-hover" style={{ left: pos?.left ?? 0, width: pos?.width ?? 0, opacity: visible ? 1 : 0, transition: instant ? 'opacity 150ms' : undefined }} />
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} className="navtab" onMouseEnter={enter} data-active={t.id === active ? '' : undefined} aria-current={t.id === active ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
      {line ? <span aria-hidden className="navtab-line" style={{ left: line.left + 8, width: line.width - 16, transition: animate ? undefined : 'none' }} /> : null}
    </div>
  );
}

/** Change your own password: current + new. SSO-only accounts get an explanation instead. */
function ChangePassword({ me, open, onOpenChange }: { me: NonNullable<Me['user']>; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setDone(false);
  }, [open]);
  const tooShort = next.length > 0 && next.length < 10;
  const same = next.length > 0 && next === current;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current.length > 0 && next.length >= 10 && !same && confirm === next;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/password', { method: 'POST', json: { currentPassword: current, newPassword: next } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Change Password</Modal.Heading>
            </Modal.Header>
            {!me.hasPassword ? (
              <>
                <Modal.Body>
                  <p className="text-sm text-[var(--muted)]">
                    <span className="font-medium text-[var(--foreground)]">{me.email}</span> signs in with single sign-on and has no OrbitDocs password. Change your password with your identity provider.
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button slot="close">Close</Button>
                </Modal.Footer>
              </>
            ) : done ? (
              <>
                <Modal.Body className="flex flex-col gap-3">
                  <Alert status="success">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Password changed</Alert.Title>
                      <Alert.Description>You stay signed in here. Every other session was signed out.</Alert.Description>
                    </Alert.Content>
                  </Alert>
                </Modal.Body>
                <Modal.Footer>
                  <Button slot="close">Done</Button>
                </Modal.Footer>
              </>
            ) : (
              <Form onSubmit={submit} validationBehavior="aria">
                <Modal.Body className="flex flex-col gap-4">
                  <input type="text" name="username" autoComplete="username" value={me.email} readOnly hidden />
                  <TextField isRequired type="password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus>
                    <Label>Current Password</Label>
                    <Input />
                  </TextField>
                  <TextField isRequired type="password" value={next} onChange={setNext} isInvalid={tooShort || same} autoComplete="new-password">
                    <Label>New Password</Label>
                    <Input />
                    {tooShort ? <FieldError>At least 10 characters.</FieldError> : same ? <FieldError>Choose a password different from the current one.</FieldError> : <Description>At least 10 characters.</Description>}
                  </TextField>
                  <TextField isRequired type="password" value={confirm} onChange={setConfirm} isInvalid={mismatch} autoComplete="new-password">
                    <Label>Confirm New Password</Label>
                    <Input />
                    {mismatch ? <FieldError>The passwords don&apos;t match.</FieldError> : null}
                  </TextField>
                  {error ? (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : (
                    <p className="text-[13px] text-[var(--muted)]">Other browsers and devices are signed out when you change it.</p>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" slot="close">
                    Cancel
                  </Button>
                  <Button type="submit" isPending={busy} isDisabled={!valid}>
                    Change Password
                  </Button>
                </Modal.Footer>
              </Form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

const avatarGradient = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 85% 62%), hsl(${(h + 70) % 360} 85% 52%))`;
};

/**
 * Signed-in frame, Vercel-style: a breadcrumb row (logo / scope / page) that
 * scrolls away, and a sticky, translucent row of tabs that picks up the mark
 * once the breadcrumbs are gone. Redirects to /login when signed out.
 */
export function Shell({ crumbs = [], tabs: tabsProp = [], active, children }: { crumbs?: Crumb[]; tabs?: NavTab[] | ((me: NonNullable<Me['user']>) => NavTab[]); active?: string; children: (me: NonNullable<Me['user']>) => ReactNode }) {
  const { data, loading } = useApi<Me>('/api/auth/me');
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => {
    if (!loading && data && !data.user) router.replace(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [data, loading, router]);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 52);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!data?.user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  }
  const me = data.user;
  const tabs = typeof tabsProp === 'function' ? tabsProp(me) : tabsProp;
  const name = me.name ?? me.email.split('@')[0];
  const initials = (me.name ?? me.email).split(/[\s@.]+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-secondary)]">
      <div aria-hidden className="od-brandline" />
      <header className={`bg-[var(--background)] ${tabs.length ? '' : 'sticky top-0 z-30 border-b border-[var(--border)]'}`}>
        <div className="flex h-[52px] items-center gap-0.5 px-4 sm:px-6">
          <Link href="/" aria-label="OrbitDocs home" className="mr-1 grid size-8 shrink-0 place-items-center rounded-lg transition-transform hover:scale-105">
            <img src="/icon.png" alt="" className="size-7" />
          </Link>
          <Slash />
          <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 pl-1 text-sm font-medium transition-colors hover:bg-[var(--default)]">
            <span className="size-5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ background: avatarGradient(me.email) }} />
            <span className={`truncate ${crumbs.length ? 'hidden sm:inline' : ''}`}>{me.isAdmin ? 'Platform' : name}</span>
            {me.isAdmin ? <span className={`od-badge ${crumbs.length ? 'hidden sm:inline-flex' : ''}`}>Admin</span> : null}
          </Link>
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center">
              <Slash />
              {c.href ? (
                <Link href={c.href} className="truncate rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:bg-[var(--default)]">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate px-2 text-sm font-medium">{c.label}</span>
              )}
              {c.switcher ? <Switcher switcher={c.switcher} /> : null}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <a href="https://github.com/VitraAI/OrbitDocs" target="_blank" rel="noreferrer" className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--default)] hover:text-[var(--foreground)] sm:flex">
              <LuBookOpen size={14} /> Docs
            </a>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-[var(--border)] sm:block" />
            <Dropdown>
              <Dropdown.Trigger aria-label="Account" className="rounded-full ring-offset-2 ring-offset-[var(--background)] transition-shadow hover:ring-2 hover:ring-[var(--border)]">
                <span className="grid size-8 place-items-center rounded-full text-[11px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" style={{ background: avatarGradient(me.email + 'u') }}>
                  {initials}
                </span>
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end" className="min-w-64">
                <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: avatarGradient(me.email + 'u') }}>
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="truncate text-[13px] text-[var(--muted)]">{me.email}</div>
                  </div>
                </div>
                {me.isAdmin ? (
                  <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-md bg-[var(--default)] px-2 py-1 text-xs text-[var(--muted)]">
                    <LuShieldCheck size={12} /> Platform admin
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-y border-[var(--border)] px-3 py-2 text-sm">
                  Theme
                  <ThemeSwitch />
                </div>
                <Dropdown.Menu
                  aria-label="Account actions"
                  onAction={async (key) => {
                    if (key === 'password') setPasswordOpen(true);
                    if (key === 'logout') {
                      await api('/api/auth/logout', { method: 'POST' });
                      router.replace('/login/');
                    }
                  }}
                >
                  <Dropdown.Item id="password" textValue="Change password">
                    <Label>Change password</Label>
                    <LuKeyRound size={14} className="ml-auto" />
                  </Dropdown.Item>
                  <Dropdown.Item id="logout" textValue="Log out">
                    <Label>Log out</Label>
                    <LuLogOut size={14} className="ml-auto" />
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>
      </header>
      {tabs.length ? (
        <nav className="od-tabbar" data-stuck={stuck ? '' : undefined} aria-label="Sections">
          <div className="flex items-center overflow-x-auto px-2 sm:px-4" style={{ scrollbarWidth: 'none' }}>
            <Link href="/" aria-label="OrbitDocs home" tabIndex={stuck ? 0 : -1} className="od-tabbar-mark">
              <img src="/icon.png" alt="" className="size-6" />
            </Link>
            <NavTabs tabs={tabs} active={active} />
          </div>
        </nav>
      ) : null}
      {children(me)}
      <footer className="mx-auto mt-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 pt-12 pb-8 text-xs text-[var(--muted)] sm:px-6">
        <span>OrbitDocs · open source, MIT</span>
        <BuiltByVitra />
      </footer>
      <ChangePassword me={me} open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

/** The grey title band under the header, Vercel-style. */
export function TitleBand({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-9 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.04em]">{title}</h1>
          {description ? <div className="mt-1 text-sm text-[var(--muted)]">{description}</div> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">{children}</main>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-[var(--border)] text-[var(--muted)]">{icon}</span>
      <div className="font-medium">{title}</div>
      {children ? <div className="max-w-md text-sm text-[var(--muted)]">{children}</div> : null}
    </div>
  );
}

export const globalTabs = (isAdmin: boolean): NavTab[] => [
  { id: 'overview', label: 'Overview', href: '/' },
  ...(isAdmin
    ? [
        { id: 'activity', label: 'Activity', href: '/admin/?tab=audit' },
        { id: 'users', label: 'Users', href: '/admin/?tab=users' },
      ]
    : []),
];
