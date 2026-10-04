'use client';

import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LuArrowRight, LuFileCode2, LuSparkles } from 'react-icons/lu';

/*
 * Site-only hero visual: a controller written with plain @nestjs/swagger
 * decorators on the left; each highlighted line builds its part of the
 * rendered reference on the right. Loops while in view.
 */

const k = (s: string) => <span className="xd-k">{s}</span>;
const d = (s: string) => <span className="xd-d">{s}</span>;
const s_ = (s: string) => <span className="xd-s">{s}</span>;
const t = (s: string) => <span className="xd-t">{s}</span>;
const c = (s: string) => <span className="xd-c">{s}</span>;
const n = (s: string) => <span className="xd-n">{s}</span>;

const LINES: ReactNode[] = [
  <>
    {d('@ApiTags')}({s_("'Bookings'")})
  </>,
  <>
    {d('@Controller')}({s_("'v1/bookings'")})
  </>,
  <>
    {k('export class')} {t('BookingsController')} {'{'}
  </>,
  <>{c('  /** Books seats on a flight for up to nine passengers. */')}</>,
  <>
    {'  '}
    {d('@Post')}()
  </>,
  <>
    {'  '}
    {d('@ApiOperation')}({'{'} summary: {s_("'Create a booking'")} {'}'})
  </>,
  <>
    {'  '}
    {d('@ApiResponse')}({'{'} status: {n('409')}, description: {s_("'Flight is full.'")} {'}'})
  </>,
  <>
    {'  '}create({d('@Body')}() body: {t('CreateBookingDto')}) {'{'}
  </>,
  <>
    {'    '}
    {k('return')} {k('this')}.bookings.create(body);
  </>,
  <>{'  }'}</>,
  <>{'}'}</>,
  <> </>,
  <>
    {k('export class')} {t('CreateBookingDto')} {'{'}
  </>,
  <>
    {'  '}
    {d('@ApiProperty')}({'{'} example: {s_("'flt_2031_proxima'")} {'}'})
  </>,
  <>{'  '}flightId: {t('string')};</>,
  <>
    {'  '}
    {d('@ApiProperty')}({'{'} type: [{t('PassengerDto')}], maxItems: {n('9')} {'}'})
  </>,
  <>{'  '}passengers: {t('PassengerDto')}[];</>,
  <>
    {'  '}
    {d('@ApiPropertyOptional')}({'{'} example: [{s_("'14A'")}] {'}'})
  </>,
  <>{'  '}seats?: {t('string')}[];</>,
  <>{'}'}</>,
];

/** Which code line lights up at each step, and what it adds to the page. */
const STEPS = [
  { lines: [0], label: 'Group from @ApiTags' },
  { lines: [1, 4], label: 'Method and path from @Controller and @Post' },
  { lines: [5], label: 'Title from @ApiOperation' },
  { lines: [3], label: 'Description from the doc comment' },
  { lines: [7, 12, 13, 14, 15, 16, 17, 18, 19], label: 'Body schema from the DTO and @ApiProperty' },
  { lines: [6], label: 'Errors from @ApiResponse, plus the standard ones' },
];

const FIELDS = [
  { name: 'flightId', type: 'string', req: true, note: 'Example: flt_2031_proxima' },
  { name: 'passengers', type: 'PassengerDto[]', req: true, note: 'At most 9 items' },
  { name: 'seats', type: 'string[]', req: false, note: 'Example: ["14A"]' },
];

const appear = { initial: { opacity: 0, y: 8, filter: 'blur(4px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, exit: { opacity: 0 }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } };

export function ExtractDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-10% 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? STEPS.length : -1);
  useEffect(() => {
    if (reduce) {
      setStep(STEPS.length);
      return;
    }
    if (!inView) return;
    const delay = step === -1 ? 700 : step >= STEPS.length ? 3200 : 1250;
    const timer = setTimeout(() => setStep((s) => (s >= STEPS.length ? -1 : s + 1)), delay);
    return () => clearTimeout(timer);
  }, [step, inView, reduce]);

  const shown = (i: number) => step >= i;
  const activeLines = step >= 0 && step < STEPS.length ? STEPS[step]!.lines : [];

  return (
    <div ref={ref} className="xd not-prose" aria-label="A NestJS controller with @nestjs/swagger decorators becomes an API reference page">
      <div className="xd-pane xd-code">
        <div className="xd-bar">
          <LuFileCode2 size={14} aria-hidden /> bookings.controller.ts
        </div>
        <pre>
          {LINES.map((line, i) => (
            <div key={i} className="xd-line" data-on={activeLines.includes(i) ? '' : undefined}>
              <span className="xd-ln">{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </pre>
        <div className="xd-caption" aria-live="polite">
          <AnimatePresence mode="wait">
            {step >= 0 && step < STEPS.length ? (
              <motion.span key={step} {...appear}>
                <LuSparkles size={13} aria-hidden /> {STEPS[step]!.label}
              </motion.span>
            ) : (
              <motion.span key="idle" {...appear}>
                Plain @nestjs/swagger — no extra decorators
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="xd-arrow" aria-hidden>
        <LuArrowRight size={18} />
      </div>

      <div className="xd-pane xd-page">
        <div className="xd-bar">
          <span className="xd-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          docs.orbit-travel.dev/reference
        </div>
        <div className="xd-doc">
          <AnimatePresence>
            {shown(0) ? (
              <motion.div key="group" className="xd-group" {...appear}>
                Bookings
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="xd-head">
            <AnimatePresence>
              {shown(1) ? (
                <motion.div key="route" className="xd-route" {...appear}>
                  <span className="xd-method">POST</span>
                  <code>/v1/bookings</code>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <AnimatePresence>
              {shown(2) ? (
                <motion.h4 key="title" {...appear}>
                  Create a booking
                </motion.h4>
              ) : (
                <div className="xd-skeleton xd-skeleton-title" />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {shown(3) ? (
                <motion.p key="desc" {...appear}>
                  Books seats on a flight for up to nine passengers.
                </motion.p>
              ) : (
                <div className="xd-skeleton" />
              )}
            </AnimatePresence>
          </div>

          <div className="xd-block">
            <div className="xd-label">Body</div>
            {FIELDS.map((f, i) => (
              <AnimatePresence key={f.name}>
                {shown(4) ? (
                  <motion.div className="xd-field" {...appear} transition={{ ...appear.transition, delay: i * 0.12 }}>
                    <code>{f.name}</code>
                    <span className="xd-type">{f.type}</span>
                    {f.req ? <span className="xd-req">required</span> : null}
                    <span className="xd-note">{f.note}</span>
                  </motion.div>
                ) : (
                  <div className="xd-skeleton xd-skeleton-row" />
                )}
              </AnimatePresence>
            ))}
          </div>

          <div className="xd-block">
            <div className="xd-label">Responses</div>
            <div className="xd-codes">
              <AnimatePresence>
                {shown(1) ? (
                  <motion.span key="201" className="xd-code-ok" {...appear}>
                    201
                  </motion.span>
                ) : null}
                {shown(5) ? (
                  <motion.span key="409" className="xd-code-err" {...appear}>
                    409 Flight is full.
                  </motion.span>
                ) : null}
                {shown(5) ? (
                  <motion.span key="400" className="xd-code-err" {...appear} transition={{ ...appear.transition, delay: 0.12 }}>
                    400 · 401 · 500
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
