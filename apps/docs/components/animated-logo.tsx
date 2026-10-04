'use client';

import {
  animate,
  backOut,
  cubicBezier,
  motion,
  type MotionValue,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';

import {
  angleAtDrawFraction,
  ASPECT,
  DOC_BODY_D,
  DOC_FOLD_D,
  DOC_LINE_WIDTH,
  DOC_LINES,
  DOCS_SPAN,
  GLYPHS,
  INK,
  type LogoVariant,
  MARK_IN_FULL_TRANSFORM,
  type Paint,
  type PaintName,
  PAINTS,
  PLANET,
  RING_BACK_RECT,
  RING_D,
  RING_DRAW_D,
  RING_FRONT_RECT,
  RING_HIGHLIGHT_D,
  RING_MID,
  RING_SHADOW_D,
  RING_TRANSFORM,
  ringPoint,
  SAT_ORBIT,
  SAT_R,
  SAT_REST_ANGLE,
  VIEWBOX,
} from './animated-logo-art';

/** Seconds the intro takes; the logo is at rest from here on. */
export const LOGO_INTRO_SECONDS = 3.2;
/** Seconds in one idle cycle (one satellite orbit); every idle motion repeats with it. */
export const LOGO_LOOP_SECONDS = 10;

export interface AnimatedLogoProps {
  /** The mark with the "OrbitDocs" wordmark, or the mark alone. */
  variant?: LogoVariant;
  /** Colour of "Orbit": navy on light, near-white on dark. `auto` follows the `.dark` class. */
  theme?: 'light' | 'dark' | 'auto';
  /** Keep a subtle idle loop going after the intro (satellite orbit, floating page, shimmer). */
  loop?: boolean;
  /** Height in px; the width follows the logo's aspect ratio. */
  size?: number;
  /** Start the intro on mount, or the first time the logo scrolls into view. */
  play?: 'mount' | 'inView';
  /**
   * Drive the animation yourself (seconds since the intro started), e.g. to scrub
   * it or record frames. The logo then ignores `play` and `loop`.
   */
  timeline?: MotionValue<number>;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. */
  title?: string;
}

// ── Timing helpers: every value is a pure function of the time t (seconds) ──

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = cubicBezier(0.22, 1, 0.36, 1);
const easeInOut = cubicBezier(0.65, 0, 0.35, 1);
const pop = cubicBezier(0.34, 1.45, 0.64, 1);
/** Eased 0 → 1 progress of a segment that starts at `start` and lasts `dur`. */
const seg = (t: number, start: number, dur: number, ease: (v: number) => number = easeOut) =>
  ease(clamp01((t - start) / dur));
/** Seconds into the idle loop (0 during the intro). */
const idle = (t: number) => Math.max(0, t - LOGO_INTRO_SECONDS);
const TAU = Math.PI * 2;

const T = {
  planet: 0,
  ring: 0.35,
  ringDur: 1.5,
  doc: 1.0,
  lines: 1.5,
  letters: 1.2,
  docsSweep: 1.55,
  sheen: 2.25,
} as const;

/** The satellite's parametric angle on its orbit at time t. */
function satAngle(t: number): number {
  if (t < LOGO_INTRO_SECONDS) return angleAtDrawFraction(seg(t, T.ring, T.ringDur, easeInOut));
  return SAT_REST_ANGLE - (TAU * idle(t)) / LOGO_LOOP_SECONDS;
}

function Gradient({
  id,
  paint,
  children,
}: {
  id: string;
  paint: Omit<Paint, 'id'>;
  children?: never;
}) {
  const stops = paint.stops.map(([offset, color, opacity]) => (
    <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
  ));
  return paint.type === 'linear' ? (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" {...paint.attrs}>
      {stops}
    </linearGradient>
  ) : (
    <radialGradient id={id} gradientUnits="userSpaceOnUse" {...paint.attrs}>
      {stops}
    </radialGradient>
  );
}

const centred: CSSProperties = { transformBox: 'fill-box', transformOrigin: '50% 50%' };

/** One letter of the wordmark, rising in on its own beat. */
function Letter({
  d,
  index,
  time,
  fill,
}: {
  d: string;
  index: number;
  time: MotionValue<number>;
  fill?: string;
}) {
  const start = T.letters + index * 0.07;
  const y = useTransform(time, (t) => (1 - seg(t, start, 0.65)) * 46);
  const opacity = useTransform(time, (t) => seg(t, start, 0.35, (v) => v));
  return <motion.path d={d} fill={fill} style={{ y, opacity }} />;
}

/** One text line on the page, drawing left → right. */
function DocLine({
  line,
  index,
  time,
}: {
  line: (typeof DOC_LINES)[number];
  index: number;
  time: MotionValue<number>;
}) {
  const start = T.lines + index * 0.12;
  const pathLength = useTransform(time, (t) => seg(t, start, 0.45));
  const opacity = useTransform(time, (t) => seg(t, start, 0.08, (v) => v));
  return <motion.path d={`M${line.x1} ${line.y}H${line.x2}`} style={{ pathLength, opacity }} />;
}

/**
 * The OrbitDocs logo, animated: the planet glows in, the ring draws itself
 * around it with the satellite riding its tip, the page drops in and writes
 * its lines, and the wordmark rises letter by letter. With `loop`, the
 * satellite keeps orbiting (behind the planet and in front of it), the page
 * floats and the highlights shimmer. Reduced motion shows the logo at rest.
 */
export function AnimatedLogo({
  variant = 'full',
  theme = 'auto',
  loop = false,
  size = 48,
  play = 'mount',
  timeline,
  className,
  style,
  title = 'OrbitDocs',
}: AnimatedLogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = `odl${uid}-`;
  const u = (name: string) => `url(#${p}${name})`;

  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const ownTime = useMotionValue(0);
  const time = timeline ?? ownTime;
  const started = play === 'mount' || inView;
  const [introDone, setIntroDone] = useState(false);

  // The intro: once, when started (at rest straight away with reduced motion).
  useEffect(() => {
    if (timeline || !started) return;
    if (reduce) {
      ownTime.set(LOGO_INTRO_SECONDS);
      return;
    }
    ownTime.set(0);
    const intro = animate(ownTime, LOGO_INTRO_SECONDS, {
      duration: LOGO_INTRO_SECONDS,
      ease: 'linear',
      onComplete: () => setIntroDone(true),
    });
    return () => intro.stop();
  }, [timeline, reduce, started, ownTime]);

  // The idle loop after the intro. Turning `loop` off lets the current cycle glide to rest.
  useEffect(() => {
    if (timeline || reduce || !introDone || !loop) return;
    let idleRun: ReturnType<typeof animate> | undefined;
    const from = ownTime.get();
    const run = animate(ownTime, [from, LOGO_INTRO_SECONDS + LOGO_LOOP_SECONDS], {
      duration: LOGO_INTRO_SECONDS + LOGO_LOOP_SECONDS - from,
      ease: 'linear',
      onComplete: () => {
        ownTime.set(LOGO_INTRO_SECONDS);
        idleRun = animate(ownTime, [LOGO_INTRO_SECONDS, LOGO_INTRO_SECONDS + LOGO_LOOP_SECONDS], {
          duration: LOGO_LOOP_SECONDS,
          ease: 'linear',
          repeat: Infinity,
        });
      },
    });
    return () => {
      run.stop();
      idleRun?.stop();
      const left = LOGO_INTRO_SECONDS + LOGO_LOOP_SECONDS - ownTime.get();
      animate(ownTime, LOGO_INTRO_SECONDS + LOGO_LOOP_SECONDS, {
        duration: Math.min(1.2, left / 4),
        ease: 'easeOut',
      });
    };
  }, [timeline, reduce, introDone, loop, ownTime]);

  // Planet: scales up with a soft glow that fades away.
  const planetScale = useTransform(time, (t) => 0.45 + 0.55 * seg(t, T.planet, 0.85, pop));
  const planetOpacity = useTransform(time, (t) => seg(t, T.planet, 0.35, (v) => v));
  const glowOpacity = useTransform(time, (t) =>
    t < 0.55 ? 0.95 * seg(t, 0, 0.55) : 0.95 * (1 - seg(t, 0.55, 1.2, easeInOut)),
  );
  const glowScale = useTransform(time, (t) => 0.7 + 0.42 * seg(t, 0, 1.6));
  // Idle shimmer on the planet's highlight.
  const shimmer = useTransform(time, (t) => 0.9 * Math.pow(Math.sin((Math.PI * idle(t)) / 5), 2));

  // Ring: drawn through a mask.
  const ringLength = useTransform(time, (t) => seg(t, T.ring, T.ringDur, easeInOut));
  const ringOpacity = useTransform(time, (t) => (t < T.ring ? 0 : 1));

  // Satellite: rides the ring's tip, then orbits; drawn behind the planet on the back half.
  const satX = useTransform(time, (t) => ringPoint(SAT_ORBIT.rx, SAT_ORBIT.ry, satAngle(t)).x);
  const satY = useTransform(time, (t) => ringPoint(SAT_ORBIT.rx, SAT_ORBIT.ry, satAngle(t)).y);
  const satRadius = useTransform(
    time,
    (t) => SAT_R * (1 + 0.14 * (Math.sin(satAngle(t)) - Math.sin(SAT_REST_ANGLE))),
  );
  const satShown = (t: number) => seg(t, T.ring, 0.2, (v) => v);
  const satFront = useTransform(time, (t) => (Math.sin(satAngle(t)) >= 0 ? satShown(t) : 0));
  const satBack = useTransform(time, (t) => (Math.sin(satAngle(t)) < 0 ? satShown(t) : 0));

  // Page: drops in, then floats.
  const docY = useTransform(
    time,
    (t) => -42 * (1 - seg(t, T.doc, 0.75, backOut)) - 5 * Math.sin((TAU * idle(t)) / 5),
  );
  const docOpacity = useTransform(time, (t) => seg(t, T.doc, 0.18, (v) => v));
  const docScale = useTransform(time, (t) => 0.92 + 0.08 * seg(t, T.doc, 0.75, backOut));

  // "Docs": the gradient sweeps in from the left, then a sheen crosses the word (and again once per idle loop).
  const sweep = (t: number) => -560 * (1 - seg(t, T.docsSweep, 1.1, easeInOut));
  const docsX1 = useTransform(time, (t) => DOCS_SPAN.x1 + sweep(t));
  const docsX2 = useTransform(time, (t) => DOCS_SPAN.x2 + sweep(t));
  const sheenX = useTransform(time, (t) => {
    const start =
      t < LOGO_INTRO_SECONDS
        ? T.sheen
        : LOGO_INTRO_SECONDS + Math.floor(idle(t) / LOGO_LOOP_SECONDS) * LOGO_LOOP_SECONDS + 6;
    return DOCS_SPAN.x1 - 160 + 700 * seg(t, start, 0.85, easeInOut);
  });

  const inkClass = `${p}ink`;
  const ink = theme === 'auto' ? undefined : INK[theme];
  const markPaints = (Object.keys(PAINTS) as PaintName[]).filter(
    (n) => n !== 'docs' && n !== 'sheen',
  );
  const height = size;
  const width = Math.round(size * ASPECT[variant]);

  const mark = (
    <>
      {/* Glow (intro only). */}
      <motion.circle
        cx={PLANET.cx}
        cy={PLANET.cy}
        r={PLANET.r}
        fill={u('glow')}
        filter={u('blur')}
        style={{ ...centred, opacity: glowOpacity, scale: glowScale }}
      />

      {/* Back half of the ring, then the satellite while it is behind the planet. */}
      <g transform={RING_TRANSFORM}>
        <motion.g mask={u('ringMask')} style={{ opacity: ringOpacity }}>
          <path d={RING_D} fillRule="evenodd" fill={u('ringBack')} clipPath={u('back')} />
        </motion.g>
      </g>
      <motion.circle
        cx={satX}
        cy={satY}
        r={satRadius}
        fill={u('sat')}
        style={{ opacity: satBack }}
      />

      {/* Planet. */}
      <motion.g style={{ ...centred, scale: planetScale, opacity: planetOpacity }}>
        <circle cx={PLANET.cx} cy={PLANET.cy} r={PLANET.r} fill={u('planet')} />
        <circle cx={PLANET.cx} cy={PLANET.cy} r={PLANET.r} fill={u('core')} />
        <circle cx={PLANET.cx} cy={PLANET.cy} r={PLANET.r} fill={u('gloss')} />
        <motion.circle
          cx={PLANET.cx}
          cy={PLANET.cy}
          r={PLANET.r}
          fill={u('gloss')}
          style={{ opacity: shimmer }}
        />
      </motion.g>
      {/* The ring's shadow on the planet, fading in as the ring draws. */}
      <g clipPath={u('planetClip')}>
        <g transform={RING_TRANSFORM}>
          <motion.path
            d={RING_SHADOW_D}
            fill="none"
            stroke={u('ringShadow')}
            strokeWidth={44}
            filter={u('soft')}
            style={{ opacity: ringLength }}
          />
        </g>
      </g>

      {/* Page. */}
      <motion.g style={{ ...centred, y: docY, opacity: docOpacity, scale: docScale }}>
        <path d={DOC_BODY_D} fill={u('doc')} filter={u('shadow')} />
        <path d={DOC_FOLD_D} fill={u('fold')} />
        <g fill="none" stroke={u('line')} strokeWidth={DOC_LINE_WIDTH} strokeLinecap="round">
          {DOC_LINES.map((line, i) => (
            <DocLine key={line.y} line={line} index={i} time={time} />
          ))}
        </g>
      </motion.g>

      {/* Front half of the ring, over the planet and the page. */}
      <g transform={RING_TRANSFORM}>
        <motion.g mask={u('ringMask')} style={{ opacity: ringOpacity }}>
          <g clipPath={u('front')}>
            <path d={RING_D} fillRule="evenodd" fill={u('ringFront')} />
            <path
              d={RING_HIGHLIGHT_D}
              fill="none"
              stroke={u('ringHi')}
              strokeWidth={11}
              clipPath={u('ring')}
            />
          </g>
        </motion.g>
      </g>

      {/* Satellite in front. */}
      <motion.circle
        cx={satX}
        cy={satY}
        r={satRadius}
        fill={u('sat')}
        style={{ opacity: satFront }}
      />
    </>
  );

  return (
    <svg
      ref={ref}
      viewBox={VIEWBOX[variant]}
      width={width}
      height={height}
      overflow="visible"
      role="img"
      aria-label={title}
      className={className}
      style={style}
    >
      <title>{title}</title>
      {theme === 'auto' ? (
        <style>{`.${inkClass}{fill:${INK.light}}.dark .${inkClass}{fill:${INK.dark}}`}</style>
      ) : null}
      <defs>
        {markPaints.map((name) => (
          <Gradient key={name} id={`${p}${name}`} paint={PAINTS[name]} />
        ))}
        <motion.linearGradient
          id={`${p}docs`}
          gradientUnits="userSpaceOnUse"
          x1={docsX1}
          y1={DOCS_SPAN.y1}
          x2={docsX2}
          y2={DOCS_SPAN.y2}
        >
          {PAINTS.docs.stops.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </motion.linearGradient>
        <Gradient id={`${p}sheen`} paint={PAINTS.sheen} />
        <clipPath id={`${p}back`}>
          <rect {...RING_BACK_RECT} />
        </clipPath>
        <clipPath id={`${p}front`}>
          <rect {...RING_FRONT_RECT} />
        </clipPath>
        <clipPath id={`${p}ring`}>
          <path d={RING_D} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${p}planetClip`}>
          <circle cx={PLANET.cx} cy={PLANET.cy} r={PLANET.r} />
        </clipPath>
        <clipPath id={`${p}docsClip`}>
          {GLYPHS.filter((g) => g.word === 'docs').map((g) => (
            <path key={g.ch} d={g.d} />
          ))}
        </clipPath>
        <mask
          id={`${p}ringMask`}
          maskUnits="userSpaceOnUse"
          x={-420}
          y={-320}
          width={840}
          height={640}
        >
          <motion.path
            d={RING_DRAW_D}
            fill="none"
            stroke="#fff"
            strokeWidth={RING_MID.stroke}
            style={{ pathLength: ringLength }}
          />
        </mask>
        <filter id={`${p}shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="9" floodColor="#000a33" floodOpacity="0.35" />
        </filter>
        <filter id={`${p}soft`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={`${p}blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
      </defs>

      {variant === 'mark' ? (
        mark
      ) : (
        <>
          <g transform={MARK_IN_FULL_TRANSFORM}>{mark}</g>
          <g className={theme === 'auto' ? inkClass : undefined}>
            {GLYPHS.map((g, i) =>
              g.word === 'orbit' ? (
                <Letter key={g.ch} d={g.d} index={i} time={time} fill={ink} />
              ) : null,
            )}
          </g>
          <g fill={u('docs')}>
            {GLYPHS.map((g, i) =>
              g.word === 'docs' ? <Letter key={g.ch} d={g.d} index={i} time={time} /> : null,
            )}
          </g>
          <g clipPath={u('docsClip')}>
            <motion.rect
              y={DOCS_SPAN.y1 - 10}
              width={120}
              height={DOCS_SPAN.y2 - DOCS_SPAN.y1 + 20}
              fill={u('sheen')}
              style={{ x: sheenX }}
            />
          </g>
        </>
      )}
    </svg>
  );
}
