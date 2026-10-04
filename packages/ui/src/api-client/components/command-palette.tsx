'use client';

import { Header, Kbd, ListBox, Modal, SearchField } from '@heroui/react';
import { useMemo, useState } from 'react';

import type { RequestDraft } from '../types';
import { MethodTag } from './rail';
import { NO_AUTOFILL } from '../../no-autofill';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  /** Shown but can't be picked. */
  disabled?: boolean;
  run: () => void;
}

/** ⌘K: jump to any request or run any action. */
export function CommandPalette({
  open,
  onOpenChange,
  requests,
  actions,
  onOpenRequest,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requests: RequestDraft[];
  actions: PaletteAction[];
  onOpenRequest: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const reqs = useMemo(() => requests.filter((r) => !q || `${r.method} ${r.name} ${r.url} ${r.folder ?? ''}`.toLowerCase().includes(q)).slice(0, 12), [requests, q]);
  const acts = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
  const run = (key: string) => {
    onOpenChange(false);
    setQuery('');
    if (key.startsWith('req:')) onOpenRequest(key.slice(4));
    else actions.find((a) => `act:${a.id}` === key)?.run();
  };
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} variant="blur">
        <Modal.Container placement="top" size="md">
          <Modal.Dialog className="oc-palette" aria-label="Command palette">
            <SearchField aria-label="Search commands" value={query} onChange={setQuery} autoFocus className="oc-palette-search">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search requests and actions…" {...NO_AUTOFILL} name="od-palette-search" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ListBox aria-label="Results" onAction={(k) => run(String(k))} disabledKeys={acts.filter((a) => a.disabled).map((a) => `act:${a.id}`)} className="oc-palette-list">
              {reqs.length ? (
                <ListBox.Section>
                  <Header>Requests</Header>
                  {reqs.map((r) => (
                    <ListBox.Item key={r.id} id={`req:${r.id}`} textValue={r.name}>
                      <MethodTag method={r.method} />
                      <span className="oc-ellipsis">{r.name}</span>
                      {r.folder ? <span className="oc-hint">{r.folder}</span> : null}
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              ) : null}
              {acts.length ? (
                <ListBox.Section>
                  <Header>Actions</Header>
                  {acts.map((a) => (
                    <ListBox.Item key={a.id} id={`act:${a.id}`} textValue={a.label}>
                      <span>{a.label}</span>
                      {a.hint ? (
                        <Kbd className="oc-palette-kbd">
                          <Kbd.Abbr keyValue="command" />
                          <Kbd.Content>{a.hint}</Kbd.Content>
                        </Kbd>
                      ) : null}
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              ) : null}
            </ListBox>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
