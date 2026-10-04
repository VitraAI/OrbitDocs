/**
 * The OrbitDocs logo as vector art: one source for the animated React logo
 * (components/animated-logo.tsx) and the static SVG files in public/brand/.
 *
 * Coordinates:
 * - The mark lives in a 512 × 512 space (the planet is centred near 256, 258).
 * - The full logo lives in the original artwork's pixel space; the mark is placed
 *   there with MARK_IN_FULL and the wordmark glyphs (Outfit 700, converted to
 *   outlines) are already positioned.
 * - The ring is drawn in its own frame (centre at 0, 0, major axis on x), placed
 *   with RING_TRANSFORM. y > 0 in that frame is the half of the ring in front of
 *   the planet, y < 0 the half behind it.
 *
 * Plain data and string builders only, so Node can import this file directly
 * (type stripping) to regenerate the SVG files.
 */

export type LogoVariant = 'full' | 'mark';
export type LogoTheme = 'light' | 'dark';

/** "Orbit" in each theme; "Docs" is the gradient in both. */
export const INK = { light: '#0b0a24', dark: '#ededf2' } as const;

// ── Mark geometry (512 space) ────────────────────────────────────────────────

export const PLANET = { cx: 256, cy: 258, r: 174 } as const;

export const RING_CENTER = { x: 245.5, y: 258 } as const;
export const RING_ANGLE = -24;
export const RING_TRANSFORM = `translate(${RING_CENTER.x} ${RING_CENTER.y}) rotate(${RING_ANGLE})`;
export const RING_OUTER = { rx: 255, ry: 104 } as const;
export const RING_INNER = { rx: 214, ry: 90, dy: -4 } as const;

/** The ring band: outer ellipse minus inner ellipse (fill-rule evenodd). */
export const RING_D =
  `M${-RING_OUTER.rx} 0a${RING_OUTER.rx} ${RING_OUTER.ry} 0 1 0 ${2 * RING_OUTER.rx} 0a${RING_OUTER.rx} ${RING_OUTER.ry} 0 1 0 ${-2 * RING_OUTER.rx} 0Z` +
  `M${-RING_INNER.rx} ${RING_INNER.dy}a${RING_INNER.rx} ${RING_INNER.ry} 0 1 0 ${2 * RING_INNER.rx} 0a${RING_INNER.rx} ${RING_INNER.ry} 0 1 0 ${-2 * RING_INNER.rx} 0Z`;

/** The glossy streak along the inner edge of the front half of the ring. */
/** The ring's shadow on the planet, just below the front half. */
export const RING_SHADOW_D = `M${-RING_OUTER.rx} 26A${RING_OUTER.rx} ${RING_OUTER.ry} 0 0 0 ${RING_OUTER.rx} 26`;

export const RING_HIGHLIGHT_D = `M${-RING_INNER.rx} ${RING_INNER.dy}A${RING_INNER.rx} ${RING_INNER.ry} 0 0 0 ${RING_INNER.rx} ${RING_INNER.dy}`;

/** Half-planes of the ring frame: behind the planet (y < 0) and in front (y ≥ 0). */
export const RING_BACK_RECT = { x: -400, y: -300, width: 800, height: 300 } as const;
export const RING_FRONT_RECT = { x: -400, y: 0, width: 800, height: 300 } as const;

/** The middle line of the ring band, used to "draw" the ring in. */
export const RING_MID = { rx: 235, ry: 96, stroke: 80 } as const;

export const SAT_R = 22;
/** Where the satellite rests (top right of the mark). */
const SAT_HOME = { x: 488, y: 112 } as const;

const RAD = (RING_ANGLE * Math.PI) / 180;

