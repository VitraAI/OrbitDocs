import type { SecuritySchemeView } from './store';

const PLACEHOLDERS: Record<string, string> = {
  apiKey: 'YOUR_API_KEY',
  bearer: 'YOUR_TOKEN',
  basic: 'dXNlcm5hbWU6cGFzc3dvcmQ=',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function placeholderFor(scheme: SecuritySchemeView): string {
  if (scheme.type === 'apiKey') return PLACEHOLDERS.apiKey!;
  if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic') return PLACEHOLDERS.basic!;
  return PLACEHOLDERS.bearer!;
}

/** Value sent on the wire for a scheme, from what the reader typed. */
export function wireValue(scheme: SecuritySchemeView, typed: string): string {
  if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic') {
    return typed.includes(':') ? btoa(typed) : typed;
  }
  return typed;
}

/** Swaps placeholder credentials in a sample for the ones the reader entered. */
export function fillCredentials(
  text: string,
  schemes: SecuritySchemeView[],
  credentials: Record<string, string>,
  html: boolean,
): string {
  let out = text;
  for (const scheme of schemes) {
    const typed = credentials[scheme.name];
    if (!typed) continue;
    const value = wireValue(scheme, typed);
    out = out.split(placeholderFor(scheme)).join(html ? escapeHtml(value) : value);
  }
  return out;
}
