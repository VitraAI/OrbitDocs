'use client';

import { LuLock as Lock } from 'react-icons/lu';
import {
  Component,
  createContext,
  memo,
  type ReactNode,
  type RefObject,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ContentPosition } from '@orbitdocs/openapi';
import type {
  ExtraContent,
  GroupSectionsFile,
  ModelHead,
  ModelsSectionsFile,
  OperationData,
  OperationHead,
} from '../sections';
import { CopyButton } from './copy-button';
import { RequestCard } from './request-card';
import { ResponseCard } from './response-card';

/**
 * Lazily loaded sections. A reference page server-renders its own operation
 * (or the Models section) and placeholders for the rest; this loads their
 * full views from `<reference>/sections/<file>.json`: what comes into view
 * first, then everything else in the background, so the page ends up whole
 * (Ctrl+F, scrolling and the URL that follows the section in view work as on
 * one big page) without shipping it in every URL's HTML.
 */

interface SectionsContext {
  operations: Record<string, OperationData>;
  models: Record<string, string> | null;
  /** Watches a placeholder; its file loads first once it comes near the viewport. */
  observe: (el: Element, file: string) => () => void;
  /** Keeps a section in place while content above it loads (a sidebar click scrolling to it). */
  pin: (slug: string) => void;
}

const Ctx = createContext<SectionsContext | null>(null);

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Null outside a `<SectionsProvider>` (every section server-rendered). */
export function useSections(): SectionsContext | null {
  return useContext(Ctx);
}

const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === 'function')
      window.requestIdleCallback(() => resolve(), { timeout: 500 });
    else setTimeout(resolve, 16);
  });

interface Pin {
  slug: string;
  until: number;
}

/** The section at the top of the viewport (below the sticky header) and where it is. */
function topSection(): { el: HTMLElement; top: number } | null {
  const sections = document.querySelectorAll<HTMLElement>('[data-od-section]');
  for (const el of sections) {
    const rect = el.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (rect.bottom > line + 1) return { el, top: rect.top };
  }
  return null;
}

/**
 * Keeps what the reader looks at in place when sections above it load and
 * change height: measures the top section right before React touches the DOM
 * and scrolls by however much it moved. (Browser scroll anchoring is turned
 * off on reference pages so the two never both correct.)
 */
class ScrollAnchor extends Component<{
  version: number;
  pin: RefObject<Pin | null>;
  children: ReactNode;
}> {
  getSnapshotBeforeUpdate(prev: { version: number }) {
    if (prev.version === this.props.version || typeof document === 'undefined') return null;
    const pin = this.props.pin.current;
    if (pin && Date.now() < pin.until) return { pinned: pin.slug };
    return topSection();
  }

  componentDidUpdate(
    _prev: unknown,
    _state: unknown,
    snapshot?: { pinned: string } | { el: HTMLElement; top: number } | null,
  ) {
    if (!snapshot) return;
    if ('pinned' in snapshot) {
      document
        .querySelector(`[data-od-section="${snapshot.pinned}"]`)
        ?.scrollIntoView({ block: 'start' });
      return;
    }
    const delta = snapshot.el.getBoundingClientRect().top - snapshot.top;
    if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
  }

  render() {
    return this.props.children;
  }
}