/** The satellite's orbit: concentric with the ring, same tilt and flattening, through SAT_HOME. */
export const SAT_ORBIT = (() => {
  const dx = SAT_HOME.x - RING_CENTER.x;
  const dy = SAT_HOME.y - RING_CENTER.y;
  const u = dx * Math.cos(RAD) + dy * Math.sin(RAD);
  const v = -dx * Math.sin(RAD) + dy * Math.cos(RAD);
  const k = RING_OUTER.ry / RING_OUTER.rx;
  const rx = Math.hypot(u, v / k);
  return { rx, ry: rx * k, rest: Math.atan2(v / (rx * k), u / rx) };
})();
/** Parametric angle (radians, ring frame) of the satellite at rest. */
export const SAT_REST_ANGLE = SAT_ORBIT.rest;

/** A point on an ellipse of the ring frame, in mark coordinates. */
export function ringPoint(rx: number, ry: number, phi: number): { x: number; y: number } {
  const u = rx * Math.cos(phi);
  const v = ry * Math.sin(phi);
  return {
    x: RING_CENTER.x + u * Math.cos(RAD) - v * Math.sin(RAD),
    y: RING_CENTER.y + u * Math.sin(RAD) + v * Math.cos(RAD),
  };
}

export const SAT_REST = ringPoint(SAT_ORBIT.rx, SAT_ORBIT.ry, SAT_REST_ANGLE);

/**
 * The ring's draw-in path: one full turn of the middle ellipse, starting at the
 * satellite's resting angle and going the way the satellite orbits (front half
 * left → right, back half right → left).
 */
export const RING_DRAW_D = (() => {
  const a = SAT_REST_ANGLE;
  const p = (phi: number) =>
    `${(RING_MID.rx * Math.cos(phi)).toFixed(2)} ${(RING_MID.ry * Math.sin(phi)).toFixed(2)}`;
  return `M${p(a)}A${RING_MID.rx} ${RING_MID.ry} 0 0 0 ${p(a - Math.PI)}A${RING_MID.rx} ${RING_MID.ry} 0 0 0 ${p(a)}`;
})();

/**
 * Maps a fraction of the draw-in path's length to its parametric angle, so the
 * satellite can ride the tip of the ring while it draws.
 */
export const angleAtDrawFraction = (() => {
  const n = 720;
  const lengths = [0];
  let prev = {
    x: RING_MID.rx * Math.cos(SAT_REST_ANGLE),
    y: RING_MID.ry * Math.sin(SAT_REST_ANGLE),
  };
  for (let i = 1; i <= n; i++) {
    const phi = SAT_REST_ANGLE - (2 * Math.PI * i) / n;
    const pt = { x: RING_MID.rx * Math.cos(phi), y: RING_MID.ry * Math.sin(phi) };
    lengths.push(lengths[i - 1] + Math.hypot(pt.x - prev.x, pt.y - prev.y));
    prev = pt;
  }
  const total = lengths[n];
  return (f: number): number => {
    const target = Math.min(Math.max(f, 0), 1) * total;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < target) lo = mid;
      else hi = mid;
    }
    const span = lengths[hi] - lengths[lo] || 1;
    const i = lo + (target - lengths[lo]) / span;
    return SAT_REST_ANGLE - (2 * Math.PI * i) / n;
  };
})();

/** The page: rounded rectangle with the top-right corner cut for the fold. */
export const DOC_BODY_D =
  'M190 146H293Q298 146 301.5 149.5L350.5 198.5Q354 202 354 207V340A22 22 0 0 1 332 362H190A22 22 0 0 1 168 340V168A22 22 0 0 1 190 146Z';
/** The folded corner. */
export const DOC_FOLD_D =
  'M299 152Q299 147 302.5 150.5L350.5 198.5Q354 202 349 205.5L346 208H315A16 16 0 0 1 299 192Z';
/** The three text lines (stroked, round caps). */
export const DOC_LINES = [
  { x1: 210, x2: 275, y: 235 },
  { x1: 210, x2: 315, y: 277 },
  { x1: 210, x2: 260, y: 319 },
] as const;
export const DOC_LINE_WIDTH = 20;

