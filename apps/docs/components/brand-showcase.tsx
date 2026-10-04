'use client';

import { Button, Switch } from '@heroui/react';
import { useMotionValue } from 'motion/react';
import { useEffect, useState } from 'react';
import { LuRotateCcw } from 'react-icons/lu';

import { AnimatedLogo, LOGO_INTRO_SECONDS, LOGO_LOOP_SECONDS } from './animated-logo';

type Tone = 'light' | 'dark';

/** The /brand page's top: the animated logo on light and dark, with Replay and an idle-loop switch. */
export function BrandShowcase() {
  const [run, setRun] = useState(0);
  const [loop, setLoop] = useState(true);
  return (
    <section className="bp-hero not-prose">
      <span className="od-eyebrow">Brand</span>
      <h1>The OrbitDocs logo</h1>
      <p className="bp-lead">
        A vector rebuild of the mark and wordmark, animated with Motion: the planet glows in, the
        ring draws itself with the satellite riding its tip, the page lands and writes its lines,
        and the wordmark rises letter by letter.
      </p>
      <div className="bp-controls">
        <Button variant="primary" onPress={() => setRun((r) => r + 1)}>
          <LuRotateCcw size={15} aria-hidden />
          Replay
        </Button>
        <Switch isSelected={loop} onChange={setLoop}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Idle loop
          </Switch.Content>
        </Switch>
      </div>
      <div className="bp-stages">
        {(['light', 'dark'] as const).map((tone) => (
          <Stage key={tone} tone={tone} run={run} loop={loop} />
        ))}
      </div>
    </section>
  );
}

function Stage({ tone, run, loop }: { tone: Tone; run: number; loop: boolean }) {
  return (
    <figure className="bp-stage" data-tone={tone}>
      <figcaption>{tone === 'light' ? 'On light' : 'On dark'}</figcaption>
      <div className="bp-stage-full">
        <AnimatedLogo
          key={`full-${run}`}
          variant="full"
          theme={tone}
          loop={loop}
          size={96}
          className="bp-logo-full"
        />
      </div>
      <div className="bp-stage-marks">
        {[96, 56, 32].map((size) => (
          <div key={size} className="bp-mark-cell">
            <AnimatedLogo
              key={`mark-${size}-${run}`}
              variant="mark"
              theme={tone}
              loop={loop && size > 32}
              size={size}
            />
            <span>{size}px</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

declare global {
  interface Window {
    /** Set by /brand?capture=…: seek the logo to `t` seconds, for frame-by-frame recording. */
    __orbitLogo?: { seek: (t: number) => void; intro: number; loop: number };
  }
}

const CAPTURE_BG: Record<Tone, string> = { light: '#ffffff', dark: '#0b0c14' };

/**
 * Recording mode, off unless the URL has `?capture=<full|mark>-<light|dark>`
 * (optional `&bg=<hex|transparent>` and `&w=<logo width in vw, or vh for the mark>`): the logo alone,
 * centred on a plain background, its timeline driven by window.__orbitLogo.seek(t).
 */
export function BrandCapture() {
  const time = useMotionValue(0);
  const [cfg, setCfg] = useState<{
    variant: 'full' | 'mark';
    tone: Tone;
    bg: string;
    width: number;
  } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const capture = q.get('capture');
    if (!capture) return;
    const [variant, tone] = capture.split('-') as ['full' | 'mark', Tone];
    const bg = q.get('bg');
    setCfg({
      variant: variant === 'mark' ? 'mark' : 'full',
      tone: tone === 'dark' ? 'dark' : 'light',
      bg:
        bg === 'transparent'
          ? bg
          : bg
            ? `#${bg.replace(/^#/, '')}`
            : CAPTURE_BG[tone === 'dark' ? 'dark' : 'light'],
      width: Number(q.get('w')) || (variant === 'mark' ? 56 : 62),
    });
    window.__orbitLogo = {
      seek: (t) => time.set(t),
      intro: LOGO_INTRO_SECONDS,
      loop: LOGO_LOOP_SECONDS,
    };
    const root = document.documentElement;
    root.style.overflow = 'hidden';
    if (bg === 'transparent') {
      // Only the logo is painted, so a screenshot without background keeps its alpha.
      root.style.background = 'transparent';
      document.body.style.background = 'transparent';
      document.body.style.visibility = 'hidden';
    }
  }, [time]);

  if (!cfg) return null;
  return (
    <div className="bp-capture" style={{ background: cfg.bg, visibility: 'visible' }}>
      <AnimatedLogo
        variant={cfg.variant}
        theme={cfg.tone}
        timeline={time}
        size={100}
        style={
          cfg.variant === 'mark'
            ? { width: `${cfg.width}vh`, height: `${cfg.width}vh` }
            : { width: `${cfg.width}vw`, height: 'auto' }
        }
      />
    </div>
  );
}
