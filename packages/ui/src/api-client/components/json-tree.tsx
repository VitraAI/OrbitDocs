'use client';

import { Button } from '@heroui/react';
import { LuChevronRight as ChevronRight } from 'react-icons/lu';
import { type ReactNode, useState } from 'react';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function mark(text: string, query: string): ReactNode {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="oc-mark">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

/** Whether a node (or anything under it) matches the search. */
function matches(key: string, value: unknown, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (key.toLowerCase().includes(q)) return true;
  if (!isObj(value)) return String(value).toLowerCase().includes(q);
  return Object.entries(value).some(([k, v]) => matches(k, v, query));
}

function Leaf({ value, query }: { value: unknown; query: string }) {
  const kind = value === null ? 'null' : typeof value;
  const text = kind === 'string' ? JSON.stringify(value) : String(value);
  return <span className={`oc-json-${kind}`}>{mark(text, query)}</span>;
}

function Node({ name, value, depth, query, last }: { name?: string; value: unknown; depth: number; query: string; last: boolean }) {
  const [open, setOpen] = useState(depth < 2);
  const comma = last ? '' : ',';
  const label = name !== undefined ? <span className="oc-json-key">{mark(JSON.stringify(name), query)}: </span> : null;
  if (!isObj(value)) {
    return (
      <div className="oc-json-line" style={{ paddingLeft: depth * 16 }}>
        {label}
        <Leaf value={value} query={query} />
        {comma}
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  if (!entries.length) {
    return (
      <div className="oc-json-line" style={{ paddingLeft: depth * 16 }}>
        {label}
        <span className="oc-json-summary">{Array.isArray(value) ? '[]' : '{}'}</span>
        {comma}
      </div>
    );
  }
  const shown = entries.filter(([k, v]) => matches(k, v, query));
  const [l, r] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const expanded = open || Boolean(query);
  return (
    <div>
      <div className="oc-json-line" style={{ paddingLeft: depth * 16 }}>
        <Button isIconOnly size="sm" variant="ghost" className="oc-json-toggle" aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded} onPress={() => setOpen((o) => !o)}>
          <ChevronRight size={12} />
        </Button>
        {label}
        {l}
        {!expanded ? (
          <>
            <span className="oc-json-summary">{Array.isArray(value) ? ` ${entries.length} items ` : ` ${entries.length} keys `}</span>
            {r}
            {comma}
          </>
        ) : null}
      </div>
      {expanded ? (
        <>
          {shown.map(([k, v], i) => (
            <Node key={k} name={Array.isArray(value) ? undefined : k} value={v} depth={depth + 1} query={query} last={i === shown.length - 1} />
          ))}
          <div className="oc-json-line" style={{ paddingLeft: depth * 16 + 24 }}>
            {r}
            {comma}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Collapsible JSON viewer; the search keeps matching branches open and highlights hits. */
export function JsonTree({ value, query }: { value: unknown; query: string }) {
  return (
    <div className="oc-json" role="tree">
      <Node value={value} depth={0} query={query} last />
    </div>
  );
}