// ── Full logo ────────────────────────────────────────────────────────────────

/** Where the 512 mark sits inside the full logo. */
export const MARK_IN_FULL = { x: 116, y: 191, scale: 0.94 } as const;
export const MARK_IN_FULL_TRANSFORM = `translate(${MARK_IN_FULL.x} ${MARK_IN_FULL.y}) scale(${MARK_IN_FULL.scale})`;

export const VIEWBOX = { full: '104 250 1634 363', mark: '0 0 512 512' } as const;
export const ASPECT = { full: 1634 / 363, mark: 1 } as const;

export interface Glyph {
  ch: string;
  word: 'orbit' | 'docs';
  d: string;
}

/** "Orbit Docs" in Outfit 700, as outlines in full-logo space (baseline y = 540). */
export const GLYPHS: readonly Glyph[] = [
  {
    ch: 'O',
    word: 'orbit',
    d: 'M693.2 542.8Q674.4 542.8 658.4 536.2Q642.4 529.6 630.4 517.8Q618.4 506.1 611.7 490.3Q605 474.5 605 456.3Q605 437.9 611.6 422.3Q618.2 406.7 630.1 394.9Q642 383.2 658 376.7Q674 370.2 692.8 370.2Q711.6 370.2 727.5 376.7Q743.5 383.2 755.4 394.9Q767.4 406.7 774 422.4Q780.6 438.2 780.6 456.5Q780.6 474.7 774 490.4Q767.4 506.2 755.5 517.9Q743.6 529.7 727.7 536.3Q711.8 542.8 693.2 542.8ZM692.8 509Q707.8 509 719 502.4Q730.1 495.8 736.3 483.9Q742.6 472 742.6 456.3Q742.6 444.6 739 435Q735.5 425.4 728.8 418.4Q722.2 411.4 713.1 407.7Q704 404 692.8 404Q677.9 404 666.7 410.5Q655.5 417 649.3 428.8Q643.1 440.5 643.1 456.3Q643.1 468.1 646.6 477.8Q650.2 487.6 656.7 494.5Q663.3 501.4 672.5 505.2Q681.6 509 692.8 509Z',
  },
  {
    ch: 'r',
    word: 'orbit',
    d: 'M796.2 540V425H832.4V540ZM832.4 477 817.2 465.1Q821.7 444.9 832.4 433.8Q843.2 422.7 861.9 422.7Q870.2 422.7 876.5 425.2Q882.8 427.6 887.6 432.8L866 460Q863.7 457.4 860.2 456.1Q856.7 454.7 852.1 454.7Q843.1 454.7 837.8 460.3Q832.4 465.8 832.4 477Z',
  },
  {
    ch: 'b',
    word: 'orbit',
    d: 'M962.8 542.4Q951.1 542.4 941.4 537.6Q931.7 532.8 925.6 524.6Q919.5 516.3 918.5 506.2V457.7Q919.5 447.5 925.6 439.6Q931.8 431.7 941.5 427.2Q951.2 422.7 962.8 422.7Q979.1 422.7 991.7 430.5Q1004.4 438.3 1011.6 451.8Q1018.8 465.4 1018.8 482.6Q1018.8 499.8 1011.6 513.3Q1004.4 526.8 991.7 534.6Q979.1 542.4 962.8 542.4ZM896.5 540V368.3H932.7V453.3L926.7 481.1L932.1 509.1V540ZM956.4 509.7Q964 509.7 969.8 506.2Q975.5 502.7 978.9 496.6Q982.2 490.4 982.2 482.5Q982.2 474.6 978.9 468.4Q975.5 462.3 969.7 458.8Q963.8 455.3 956.3 455.3Q948.7 455.3 942.8 458.8Q937 462.3 933.8 468.4Q930.6 474.5 930.6 482.5Q930.6 490.6 933.9 496.7Q937.1 502.9 943 506.3Q948.8 509.7 956.4 509.7Z',
  },
  {
    ch: 'i',
    word: 'orbit',
    d: 'M1032.6 540V425H1068.7V540ZM1050.6 409.2Q1042.3 409.2 1036.7 403.5Q1031.1 397.7 1031.1 389.3Q1031.1 380.9 1036.7 375.2Q1042.3 369.5 1050.6 369.5Q1059.3 369.5 1064.7 375.2Q1070.2 380.9 1070.2 389.3Q1070.2 397.7 1064.7 403.5Q1059.3 409.2 1050.6 409.2Z',
  },
  { ch: 't', word: 'orbit', d: 'M1105.9 540V377.5H1142.1V540ZM1079.9 455.8V425H1168.1V455.8Z' },
  {
    ch: 'D',
    word: 'docs',
    d: 'M1245.3 540V507.5H1286.7Q1301.8 507.5 1313.1 501.4Q1324.4 495.3 1330.6 483.8Q1336.8 472.2 1336.8 456.3Q1336.8 440.4 1330.5 429.1Q1324.2 417.7 1312.9 411.6Q1301.7 405.5 1286.7 405.5H1244.1V373H1287Q1306 373 1322 379.1Q1338 385.2 1349.9 396.4Q1361.8 407.5 1368.4 422.8Q1374.9 438 1374.9 456.5Q1374.9 474.8 1368.4 490.1Q1361.8 505.5 1350 516.6Q1338.1 527.8 1322.2 533.9Q1306.2 540 1287.5 540ZM1220.1 540V373H1257.4V540Z',
  },
  {
    ch: 'o',
    word: 'docs',
    d: 'M1445.9 542.6Q1428 542.6 1413.8 534.7Q1399.5 526.8 1391.2 513Q1383 499.3 1383 482.3Q1383 465.3 1391.2 451.8Q1399.4 438.3 1413.7 430.4Q1427.9 422.4 1445.8 422.4Q1463.7 422.4 1477.9 430.3Q1492.1 438.2 1500.4 451.7Q1508.7 465.3 1508.7 482.3Q1508.7 499.3 1500.5 513Q1492.2 526.8 1478.1 534.7Q1463.9 542.6 1445.9 542.6ZM1445.8 509.7Q1453.6 509.7 1459.5 506.3Q1465.4 502.9 1468.6 496.7Q1471.9 490.4 1471.9 482.4Q1471.9 474.4 1468.5 468.3Q1465.2 462.2 1459.4 458.7Q1453.6 455.3 1445.8 455.3Q1438.2 455.3 1432.3 458.8Q1426.4 462.3 1423.1 468.4Q1419.7 474.5 1419.7 482.5Q1419.7 490.4 1423.1 496.7Q1426.4 502.9 1432.3 506.3Q1438.2 509.7 1445.8 509.7Z',
  },
  {
    ch: 'c',
    word: 'docs',
    d: 'M1577.6 542.6Q1559.8 542.6 1545.4 534.8Q1531 527 1522.8 513.3Q1514.5 499.7 1514.5 482.6Q1514.5 465.4 1522.8 451.8Q1531.2 438.2 1545.6 430.3Q1560 422.4 1578 422.4Q1591.5 422.4 1602.7 427.1Q1613.9 431.8 1622.7 440.9L1599.6 464.1Q1595.6 459.7 1590.2 457.5Q1584.9 455.3 1578 455.3Q1570.3 455.3 1564.3 458.7Q1558.2 462.2 1554.8 468.2Q1551.3 474.2 1551.3 482.4Q1551.3 490.4 1554.8 496.6Q1558.2 502.7 1564.3 506.2Q1570.4 509.7 1578 509.7Q1585.2 509.7 1590.7 507.3Q1596.2 504.9 1600.2 500.3L1623.3 523.4Q1614.2 532.9 1602.9 537.8Q1591.6 542.6 1577.6 542.6Z',
  },
  {
    ch: 's',
    word: 'docs',
    d: 'M1676.4 543Q1666.2 543 1656.4 540.3Q1646.6 537.6 1638.3 532.8Q1629.9 528.1 1624 521.5L1644.5 500.7Q1650.3 507 1658.1 510.4Q1665.9 513.7 1675.1 513.7Q1681.5 513.7 1684.8 511.9Q1688.2 510.1 1688.2 506.6Q1688.2 502.4 1684.1 500.1Q1680.1 497.9 1673.7 496.2Q1667.3 494.5 1660.2 492.3Q1653.1 490.1 1646.6 486.3Q1640.2 482.5 1636.2 475.8Q1632.2 469.2 1632.2 458.6Q1632.2 447.6 1637.8 439.4Q1643.5 431.2 1653.9 426.5Q1664.3 421.8 1678.4 421.8Q1693 421.8 1705.4 426.9Q1717.9 431.9 1725.7 442L1705.1 462.8Q1699.7 456.4 1693 453.7Q1686.2 451.1 1679.7 451.1Q1673.6 451.1 1670.5 452.9Q1667.5 454.7 1667.5 457.9Q1667.5 461.6 1671.5 463.7Q1675.6 465.8 1682 467.5Q1688.3 469.2 1695.4 471.5Q1702.4 473.8 1708.8 477.8Q1715.2 481.9 1719.2 488.7Q1723.2 495.4 1723.2 506.2Q1723.2 523.1 1710.6 533Q1697.9 543 1676.4 543Z',
  },
];

