'use client';

import { Button, Table, Tooltip } from '@heroui/react';
import { type ReactNode, useState } from 'react';
import { LuCheck, LuCopy } from 'react-icons/lu';

/** A Vercel-style card: optional title row, then content. */
export function Panel({ title, description, actions, children, className = '', flush = false }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
          <div>
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? 'mt-4' : 'p-6 pt-4'}>{children}</div>
    </section>
  );
}

/** A Vercel settings block: title, description, body, and a grey footer with a note and actions. */
export function Setting({ title, description, children, note, actions, danger = false }: { title: ReactNode; description?: ReactNode; children?: ReactNode; note?: ReactNode; actions?: ReactNode; /** Red border and footer, for Delete Project. */ danger?: boolean }) {
  return (
    <section className={danger ? 'setting setting-danger' : 'setting'}>
      <div className="flex flex-col gap-3 p-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-2 text-sm text-[var(--foreground)]/80">{description}</p> : null}
        </div>
        {children}
      </div>
      {note || actions ? (
        <footer className="setting-footer">
          <span>{note}</span>
          <span className="flex items-center gap-2">{actions}</span>
        </footer>
      ) : null}
    </section>
  );
}

/** Ready ● dot with a label. */
export function Status({ status, label }: { status: string; label?: string }) {
  const text: Record<string, string> = { live: 'Ready', ready: 'Ready', succeeded: 'Ready', running: 'Building', queued: 'Queued', failed: 'Error', removed: 'Removed', cancelled: 'Canceled', warning: 'Warnings' };
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="dot" data-s={status} />
      {label ?? text[status] ?? status}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div> : null}
    </div>
  );
}

export function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={label}
        onPress={() => {
          void navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <LuCheck size={14} /> : <LuCopy size={14} />}
      </Button>
      <Tooltip.Content>{done ? 'Copied' : label}</Tooltip.Content>
    </Tooltip>
  );
}

/** A secret or command shown once, with a copy button. */
export function CodeLine({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] py-1 pr-1 pl-3">
      <code className="mono min-w-0 flex-1 overflow-x-auto text-[13px] whitespace-nowrap">{children}</code>
      <Copy text={children} />
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  return <Status status={status} />;
}

/** A simple data table with HeroUI. */
export function DataTable<T>({ label, columns, rows, empty, rowKey, minWidth = 640 }: { label: string; columns: Array<{ title: string; cell: (row: T) => ReactNode; className?: string }>; rows: T[]; empty?: ReactNode; rowKey: (row: T) => string; /** Scroll sideways below this width (px); 0 for compact tables. */ minWidth?: number }) {
  if (!rows.length && empty) return <div className="py-8 text-center text-sm text-[var(--muted)]">{empty}</div>;
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={label} style={{ minWidth }}>
          <Table.Header>
            {columns.map((c, i) => (
              <Table.Column key={c.title} isRowHeader={i === 0} className={c.className}>
                {c.title}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={rowKey(r)} id={rowKey(r)}>
                {columns.map((c) => (
                  <Table.Cell key={c.title} className={c.className}>
                    {c.cell(r)}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
