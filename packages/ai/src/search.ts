import type { AiPage } from './manifest';

/** A passage of a page: one Markdown section. */
export interface Chunk {
  id: number;
  page: AiPage;
  heading?: string;
  text: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

const STOP = new Set(
  'a an and are as at be by can do does for from how i in is it of on or the this to what when where which who why with you your'.split(' '),
);

/** Longest first: `pagination` and `paginate` both become `pagin`; `verify` and `verification` become `verific`. */
const SUFFIXES: Array<[string, string]> = [
  ['ifies', 'ific'],
  ['ified', 'ific'],
  ['ify', 'ific'],
  ['ations', ''],
  ['ation', ''],
  ['ating', ''],
  ['ated', ''],
  ['ates', ''],
  ['ate', ''],
  ['ings', ''],
  ['ing', ''],
  ['ies', 'y'],
  ['ied', 'y'],
  ['ed', ''],
  ['es', ''],
  ['s', ''],
  ['ly', ''],
];

/** A light stemmer: rewrites common English suffixes while at least three letters remain. */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word) || word.endsWith('ss')) return word;
  for (const [suffix, replacement] of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length) + replacement;
  }
  return word;
}

/** Lowercase words, stemmed, stop words dropped. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => !STOP.has(t)).map(stem);
}

/** Splits a page at `##`/`###` headings, then at ~1,500 characters. */
export function chunkPage(page: AiPage, startId: number): Chunk[] {
  const sections: Array<{ heading?: string; text: string }> = [];
  let current: { heading?: string; lines: string[] } = { lines: [] };
  let inCode = false;
  for (const line of page.markdown.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    const h = !inCode && /^#{2,3}\s+(.+)/.exec(line);
    if (h) {
      if (current.lines.join('').trim()) sections.push({ heading: current.heading, text: current.lines.join('\n') });
      current = { heading: h[1]!.trim(), lines: [line] };
    } else current.lines.push(line);
  }
  if (current.lines.join('').trim()) sections.push({ heading: current.heading, text: current.lines.join('\n') });

  const out: Chunk[] = [];
  for (const s of sections) {
    for (let i = 0; i < s.text.length; i += 1500) {
      out.push({ id: startId + out.length, page, heading: s.heading, text: s.text.slice(i, i + 1600).trim() });
    }
  }
  return out;
}

/** BM25 over chunks; the page title and section heading count extra. */
export class SearchIndex {
  readonly chunks: Chunk[];
  private readonly terms: Array<Map<string, number>>;
  /** Words of each chunk's page title and section heading. */
  private readonly titles: Array<Set<string>>;
  private readonly lengths: number[];
  private readonly df = new Map<string, number>();
  private readonly avg: number;

  constructor(pages: AiPage[]) {
    this.chunks = [];
    for (const p of pages) this.chunks.push(...chunkPage(p, this.chunks.length));
    this.terms = this.chunks.map((c) => {
      const tf = new Map<string, number>();
      const boosted = `${c.page.title} ${c.page.title} ${c.heading ?? ''} ${c.heading ?? ''} ${c.page.description ?? ''}`;
      for (const t of [...tokens(boosted), ...tokens(c.text)]) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return tf;
    });
    this.titles = this.chunks.map((c) => new Set(tokens(`${c.page.title} ${c.heading ?? ''}`)));
    this.lengths = this.terms.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0));
    this.avg = this.lengths.reduce((a, b) => a + b, 0) / Math.max(this.lengths.length, 1);
  }

  search(query: string, opts: { limit?: number; filter?: (page: AiPage) => boolean } = {}): Hit[] {
    const q = [...new Set(tokens(query))];
    if (!q.length) return [];
    const n = this.chunks.length;
    const hits: Hit[] = [];
    this.chunks.forEach((chunk, i) => {
      if (opts.filter && !opts.filter(chunk.page)) return;
      const tf = this.terms[i]!;
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (n - this.df.get(t)! + 0.5) / (this.df.get(t)! + 0.5));
        score += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (this.lengths[i]! / this.avg)));
        // A page or section named after the question beats passages that merely mention it.
        if (this.titles[i]!.has(t)) score += idf * 1.5;
      }
      if (score > 0) hits.push({ chunk, score });
    });
    hits.sort((a, b) => b.score - a.score);
    // At most two passages from the same page, so answers draw on several.
    const perPage = new Map<string, number>();
    return hits
      .filter((h) => {
        const c = (perPage.get(h.chunk.page.url) ?? 0) + 1;
        perPage.set(h.chunk.page.url, c);
        return c <= 2;
      })
      .slice(0, opts.limit ?? 6);
  }
}