/** The span of "Docs", for its gradient and sheen. */
export const DOCS_SPAN = { x1: 1220, y1: 372, x2: 1726, y2: 545 } as const;

// ── Paint ────────────────────────────────────────────────────────────────────

export type Stop = readonly [offset: number, color: string, opacity?: number];

export interface Paint {
  id: string;
  type: 'linear' | 'radial';
  attrs: Record<string, number | string>;
  stops: readonly Stop[];
}

/** Gradients, keyed by name; ids are prefixed per instance. userSpaceOnUse throughout. */
export const PAINTS = {
  // Bright rim of the planet: cyan top left → blue → violet bottom right.
  planet: {
    type: 'linear',
    attrs: { x1: 120, y1: 110, x2: 400, y2: 410 },
    stops: [
      [0.1, '#08b6fc'],
      [0.2, '#02aefa'],
      [0.34, '#0485f7'],
      [0.58, '#0c4ee0'],
      [0.78, '#6650fb'],
      [0.92, '#7a2ef8'],
    ],
  },
  // Deep navy core, set low and right so the top-left rim stays bright.
  core: {
    type: 'radial',
    attrs: { cx: 260, cy: 266, r: 178 },
    stops: [
      [0, '#000a35'],
      [0.55, '#001352', 0.97],
      [0.7, '#00217a', 0.9],
      [0.8, '#0032b0', 0.74],
      [0.9, '#003cc4', 0.42],
      [0.97, '#003cc4', 0.08],
      [1, '#0040c8', 0],
    ],
  },
  gloss: {
    type: 'radial',
    attrs: { cx: 150, cy: 140, r: 120 },
    stops: [
      [0, '#ffffff', 0.14],
      [0.5, '#bfe9ff', 0.05],
      [1, '#bfe9ff', 0],
    ],
  },
  glow: {
    type: 'radial',
    attrs: { cx: 256, cy: 258, r: 260 },
    stops: [
      [0.55, '#2f6bff', 0.55],
      [0.8, '#6a4dff', 0.18],
      [1, '#6a4dff', 0],
    ],
  },
  ringBack: {
    type: 'linear',
    attrs: { x1: -260, y1: 0, x2: 260, y2: 0 },
    stops: [
      [0, '#0d5ff7'],
      [0.5, '#0453f2'],
      [1, '#0a57f4'],
    ],
  },
  ringFront: {
    type: 'radial',
    attrs: { cx: 20, cy: 110, r: 270 },
    stops: [
      [0, '#7062fb'],
      [0.45, '#5358fa'],
      [0.8, '#2459f7'],
      [1, '#0b5af6'],
    ],
  },
  ringShadow: {
    type: 'linear',
    attrs: { x1: -220, y1: 0, x2: 200, y2: 0 },
    stops: [
      [0, '#000a35', 0.8],
      [0.55, '#000a35', 0.75],
      [1, '#000a35', 0],
    ],
  },
  ringHi: {
    type: 'linear',
    attrs: { x1: -230, y1: 0, x2: 230, y2: 0 },
    stops: [
      [0.05, '#ffffff', 0],
      [0.3, '#ffffff', 0.95],
      [0.66, '#eeeaff', 0.9],
      [0.92, '#ffffff', 0],
    ],
  },
  doc: {
    type: 'linear',
    attrs: { x1: 240, y1: 146, x2: 200, y2: 362 },
    stops: [
      [0, '#ffffff'],
      [0.55, '#f4f6fd'],
      [1, '#cbd6f6'],
    ],
  },
  fold: {
    type: 'linear',
    attrs: { x1: 302, y1: 150, x2: 340, y2: 210 },
    stops: [
      [0, '#b4b8fb'],
      [1, '#7f87f4'],
    ],
  },
  line: {
    type: 'linear',
    attrs: { x1: 200, y1: 0, x2: 325, y2: 0 },
    stops: [
      [0, '#5a74f4'],
      [1, '#8c96f7'],
    ],
  },
  sat: {
    type: 'radial',
    attrs: { cx: 482, cy: 104, r: 30 },
    stops: [
      [0, '#8466ff'],
      [0.55, '#5f39f9'],
      [1, '#4a3cf2'],
    ],
  },
  docs: {
    type: 'linear',
    attrs: { x1: DOCS_SPAN.x1, y1: DOCS_SPAN.y1, x2: DOCS_SPAN.x2, y2: DOCS_SPAN.y2 },
    stops: [
      [0, '#128bfa'],
      [0.2, '#1d66fb'],
      [0.42, '#3049f9'],
      [0.68, '#4036f4'],
      [1, '#4b22d4'],
    ],
  },
  sheen: {
    type: 'linear',
    attrs: { x1: 0, y1: 0, x2: 120, y2: 0 },
    stops: [
      [0, '#ffffff', 0],
      [0.5, '#ffffff', 0.7],
      [1, '#ffffff', 0],
    ],
  },
} as const satisfies Record<string, Omit<Paint, 'id'>>;