export function SectionsProvider({
  url,
  files,
  first,
  children,
}: {
  /** `<reference>/sections`: `<file>.json` holds a group's operations, `models.json` the models. */
  url: string;
  /** Every file, in page order (group slugs, then `models`). */
  files: string[];
  /** The file of the page's own section: its neighbours load first. */
  first?: string;
  children: ReactNode;
}) {
  const [operations, setOperations] = useState<Record<string, OperationData>>({});
  const [models, setModels] = useState<Record<string, string> | null>(null);
  const [version, setVersion] = useState(0);
  const pinRef = useRef<Pin | null>(null);
  const queue = useRef({ pending: [] as string[], started: new Set<string>(), busy: false });

  const pump = useCallback(async () => {
    const q = queue.current;
    if (q.busy) return;
    q.busy = true;
    while (q.pending.length) {
      const file = q.pending.shift()!;
      if (q.started.has(file)) continue;
      q.started.add(file);
      try {
        const res = await fetch(`${url}/${file}.json`);
        if (res.ok) {
          const data = (await res.json()) as GroupSectionsFile & ModelsSectionsFile;
          startTransition(() => {
            if (data.models) setModels(data.models);
            if (data.operations) setOperations((o) => ({ ...o, ...data.operations }));
            setVersion((v) => v + 1);
          });
        }
      } catch {
        /* offline or blocked: the placeholder stays, its URL still has the full page */
      }
      await idle();
    }
    q.busy = false;
  }, [url]);

  const request = useCallback(
    (file: string, priority: boolean) => {
      const q = queue.current;
      if (q.started.has(file)) return;
      q.pending = q.pending.filter((f) => f !== file);
      if (priority) q.pending.unshift(file);
      else q.pending.push(file);
      void pump();
    },
    [pump],
  );

  // Everything loads in the background, nearest to the page's own section first.
  useEffect(() => {
    const at = Math.max(0, first ? files.indexOf(first) : 0);
    const order = [...files.slice(at), ...files.slice(0, at).reverse()];
    const start = () => order.forEach((f) => request(f, false));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 50);
    return () => clearTimeout(id);
  }, [files, first, request]);

  // Placeholders near the viewport jump the queue.
  const watched = useRef(new Map<Element, string>());
  const observer = useRef<IntersectionObserver | null>(null);
  const observe = useCallback(
    (el: Element, file: string) => {
      if (typeof IntersectionObserver === 'undefined') {
        request(file, true);
        return () => undefined;
      }
      observer.current ??= new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const f = watched.current.get(e.target);
            observer.current?.unobserve(e.target);
            watched.current.delete(e.target);
            if (f) request(f, true);
          }
        },
        { rootMargin: '100% 0px' },
      );
      watched.current.set(el, file);
      observer.current.observe(el);
      return () => {
        observer.current?.unobserve(el);
        watched.current.delete(el);
      };
    },
    [request],
  );
  useEffect(() => () => observer.current?.disconnect(), []);

  const pin = useCallback(
    (slug: string) => {
      const el = document.querySelector<HTMLElement>(`[data-od-section="${slug}"]`);
      if (el?.dataset.odFile && el.dataset.odPending) request(el.dataset.odFile, true);
      pinRef.current = { slug, until: Date.now() + 1500 };
    },
    [request],
  );
  // The reader scrolling on their own ends a pin.
  useEffect(() => {
    const unpin = () => {
      pinRef.current = null;
    };
    const opts = { passive: true } as const;
    window.addEventListener('wheel', unpin, opts);
    window.addEventListener('touchmove', unpin, opts);
    window.addEventListener('keydown', unpin);
    return () => {
      window.removeEventListener('wheel', unpin);
      window.removeEventListener('touchmove', unpin);
      window.removeEventListener('keydown', unpin);
    };
  }, []);

  const value = useMemo<SectionsContext>(
    () => ({ operations, models, observe, pin }),
    [operations, models, observe, pin],
  );
  return (
    <Ctx.Provider value={value}>
      <ScrollAnchor version={version} pin={pinRef}>
        {children}
      </ScrollAnchor>
    </Ctx.Provider>
  );
}

function Extras({
  items,
  position,
}: {
  items: Array<{ position: ContentPosition; node: ReactNode }>;
  position: ContentPosition;
}) {
  const here = items.filter((i) => i.position === position);
  if (!here.length) return null;
  return (
    <>
      {here.map((i, n) => (
        <div key={n} className={position === 'aside' ? 'od-extra od-extra-aside' : 'od-extra'}>
          {i.node}
        </div>
      ))}
    </>
  );
}

/** The Responses list; its schema HTML is the one "Show Schema" uses too, so it ships once. */
function Responses({ responses }: { responses: OperationData['responses'] }) {
  return (
    <div className="od-block">
      <h4 className="od-block-title">Responses</h4>
      <div className="od-responses">
        {responses.map((r) => {
          const head = (
            <>
              <span className="od-response-status" data-tone={r.status[0]}>
                {r.status}
              </span>
              <span className="od-response-text">{r.description}</span>
            </>
          );
          if (!r.schemaHtml && !r.headersHtml) {
            return (
              <div key={r.status} className="od-response od-response-flat">
                {head}
              </div>
            );
          }
          const body = `${r.mediaType ? `<div class='od-media-type'>${esc(r.mediaType)}</div>` : ''}${r.schemaHtml ?? ''}${r.headersHtml ?? ''}`;
          return (
            <details key={r.status} className="od-response">
              <summary>{head}</summary>
              <div className="od-response-body" dangerouslySetInnerHTML={{ __html: body }} />
            </details>
          );
        })}
      </div>
    </div>
  );
}

