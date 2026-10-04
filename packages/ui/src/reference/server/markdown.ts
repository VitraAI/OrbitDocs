import { Marked } from 'marked';

const ALERTS: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };

/**
 * GitHub alerts (`> [!NOTE]`, `> [!WARNING]`, …) become callouts. Done on the
 * Markdown before parsing so the alert body keeps its own formatting.
 */
function alerts(text: string): string {
  return text.replace(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*\n((?:>.*(?:\n|$))*)/gm, (_, kind: string, body: string) => {
    const inner = body.replace(/^> ?/gm, '').trim();
    return `<div class="od-alert" data-kind="${kind.toLowerCase()}"><p class="od-alert-title">${ALERTS[kind]}</p>\n\n${inner}\n\n</div>\n`;
  });
}

const marked = new Marked({ gfm: true, breaks: false });

/**
 * Markdown from the spec (descriptions) to HTML. Specs are authored by the
 * site owner, so raw HTML is allowed, like in Scalar and Redoc.
 */
export function markdown(text: string | undefined): string {
  if (!text) return '';
  return marked.parse(alerts(text), { async: false }) as string;
}

/** Markdown stripped to one line of plain text (meta descriptions). */
export function plainText(text: string | undefined, max = 160): string {
  if (!text) return '';
  const plain = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