export type PaintName = keyof typeof PAINTS;

// ── Static SVG (public/brand/*.svg) ───────────────────────────────────────────

function paintMarkup(prefix: string, name: PaintName): string {
  const p = PAINTS[name] as Omit<Paint, 'id'>;
  const tag = p.type === 'linear' ? 'linearGradient' : 'radialGradient';
  const attrs = Object.entries(p.attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const stops = p.stops
    .map(
      ([o, c, a]) =>
        `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`,
    )
    .join('');
  return `<${tag} id="${prefix}${name}" gradientUnits="userSpaceOnUse" ${attrs}>${stops}</${tag}>`;
}

/** The mark at rest, as SVG markup in 512 space (no outer <svg>). */
export function markMarkup(prefix: string): string {
  const u = (n: string) => `url(#${prefix}${n})`;
  const lines = DOC_LINES.map((l) => `<path d="M${l.x1} ${l.y}H${l.x2}"/>`).join('');
  return [
    `<g transform="${RING_TRANSFORM}"><path d="${RING_D}" fill-rule="evenodd" fill="${u('ringBack')}" clip-path="${u('back')}"/></g>`,
    `<circle cx="${PLANET.cx}" cy="${PLANET.cy}" r="${PLANET.r}" fill="${u('planet')}"/>`,
    `<circle cx="${PLANET.cx}" cy="${PLANET.cy}" r="${PLANET.r}" fill="${u('core')}"/>`,
    `<g clip-path="${u('planetClip')}"><g transform="${RING_TRANSFORM}"><path d="${RING_SHADOW_D}" fill="none" stroke="${u('ringShadow')}" stroke-width="44" filter="${u('soft')}"/></g></g>`,
    `<circle cx="${PLANET.cx}" cy="${PLANET.cy}" r="${PLANET.r}" fill="${u('gloss')}"/>`,
    `<g filter="${u('shadow')}"><path d="${DOC_BODY_D}" fill="${u('doc')}"/></g>`,
    `<path d="${DOC_FOLD_D}" fill="${u('fold')}"/>`,
    `<g stroke="${u('line')}" stroke-width="${DOC_LINE_WIDTH}" stroke-linecap="round">${lines}</g>`,
    `<g transform="${RING_TRANSFORM}"><g clip-path="${u('front')}"><path d="${RING_D}" fill-rule="evenodd" fill="${u('ringFront')}"/>` +
      `<path d="${RING_HIGHLIGHT_D}" fill="none" stroke="${u('ringHi')}" stroke-width="11" clip-path="${u('ring')}"/></g></g>`,
    `<circle cx="${SAT_REST.x.toFixed(2)}" cy="${SAT_REST.y.toFixed(2)}" r="${SAT_R}" fill="${u('sat')}"/>`,
  ].join('');
}

/** Shared <defs> content for the static mark/logo. */
export function defsMarkup(prefix: string, names: readonly PaintName[]): string {
  const rect = (r: { x: number; y: number; width: number; height: number }) =>
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`;
  return [
    ...names.map((n) => paintMarkup(prefix, n)),
    `<clipPath id="${prefix}back">${rect(RING_BACK_RECT)}</clipPath>`,
    `<clipPath id="${prefix}front">${rect(RING_FRONT_RECT)}</clipPath>`,
    `<clipPath id="${prefix}ring"><path d="${RING_D}" clip-rule="evenodd"/></clipPath>`,
    `<clipPath id="${prefix}planetClip"><circle cx="${PLANET.cx}" cy="${PLANET.cy}" r="${PLANET.r}"/></clipPath>`,
    `<filter id="${prefix}soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>`,
    `<filter id="${prefix}shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000a33" flood-opacity="0.35"/></filter>`,
  ].join('');
}