const OperationBody = memo(function OperationBody({
  data,
  extras,
}: {
  data: OperationData;
  extras: ExtraContent[];
}) {
  // MDX extras first, then the spec's own `x-orbitdocs-content` Markdown.
  const all = useMemo(
    () => [
      ...extras,
      ...data.inline.map((c) => ({
        position: c.position,
        node: <div className="od-prose" dangerouslySetInnerHTML={{ __html: c.html }} />,
      })),
    ],
    [extras, data.inline],
  );
  return (
    <div className="od-columns">
      <div className="od-column-main">
        {data.descriptionHtml ? (
          <div className="od-prose" dangerouslySetInnerHTML={{ __html: data.descriptionHtml }} />
        ) : null}
        <Extras items={all} position="after-description" />
        <Extras items={all} position="before-parameters" />
        {data.blocks.map((html, i) => (
          <div key={i} className="od-block" dangerouslySetInnerHTML={{ __html: html }} />
        ))}
        <Responses responses={data.responses} />
        <Extras items={all} position="after-responses" />
      </div>
      <div className="od-column-aside">
        <div className="od-sticky">
          <RequestCard
            method={data.method}
            path={data.path}
            samples={data.samples}
            options={data.sampleOptions}
            requestId={data.requestId}
          />
          <ResponseCard responses={data.responses} />
          <Extras items={all} position="aside" />
        </div>
      </div>
    </div>
  );
});

function Skeleton({ head, href }: { head: OperationHead; href: string }) {
  return (
    <div className="od-columns od-pending">
      <div className="od-column-main">
        <a className="od-pending-line" href={href}>
          <span className={`od-method od-method-${head.method}`}>{head.method.toUpperCase()}</span>
          <span className="od-path">{head.path}</span>
        </a>
        <div className="od-skeleton" style={{ width: '92%' }} />
        <div className="od-skeleton" style={{ width: '78%' }} />
        <div className="od-skeleton od-skeleton-block" />
        <div className="od-skeleton od-skeleton-block" />
      </div>
      <div className="od-column-aside">
        <div className="od-skeleton od-skeleton-card" />
      </div>
    </div>
  );
}

const NO_EXTRAS: ExtraContent[] = [];

/**
 * One operation's section: fully rendered from `data` (the page's own
 * operation, or every one without lazy loading), else a placeholder that
 * fills in once its group's file loads.
 */
export function OperationSlot({
  head,
  file,
  href,
  data: own,
  extras = NO_EXTRAS,
}: {
  head: OperationHead;
  /** Group file under `sections/` that holds this operation. */
  file: string;
  /** The operation's own URL. */
  href: string;
  data?: OperationData;
  /** From `reference/<api>/<operation>.mdx` files. */
  extras?: ExtraContent[];
}) {
  const sections = useSections();
  const data = own ?? sections?.operations[head.slug];
  const ref = useRef<HTMLElement>(null);
  const observe = sections?.observe;
  useEffect(() => {
    if (!data && observe && ref.current) return observe(ref.current, file);
  }, [data, observe, file]);
  const secured = data?.secured;

  return (
    <section
      ref={ref}
      className="od-operation"
      data-od-section={head.slug}
      data-od-file={file}
      data-od-pending={data ? undefined : 'true'}
      id={head.slug}
      style={data ? undefined : { minHeight: head.estimate }}
    >
      <div className="od-operation-head">
        <h3 className="od-operation-title">
          {head.summary}
          {head.deprecated ? (
            <span className="od-badge od-badge-deprecated">Deprecated</span>
          ) : null}
          {head.stability && head.stability !== 'stable' && head.stability !== 'deprecated' ? (
            <span className="od-badge od-badge-stability">{head.stability}</span>
          ) : null}
        </h3>
        {data ? (
          <div className="od-operation-actions">
            {secured ? (
              <span className="od-auth-required">
                <Lock size={13} /> Auth Required
              </span>
            ) : null}
            <CopyButton text={data.markdown} label="Copy as Markdown" className="od-ghost-button" />
          </div>
        ) : null}
      </div>
      {data ? <OperationBody data={data} extras={extras} /> : <Skeleton head={head} href={href} />}
    </section>
  );
}

/** The Models section: every model's name always, its fields once loaded (or from `data`). */
export function ModelsSlot({
  heads,
  data: own,
}: {
  heads: ModelHead[];
  data?: Record<string, string>;
}) {
  const sections = useSections();
  const data = own ?? sections?.models ?? undefined;
  const ref = useRef<HTMLElement>(null);
  const observe = sections?.observe;
  useEffect(() => {
    if (!data && observe && ref.current) return observe(ref.current, 'models');
  }, [data, observe]);
  return (
    <section
      ref={ref}
      className="od-models"
      data-od-section="models"
      data-od-file="models"
      data-od-pending={data ? undefined : 'true'}
      id="models"
    >
      <h2 className="od-tag-title">Models</h2>
      <div className="od-model-list">
        {heads.map((m) => (
          <details
            key={m.name}
            className="od-model"
            id={`model-${m.name}`}
            dangerouslySetInnerHTML={{
              __html: `<summary><span class="od-field-name">${esc(m.name)}</span>${
                m.description ? `<span class="od-muted"> ${esc(m.description)}</span>` : ''
              }</summary>${data?.[m.name] ?? ''}`,
            }}
          />
        ))}
      </div>
    </section>
  );
}
