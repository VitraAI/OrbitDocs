'use client';

import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { LuCheck, LuCopy, LuRotateCcw } from 'react-icons/lu';

/** The easing every landing animation shares: a quick start, a long soft landing. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Fades and lifts its children in when they scroll into view (once).
 * With `prefers-reduced-motion`, children show immediately.
 */
export function Reveal({
  children,
  className,
  style,
  delay = 0,
  y = 24,
  immediate,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  y?: number;
  /** Animate on mount instead of on scroll (for the hero). */
  immediate?: boolean;
}) {
  const reduce = useReducedMotion();
  const target = { opacity: 1, y: 0, filter: 'blur(0px)' };
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      {...(immediate ? { animate: target } : { whileInView: target, viewport: { once: true, margin: '0px 0px -80px 0px' } })}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A container whose <RevealItem> children appear one after another. */
export function RevealGroup({ children, className, style, stagger = 0.08, immediate }: { children: ReactNode; className?: string; style?: CSSProperties; stagger?: number; immediate?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : 'hidden'}
      {...(immediate ? { animate: 'shown' } : { whileInView: 'shown', viewport: { once: true, margin: '0px 0px -60px 0px' } })}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

/** One child of a <RevealGroup>. `spotlight` adds a glow that follows the pointer. */
export function RevealItem({ children, className, style, spotlight }: { children: ReactNode; className?: string; style?: CSSProperties; spotlight?: boolean }) {
  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--od-mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--od-my', `${e.clientY - r.top}px`);
  }, []);
  return (
    <motion.div
      className={className}
      style={style}
      data-spotlight={spotlight ? '' : undefined}
      onPointerMove={spotlight ? onPointerMove : undefined}
      variants={{
        hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
        shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Counts up to the number inside `value` when it scrolls into view, keeping
 * whatever surrounds it: "12", "99.95%", "< 120 ms", "10k+".
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -40px 0px' });
  const reduce = useReducedMotion();
  const match = /(-?\d[\d,]*(?:\.\d+)?)/.exec(value);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!match || !inView || reduce) return;
    const raw = match[1]!;
    const target = Number(raw.replace(/,/g, ''));
    const decimals = raw.includes('.') ? raw.split('.')[1]!.length : 0;
    const grouped = raw.includes(',');
    const format = (n: number) => {
      const fixed = n.toFixed(decimals);
      return grouped ? Number(fixed).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : fixed;
    };
    const controls = animate(0, target, {
      duration: 1.6,
      ease: EASE,
      onUpdate: (n) => setShown(value.replace(raw, format(n))),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value]);
  return (
    <span ref={ref} aria-label={value}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}

interface TerminalLine {
  kind: 'cmd' | 'out' | 'comment';
  text: string;
}

const parseLines = (lines: string[]): TerminalLine[] =>
  lines.map((l) => (l.startsWith('$ ') ? { kind: 'cmd', text: l.slice(2) } : l.startsWith('# ') ? { kind: 'comment', text: l } : { kind: 'out', text: l }));

/**
 * A terminal that types its commands and prints their output when it scrolls
 * into view. Lines starting with `$ ` are commands, `# ` comments, the rest output.
 */
export function Terminal({ lines, title = 'Terminal', speed = 32, loop = false }: { lines: string[]; title?: string; speed?: number; loop?: boolean }) {
  const parsed = parseLines(lines);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: !loop, margin: '0px 0px -80px 0px' });
  const reduce = useReducedMotion();
  // [line index, characters typed in that line]
  const [cursor, setCursor] = useState<[number, number]>(reduce ? [parsed.length, 0] : [0, 0]);
  const [copied, setCopied] = useState(false);
  const [run, setRun] = useState(0);
  const done = cursor[0] >= parsed.length;

  useEffect(() => {
    if (reduce) {
      setCursor([parsed.length, 0]);
      return;
    }
    if (!inView || done) {
      if (done && loop && inView) {
        const t = setTimeout(() => setCursor([0, 0]), 4000);
        return () => clearTimeout(t);
      }
      return;
    }
    const [i, c] = cursor;
    const line = parsed[i]!;
    if (line.kind === 'cmd' && c < line.text.length) {
      const t = setTimeout(() => setCursor([i, c + 1]), speed + Math.random() * speed * 0.6);
      return () => clearTimeout(t);
    }
    const pause = line.kind === 'cmd' ? 420 : 140;
    const t = setTimeout(() => setCursor([i + 1, 0]), pause);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, inView, reduce, run]);

  const copy = async () => {
    await navigator.clipboard.writeText(parsed.filter((l) => l.kind === 'cmd').map((l) => l.text).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={ref} className="od-terminal not-prose">
      <div className="od-terminal-bar">
        <span className="od-terminal-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="od-terminal-title">{title}</span>
        <span className="od-terminal-tools">
          {done && !reduce ? (
            <button
              type="button"
              aria-label="Replay"
              onClick={() => {
                setCursor([0, 0]);
                setRun((r) => r + 1);
              }}
            >
              <LuRotateCcw size={14} />
            </button>
          ) : null}
          <button type="button" aria-label="Copy commands" onClick={() => void copy()}>
            {copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
          </button>
        </span>
      </div>
      {/* Focusable so keyboard readers can scroll long lines (the scrollbar is hidden). */}
      <pre className="od-terminal-body" tabIndex={0} aria-label={parsed.map((l) => (l.kind === 'cmd' ? `$ ${l.text}` : l.text)).join('\n')}>
        {parsed.map((line, i) => {
          if (i > cursor[0]) return null;
          const typing = i === cursor[0];
          if (line.kind === 'cmd') {
            const text = typing ? line.text.slice(0, cursor[1]) : line.text;
            return (
              <div key={i} className="od-terminal-line" aria-hidden>
                <span className="od-terminal-prompt">$</span> <span className="od-terminal-cmd">{text}</span>
                {typing ? <span className="od-terminal-caret" /> : null}
              </div>
            );
          }
          if (typing) return null;
          return (
            <motion.div key={i} className={`od-terminal-line od-terminal-${line.kind}`} aria-hidden initial={reduce ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
              {line.text || ' '}
            </motion.div>
          );
        })}
        {done ? (
          <div className="od-terminal-line" aria-hidden>
            <span className="od-terminal-prompt">$</span> <span className="od-terminal-caret" />
          </div>
        ) : null}
      </pre>
    </div>
  );
}

export interface ShowcaseTab {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  content?: ReactNode;
}

/**
 * Tabs on one side, a visual on the other. Advances on its own every
 * `interval` ms (a progress bar shows when) until someone picks a tab.
 */
export function ShowcaseTabs({ items, interval = 6000 }: { items: ShowcaseTab[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-20% 0px -20% 0px' });
  const reduce = useReducedMotion();
  const playing = auto && inView && !reduce && items.length > 1;
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % items.length), interval);
    return () => clearTimeout(t);
  }, [playing, active, interval, items.length]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="od-showcase-tabs not-prose">
      <div className="od-showcase-list" role="tablist" aria-label="Features">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            className="od-showcase-tab"
            data-active={i === active ? '' : undefined}
            onClick={() => {
              setActive(i);
              setAuto(false);
            }}
          >
            <span className="od-showcase-tab-head">
              {item.icon ? <span className="od-showcase-tab-icon">{item.icon}</span> : null}
              <span className="od-showcase-tab-title">{item.title}</span>
            </span>
            <AnimatePresence initial={false}>
              {i === active && item.description ? (
                <motion.span
                  className="od-showcase-tab-desc"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <span>{item.description}</span>
                </motion.span>
              ) : null}
            </AnimatePresence>
            {i === active && playing ? <motion.span key={`p${active}`} className="od-showcase-progress" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: interval / 1000, ease: 'linear' }} /> : null}
          </button>
        ))}
      </div>
      <div className="od-showcase-stage" role="tabpanel">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            className="od-showcase-panel"
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, y: -12, scale: 0.98, filter: 'blur(6px)' }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {items[active]!.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * A browser window around a screenshot (light and dark versions) or any
 * children. It tilts back flat as it scrolls into view.
 */
export function BrowserFrame({ url, src, srcDark, alt = '', children, tilt = true }: { url?: string; src?: string; srcDark?: string; alt?: string; children?: ReactNode; tilt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotate = useSpring(useTransform(scrollYProgress, [0, 1], [18, 0]), { stiffness: 120, damping: 24 });
  const scale = useSpring(useTransform(scrollYProgress, [0, 1], [0.94, 1]), { stiffness: 120, damping: 24 });
  const still = useMotionValue(0);
  const one = useMotionValue(1);
  const moving = tilt && !reduce;
  return (
    <div className="od-browser-wrap not-prose" style={{ perspective: 1400 }}>
      <motion.div ref={ref} className="od-browser" style={{ rotateX: moving ? rotate : still, scale: moving ? scale : one }}>
        <div className="od-browser-bar">
          <span className="od-terminal-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {url ? <span className="od-browser-url">{url}</span> : null}
        </div>
        <div className="od-browser-body">
          {src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} className={srcDark ? 'od-only-light' : undefined} loading="lazy" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {srcDark ? <img src={srcDark} alt={alt} className="od-only-dark" loading="lazy" /> : null}
            </>
          ) : (
            children
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** The line joining <Flow> steps, drawn as the steps scroll into view. */
export function FlowLine() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="od-flow-line"
      initial={reduce ? false : { scaleX: 0, scaleY: 0 }}
      whileInView={{ scaleX: 1, scaleY: 1 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
    />
  );
}
