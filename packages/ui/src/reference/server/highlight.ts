import { createHighlighter, hastToHtml, type Highlighter, type ShikiTransformer } from 'shiki';

const LANGS = [
  'shellscript', 'javascript', 'typescript', 'python', 'go', 'java', 'kotlin', 'php', 'ruby',
  'csharp', 'rust', 'swift', 'json', 'http',
] as const;

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

interface Palettes {
  light: Map<string, number>;
  dark: Map<string, number>;
}

let highlighter: Promise<{ h: Highlighter; palettes: Palettes }> | undefined;

/** Every foreground colour a theme can give a token, numbered in theme order (stable across processes). */
function palette(h: Highlighter, theme: string): Map<string, number> {
  const t = h.getTheme(theme);
  const colors = new Map<string, number>();
  const add = (c: unknown) => {
    if (typeof c === 'string' && c.startsWith('#') && !colors.has(c.toLowerCase())) colors.set(c.toLowerCase(), colors.size);
  };
  add(t.fg);
  for (const rule of t.settings ?? []) add(rule.settings?.foreground);
  return colors;
}

function getHighlighter() {
  highlighter ??= createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: [...LANGS] }).then((h) => ({
    h,
    palettes: { light: palette(h, THEMES.light), dark: palette(h, THEMES.dark) },
  }));
  return highlighter;
}

/**
 * Token colours as short classes (`l3 d7`, or `c3` for `l3 d3`) instead of an inline
 * `style="--shiki-light:…;--shiki-dark:…"` on every token: `shikiCss()` maps
 * the classes back to the same variables. A colour outside the palette keeps
 * its inline style.
 */
function styleToClass(palettes: Palettes): ShikiTransformer {
  return {
    name: 'orbitdocs:style-to-class',
    span(node) {
      const style = node.properties.style;
      if (typeof style !== 'string') return;
      const classes: string[] = [];
      const rest: string[] = [];
      for (const decl of style.split(';')) {
        const at = decl.indexOf(':');
        if (at < 0) continue;
        const key = decl.slice(0, at).trim();
        const value = decl.slice(at + 1).trim().toLowerCase();
        const light = key === '--shiki-light' ? palettes.light.get(value) : undefined;
        const dark = key === '--shiki-dark' ? palettes.dark.get(value) : undefined;
        if (light !== undefined) classes.push(`l${light}`);
        else if (dark !== undefined) classes.push(`d${dark}`);
        else rest.push(decl);
      }
      if (!classes.length) return;
      // Both themes number their colours in rule order, so a token often has the same number in each: one class.
      if (classes.length === 2 && classes[0]!.slice(1) === classes[1]!.slice(1)) classes.splice(0, 2, `c${classes[0]!.slice(1)}`);
      this.addClassToHast(node, classes);
      if (rest.length) node.properties.style = rest.join(';');
      else delete node.properties.style;
    },
  };
}

/**
 * Highlighted HTML with both themes as CSS variables (`--shiki-light`,
 * `--shiki-dark`), set per token by the classes `shikiCss()` defines; the
 * stylesheet picks one variable per colour scheme.
 */
export async function highlight(code: string, lang: string): Promise<string> {
  const { h, palettes } = await getHighlighter();
  const language = (h.getLoadedLanguages() as string[]).includes(lang) ? lang : 'text';
  const hast = h.codeToHast(code, {
    lang: language,
    themes: THEMES,
    defaultColor: false,
    transformers: [styleToClass(palettes)],
  });
  // `class=c2` rather than `class="c2"`: the HTML also travels as JSON (RSC payload, lazy
  // sections), where every double quote is escaped.
  return hastToHtml(hast, { preferUnquoted: true, quote: "'" });
}

/** The CSS for the token classes `highlight()` emits (about 1.5 KB; rendered once per reference page). */
export async function shikiCss(): Promise<string> {
  const { palettes } = await getHighlighter();
  const rules = (map: Map<string, number>, prefix: string, variable: string) =>
    [...map].map(([color, i]) => `.shiki .${prefix}${i}{${variable}:${color}}`).join('');
  const dark = [...palettes.dark].map(([color]) => color);
  const both = [...palettes.light]
    .filter(([, i]) => dark[i] !== undefined)
    .map(([color, i]) => `.shiki .c${i}{--shiki-light:${color};--shiki-dark:${dark[i]}}`)
    .join('');
  return rules(palettes.light, 'l', '--shiki-light') + rules(palettes.dark, 'd', '--shiki-dark') + both;
}
