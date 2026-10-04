'use client';

import { Button, Chip, ListBox } from '@heroui/react';

import type { Workspace } from '../types';
import { itemFromEvent } from './context-menu';
import { MethodTag } from './rail';

export function HistoryView({
  history,
  onOpen,
  onClear,
  onContextMenu,
}: {
  history: Workspace['history'];
  onOpen: (index: number) => void;
  onClear: () => void;
  /** Right-click on an entry (its index). */
  onContextMenu?: (e: React.MouseEvent<HTMLElement>, index: number, el: HTMLElement) => void;
}) {
  if (!history.length) {
    return (
      <div className="oc-empty oc-pad">
        <p className="oc-empty-title">No history yet</p>
        <p className="oc-hint">Every request you send shows up here, with its response.</p>
      </div>
    );
  }
  return (
    <div className="oc-history">
      <div className="oc-row">
        <span className="oc-hint">{history.length} recent requests</span>
        <div className="oc-grow" />
        <Button size="sm" variant="ghost" onPress={onClear}>
          Clear
        </Button>
      </div>
      <div
        onContextMenu={(e) => {
          const item = onContextMenu ? itemFromEvent(e) : null;
          if (item) onContextMenu!(e, Number(item.key), item.el);
        }}
      >
      <ListBox aria-label="History" onAction={(k) => onOpen(Number(k))} className="oc-history-list">
        {history.map((h, i) => (
          <ListBox.Item key={i} id={String(i)} textValue={`${h.method} ${h.url}`}>
            <MethodTag method={h.method} />
            <div className="oc-history-main">
              <span className="oc-ellipsis">{h.name}</span>
              <span className="oc-hint oc-mono oc-ellipsis">{h.url}</span>
            </div>
            <Chip size="sm" variant="soft" color={(h.response?.status ?? 0) >= 200 && (h.response?.status ?? 0) < 400 ? 'success' : 'danger'}>
              <Chip.Label>{h.response?.status || 'ERR'}</Chip.Label>
            </Chip>
            <span className="oc-hint">{new Date(h.at).toLocaleTimeString()}</span>
          </ListBox.Item>
        ))}
      </ListBox>
      </div>
    </div>
  );
}