const MARK_PAINTS: readonly PaintName[] = [
  'planet',
  'core',
  'gloss',
  'ringBack',
  'ringFront',
  'ringShadow',
  'ringHi',
  'doc',
  'fold',
  'line',
  'sat',
];

/** A complete, standalone SVG file of the logo at rest. */
export function logoSvg(variant: LogoVariant, theme: LogoTheme = 'light'): string {
  const p = 'od-';
  const names: PaintName[] = variant === 'full' ? [...MARK_PAINTS, 'docs'] : [...MARK_PAINTS];
  const [, , vw, vh] = VIEWBOX[variant].split(' ').map(Number);
  const mark = markMarkup(p);
  const body =
    variant === 'mark'
      ? mark
      : `<g transform="${MARK_IN_FULL_TRANSFORM}">${mark}</g>` +
        `<g fill="${INK[theme]}">${GLYPHS.filter((g) => g.word === 'orbit')
          .map((g) => `<path d="${g.d}"/>`)
          .join('')}</g>` +
        `<g fill="url(#${p}docs)">${GLYPHS.filter((g) => g.word === 'docs')
          .map((g) => `<path d="${g.d}"/>`)
          .join('')}</g>`;
  const title = variant === 'full' ? 'OrbitDocs' : 'OrbitDocs mark';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX[variant]}" width="${vw}" height="${vh}" role="img" aria-label="${title}">` +
    `<title>${title}</title><defs>${defsMarkup(p, names)}</defs>${body}</svg>\n`
  );
}
