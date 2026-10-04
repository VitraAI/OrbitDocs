'use client';

import { Button, ListBox, ScrollShadow, SearchField, Tooltip } from '@heroui/react';
import { LuChevronRight as ChevronRight, LuChevronsDownUp as ChevronsDownUp, LuChevronsUpDown as ChevronsUpDown, LuFolder as Folder, LuFolderOpen as FolderOpen, LuFolderTree as FolderTree, LuLayers as Layers, LuHistory as History, LuImport as Import, LuPlay as Play, LuPlus as Plus, LuSettings2 as Settings2, LuSlidersHorizontal as SlidersHorizontal } from 'react-icons/lu';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ClientFeatures } from '../settings';
import type { Collection, RequestDraft } from '../types';
import { itemFromEvent } from './context-menu';
import { NO_AUTOFILL } from '../../no-autofill';

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

const TREE_KEY = 'orbitdocs:client:tree';

/** Open/closed state of collection and folder rows, remembered in this browser. */
function useTreeState(): [Record<string, boolean>, (next: Record<string, boolean>) => void] {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setState(JSON.parse(localStorage.getItem(TREE_KEY) ?? '{}') as Record<string, boolean>);
    } catch {
      // Storage blocked (private window, previews): start from the defaults.
    }
  }, []);
  const update = useCallback((next: Record<string, boolean>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(TREE_KEY, JSON.stringify(merged));
      } catch {
        // Not persisted; the state still applies for this visit.
      }
      return merged;
    });
  }, []);
  return [state, update];
}

const collectionKey = (c: string) => `c:${c}`;
const folderKey = (c: string, f: string) => `f:${c}/${f}`;

/**
 * Collections as a tree: each collection, and each folder in it, is a row you
 * can open and close. By default only the collection and folder of the open
 * request are expanded; a search expands everything that matches.
 */
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
  onContextMenu?: (
    e: React.MouseEvent<HTMLElement>,
    target: { kind: 'request' | 'collection'; id: string },
    el: HTMLElement,
  ) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => requests.filter((r) => !q || `${r.method} ${r.name} ${r.url}`.toLowerCase().includes(q)),
    [requests, q],
  );
  const [tree, setTree] = useTreeState();
  const active = requests.find((r) => r.id === activeId);

  // Opening a request (from a tab, the palette or a link) reveals it in the tree.
  useEffect(() => {
    if (!active) return;
    setTree({
      [collectionKey(active.collectionId)]: true,
      ...(active.folder ? { [folderKey(active.collectionId, active.folder)]: true } : {}),
    });
  }, [active?.id, active?.collectionId, active?.folder, setTree]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCollectionOpen = (c: Collection) =>
    Boolean(q) ||
    (tree[collectionKey(c.id)] ?? (collections.length === 1 || c.id === active?.collectionId));
  const isFolderOpen = (c: Collection, f: string, index: number) =>
    Boolean(q) ||
    (tree[folderKey(c.id, f)] ??
      (active ? active.collectionId === c.id && active.folder === f : index === 0));

  const allKeys = collections.flatMap((c) => [
    collectionKey(c.id),
    ...c.folders.map((f) => folderKey(c.id, f)),
  ]);
  const anyFolderOpen = collections.some(
    (c) => isCollectionOpen(c) && c.folders.some((f, i) => isFolderOpen(c, f, i)),
  );
  const toggleAll = () => {
    const open = !anyFolderOpen;
    // Collapsing keeps the collections open, so their folders stay in view.
    setTree(Object.fromEntries(allKeys.map((k) => [k, k.startsWith('c:') ? true : open])));
  };

  const requestList = (label: string, items: RequestDraft[], nested: boolean) => (
    <ListBox
      aria-label={label}
      onAction={(k) => onOpen(String(k))}
      className={`oc-request-list${nested ? ' oc-tree-children' : ''}`}
    >
      {items.map((r) => (
        <ListBox.Item
          key={r.id}
          id={r.id}
          textValue={r.name}
          className={r.id === activeId ? 'oc-active-item' : undefined}
        >
          <MethodTag method={r.method} />
          <span className="oc-ellipsis">{r.name}</span>
        </ListBox.Item>
      ))}
    </ListBox>
  );

  return (
    <div className="oc-side-panel">
      <div className="oc-side-toolbar">
        <SearchField
          aria-label="Search requests"
          value={query}
          onChange={setQuery}
          className="oc-side-search"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input
              placeholder="Search requests"
              {...NO_AUTOFILL}
              name="od-request-search"
            />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <Tooltip delay={300}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={anyFolderOpen ? 'Collapse all folders' : 'Expand all folders'}
            onPress={toggleAll}
            isDisabled={Boolean(q)}
          >
            {anyFolderOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
          </Button>
          <Tooltip.Content>
            {anyFolderOpen ? 'Collapse all folders' : 'Expand all folders'}
          </Tooltip.Content>
        </Tooltip>
      </div>
      <ScrollShadow className="oc-side-scroll">
        {collections.map((c) => {
          const items = visible.filter((r) => r.collectionId === c.id);
          if (q && !items.length) return null;
          const open = isCollectionOpen(c);
          const loose = items.filter((r) => !r.folder || !c.folders.includes(r.folder));
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
                <button
                  type="button"
                  className="oc-tree-row oc-tree-collection"
                  aria-expanded={open}
                  onClick={() => setTree({ [collectionKey(c.id)]: !open })}
                >
                  <ChevronRight size={14} className="oc-tree-chevron" />
                  <Layers size={15} className="oc-tree-icon" />
                  <span className="oc-ellipsis">{c.name}</span>
                  <span className="oc-tree-count">{items.length}</span>
                </button>
                <Tooltip delay={300}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={`New request in ${c.name}`}
                    onPress={() => onNew(c.id)}
                  >
                    <Plus size={14} />
                  </Button>
                  <Tooltip.Content>New request</Tooltip.Content>
                </Tooltip>
              </div>
              {open ? (
                <div className="oc-tree-children">
                  {c.folders.map((f, index) => {
                    const inFolder = items.filter((r) => r.folder === f);
                    if (!inFolder.length) return null;
                    const fOpen = isFolderOpen(c, f, index);
                    const holdsActive = active?.collectionId === c.id && active.folder === f;
                    return (
                      <div key={f} className="oc-folder">
                        <button
                          type="button"
                          className="oc-tree-row oc-tree-folder"
                          aria-expanded={fOpen}
                          data-has-active={holdsActive || undefined}
                          onClick={() => setTree({ [folderKey(c.id, f)]: !fOpen })}
                        >
                          <ChevronRight size={13} className="oc-tree-chevron" />
                          {fOpen ? (
                            <FolderOpen size={15} className="oc-tree-icon" />
                          ) : (
                            <Folder size={15} className="oc-tree-icon" />
                          )}
                          <span className="oc-ellipsis">{f}</span>
                          <span className="oc-tree-count">{inFolder.length}</span>
                        </button>
                        {fOpen ? requestList(`${f} requests`, inFolder, true) : null}
                      </div>
                    );
                  })}
                  {loose.length ? requestList(`${c.name} requests`, loose, false) : null}
                </div>
              ) : null}
              {!items.length ? <p className="oc-hint oc-pad">No requests yet.</p> : null}
            </div>
          );
        })}
        {q && !visible.length ? <p className="oc-hint oc-pad">No requests match.</p> : null}
      </ScrollShadow>
    </div>
  );
}
