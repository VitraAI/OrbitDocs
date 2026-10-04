import type { ReactElement } from 'react';
import type { IconType } from 'react-icons';

type Props = Record<string, unknown> & { children?: unknown };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** React prop name → SVG attribute (strokeWidth → stroke-width; viewBox stays). */
const attrName = (k: string) => (k === 'className' ? 'class' : k === 'viewBox' ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

function attrs(props: Props): string {
  return Object.entries(props)
    .filter(([k, v]) => k !== 'children' && k !== 'key' && v !== undefined && v !== null && typeof v !== 'object')
    .map(([k, v]) => ` ${attrName(k)}="${esc(String(v))}"`)
    .join('');
}

function serialize(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(serialize).join('');
  if (typeof node !== 'object') return esc(String(node));
  const el = node as ReactElement<Props>;
  const tag = String(el.type);
  return `<${tag}${attrs(el.props)}>${serialize(el.props.children)}</${tag}>`;
}

/**
 * A react-icons icon as an HTML string, for the server-rendered login pages.
 * Reads the icon's own element tree, so it needs no react-dom/server (which
 * Next does not allow in a proxy).
 */
export function iconHtml(Icon: IconType, size = 18): string {
  const root = Icon({}) as ReactElement<Props & { attr?: Props }>;
  const { attr = {}, children } = root.props;
  return `<svg stroke="currentColor" fill="currentColor" stroke-width="0"${attrs(attr)} width="${size}" height="${size}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${serialize(children)}</svg>`;
}
