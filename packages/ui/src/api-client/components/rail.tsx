'use client';

import { Button, Header, ListBox, ScrollShadow, SearchField, Tooltip } from '@heroui/react';
import { LuFolderTree as FolderTree, LuHistory as History, LuImport as Import, LuPlay as Play, LuPlus as Plus, LuSettings2 as Settings2, LuSlidersHorizontal as SlidersHorizontal } from 'react-icons/lu';
import { useMemo, useState } from 'react';

import type { ClientFeatures } from '../settings';
import type { Collection, RequestDraft } from '../types';
import { itemFromEvent } from './context-menu';

export type ClientView = 'collections' | 'history' | 'environments' | 'runner' | 'import';

const ITEMS: Array<{ id: ClientView; label: string; icon: typeof FolderTree; feature?: keyof ClientFeatures }> = [
  { id: 'collections', label: 'Collections', icon: FolderTree },
  { id: 'environments', label: 'Environments', icon: SlidersHorizontal, feature: 'environments' },
  { id: 'runner', label: 'Collection runner', icon: Play, feature: 'runner' },
  { id: 'history', label: 'History', icon: History, feature: 'history' },
  { id: 'import', label: 'Import', icon: Import, feature: 'import' },
];

/** The icon rail on the far left. */
export function Rail({ view, onView, onSettings, features }: { view: ClientView; onView: (v: ClientView) => void; onSettings: () => void; features: ClientFeatures }) {
  return (
    <nav className="oc-rail" aria-label="Client sections">
      {ITEMS.filter((i) => !i.feature || features[i.feature]).map(({ id, label, icon: Icon }) => (
        <Tooltip key={id} delay={200}>
          <Button isIconOnly variant={view === id ? 'secondary' : 'ghost'} aria-label={label} aria-current={view === id || undefined} onPress={() => onView(id)}>
            <Icon size={18} />
          </Button>
          <Tooltip.Content placement="right">{label}</Tooltip.Content>
        </Tooltip>
      ))}
      <div className="oc-grow" />
      <Tooltip delay={200}>
        <Button isIconOnly variant="ghost" aria-label="Settings" onPress={onSettings}>
          <Settings2 size={18} />
        </Button>
        <Tooltip.Content placement="right">Settings</Tooltip.Content>
      </Tooltip>
    </nav>
  );
}

export function MethodTag({ method }: { method: string }) {
  return <span className={`oc-m oc-m-${method.toLowerCase()}`}>{method === 'DELETE' ? 'DEL' : method === 'OPTIONS' ? 'OPT' : method}</span>;
}

/** Collections: every folder is a ListBox section; search filters by name, method or URL. */
export function CollectionsPanel({
  collections,
  requests,
  activeId,
  onOpen,
  onNew,
  onContextMenu,
}: {
  collections: Collection[];
  requests: RequestDraft[];
  activeId?: string;
  onOpen: (id: string) => void;
  onNew: (collectionId: string) => void;
  /** Right-click on a request (its id) or a collection header. */
  onContextMenu?: (e: React.MouseEvent<HTMLElement>, target: { kind: 'request' | 'collection'; id: string }, el: HTMLElement) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => requests.filter((r) => !q || `${r.method} ${r.name} ${r.url}`.toLowerCase().includes(q)), [requests, q]);
  return (
    <div className="oc-side-panel">
      <SearchField aria-label="Search requests" value={query} onChange={setQuery} className="oc-side-search">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search requests" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <ScrollShadow className="oc-side-scroll">
        {collections.map((c) => {
          const items = visible.filter((r) => r.collectionId === c.id);
          const folders: Array<string | undefined> = [...c.folders, undefined];
          return (
            <div
              key={c.id}
              className="oc-collection"
              onContextMenu={(e) => {
                if (!onContextMenu) return;
                const head = (e.target as HTMLElement).closest<HTMLElement>('.oc-collection-head');
                if (head) return onContextMenu(e, { kind: 'collection', id: c.id }, head);
                const item = itemFromEvent(e);
                if (item) onContextMenu(e, { kind: 'request', id: item.key }, item.el);
              }}
            >
              <div className="oc-collection-head">
                <span className="oc-ellipsis">{c.name}</span>
                <Tooltip delay={300}>
                  <Button isIconOnly size="sm" variant="ghost" aria-label={`New request in ${c.name}`} onPress={() => onNew(c.id)}>
                    <Plus size={14} />
                  </Button>
                  <Tooltip.Content>New request</Tooltip.Content>
                </Tooltip>
              </div>
              <ListBox aria-label={`${c.name} requests`} onAction={(k) => onOpen(String(k))} className="oc-request-list">
                {folders.map((f) => {
                  const inFolder = items.filter((r) => (r.folder ?? undefined) === f);
                  if (!inFolder.length) return null;
                  return (
                    <ListBox.Section key={f ?? '_'}>
                      <Header className="oc-folder-header">{f ?? 'Requests'}</Header>
                      {inFolder.map((r) => (
                        <ListBox.Item key={r.id} id={r.id} textValue={r.name} className={r.id === activeId ? 'oc-active-item' : undefined}>
                          <MethodTag method={r.method} />
                          <span className="oc-ellipsis">{r.name}</span>
                        </ListBox.Item>
                      ))}
                    </ListBox.Section>
                  );
                })}
              </ListBox>
              {!items.length ? <p className="oc-hint oc-pad">No requests match.</p> : null}
            </div>
          );
        })}
      </ScrollShadow>
    </div>
  );
}
