'use client';

import { Button, Chip, Form, Input, Label, ListBox, Modal, Select, TextField, Toast, Tooltip, toast } from '@heroui/react';
import {
  LuCheck as Check,
  LuCommand as Command,
  LuCopy as Copy,
  LuCopyPlus as CopyPlus,
  LuDownload as Download,
  LuExternalLink as ExternalLink,
  LuLink as LinkIcon,
  LuPanelLeft as PanelLeft,
  LuPencil as Pencil,
  LuPlay as Play,
  LuPlus as Plus,
  LuRotateCcw as RotateCcw,
  LuSend as SendIcon,
  LuTerminal as Terminal,
  LuTrash2 as Trash2,
  LuX as X,
} from 'react-icons/lu';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommandPalette, type PaletteAction } from './components/command-palette';
import { type ContextMenuItem, useContextMenu } from './components/context-menu';
import { EnvironmentsView } from './components/environments';
import { HistoryView } from './components/history';
import { ImportView } from './components/import-view';
import { CollectionsPanel, type ClientView, Rail } from './components/rail';
import { RequestPanel } from './components/request-panel';
import { ResponsePanel } from './components/response-panel';
import { RunnerView } from './components/runner';
import { SettingsDrawer } from './components/settings-drawer';
import { TabStrip } from './components/tab-strip';
import { UrlBar, VariableChips } from './components/url-bar';
import { type ClientSeed, requestHash } from './seed';
import { codeRequest, toCurl } from './code';
import { sendRequest } from './send';
import { ALL_FEATURES, type ClientDefaults, useClientSettings } from './settings';
import { useWorkspace } from './store';
import type { RequestDraft, RunResult } from './types';
import { scope } from './variables';

export interface ApiClientProps {
  /** Collections generated from the APIs (see `clientSeed`). */
  seeds: ClientSeed[];
  /** localStorage namespace; one workspace per site. */
  storageKey?: string;
  /** Request to open first (`<api>:<operation-slug>`). */
  initialRequestId?: string;
  /** Values for empty secret variables, e.g. the key entered on the docs page. */
  initialSecrets?: Record<string, string>;
  /** Server URL to prefer (selects the environment whose baseUrl matches). */
  preferredServer?: string;
  /** Site defaults (from `client` in orbitdocs.config.ts); readers can change them. */
  defaults?: ClientDefaults;
  className?: string;
}

/**
 * The OrbitDocs API client: collections from your OpenAPI documents, tabs,
 * environments with secrets, scripts and tests, a collection runner, history,
 * import, a command palette and reader settings. Everything stays in the browser.
 */
export function ApiClient({ seeds, storageKey = 'orbitdocs:client', initialRequestId, initialSecrets, preferredServer, defaults = {}, className }: ApiClientProps) {
  const api = useWorkspace(storageKey, seeds);
  const { ws } = api;
  const { settings, update: setSettings, reset: resetSettings } = useClientSettings(defaults);
  const features = { ...ALL_FEATURES, ...defaults.features };

  const [view, setView] = useState<ClientView>('collections');
  const [tabs, setTabs] = useState<string[]>(() => (initialRequestId ? [initialRequestId] : ws.requests[0] ? [ws.requests[0].id] : []));
  const [activeId, setActiveId] = useState<string | undefined>(initialRequestId ?? ws.requests[0]?.id);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [sending, setSending] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** Rename or delete a request, asked in a dialog. */
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'delete'; id: string } | null>(null);
  /** A request to send once it has become the active tab (from a context menu). */
  const [pendingSend, setPendingSend] = useState<string | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const ctx = useContextMenu();

  const open = useCallback((id: string) => {
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActiveId(id);
    setView('collections');
  }, []);

  useEffect(() => {
    if (initialRequestId) open(initialRequestId);
  }, [initialRequestId, open]);

  useEffect(() => {
    if (initialSecrets && Object.keys(initialSecrets).length) api.fillSecrets(initialSecrets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSecrets]);

  useEffect(() => {
    if (!preferredServer) return;
    const env = ws.environments.find((e) => e.variables.some((v) => v.key === 'baseUrl' && v.value === preferredServer));
    if (env && env.id !== ws.activeEnvironmentId) api.setActiveEnvironment(env.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredServer, ws.environments.length]);

  // Drop tabs whose request no longer exists (e.g. removed from the spec).
  const openTabs = useMemo(() => tabs.map((id) => ws.requests.find((r) => r.id === id)).filter((r): r is RequestDraft => Boolean(r)), [tabs, ws.requests]);
  const draft = ws.requests.find((r) => r.id === activeId) ?? openTabs[0];
  const collection = ws.collections.find((c) => c.id === draft?.collectionId) ?? ws.collections[0];
  const environment = ws.environments.find((e) => e.id === ws.activeEnvironmentId);
  const envs = useMemo(() => ws.environments.filter((e) => !e.collectionId || e.collectionId === collection?.id), [ws.environments, collection?.id]);
  const vars = useMemo(() => scope(ws.globals, environment), [ws.globals, environment]);

  const doSend = useCallback(async () => {
    if (!draft) return;
    setSending(true);
    const outcome = await sendRequest(draft, { collection, environment, globals: ws.globals });
    api.applyWrites(environment?.id, outcome.environment, outcome.globals);
    setResults((r) => ({ ...r, [draft.id]: outcome }));
    api.addHistory({ ...outcome, method: draft.method, url: outcome.response?.url ?? draft.url, name: draft.name });
    setSending(false);
    const written = Object.keys(outcome.environment);
    if (written.length) toast(`Saved ${written.map((k) => `{{${k}}}`).join(', ')} to ${environment?.name ?? 'the environment'}`);
  }, [draft, collection, environment, ws.globals, api]);

  const send = useCallback(() => {
    if (!draft || sending) return;
    if (environment?.production && settings.confirmProduction) setConfirming(true);
    else void doSend();
  }, [draft, sending, environment, settings.confirmProduction, doSend]);

  const newRequest = useCallback(
    (collectionId = collection?.id ?? 'local') => {
      const id = `req:${crypto.randomUUID()}`;
      api.addRequest({
        id,
        collectionId,
        name: 'Untitled request',
        method: 'GET',
        url: '{{baseUrl}}/',
        params: [],
        headers: [],
        body: { mode: 'none', raw: '', form: [] },
        auth: { type: 'inherit' },
        preRequestScript: '',
        postResponseScript: '',
      });
      open(id);
    },
    [api, collection?.id, open],
  );

  const duplicate = useCallback(
    (id = draft?.id) => {
      const source = ws.requests.find((r) => r.id === id);
      if (!source) return;
      const copyId = `req:${crypto.randomUUID()}`;
      api.addRequest({ ...structuredClone(source), id: copyId, name: `${source.name} (copy)`, operation: undefined, seedHash: undefined });
      open(copyId);
      toast('Request duplicated');
    },
    [api, draft?.id, ws.requests, open],
  );

  /** Placeholders for secrets unless the reader explicitly asks for the real values. */
  const copyCurl = useCallback(
    async (includeSecrets = false, id = draft?.id) => {
      const target = ws.requests.find((r) => r.id === id);
      if (!target) return;
      const col = ws.collections.find((c) => c.id === target.collectionId) ?? collection;
      const req = await codeRequest(target, { collection: col, environment, globals: ws.globals }, vars, { includeSecrets });
      await navigator.clipboard.writeText(toCurl(req));
      toast(includeSecrets ? 'cURL copied with real secret values' : 'cURL copied (secrets as placeholders)');
    },
    [draft?.id, ws.requests, ws.collections, collection, environment, ws.globals, vars],
  );

  /** The request as the spec defines it, for requests generated from an operation. */
  const seedRequest = useCallback((id: string) => seeds.flatMap((sd) => sd.requests).find((r) => r.id === id), [seeds]);
  const isEdited = (r: RequestDraft) => Boolean(r.operation && r.seedHash && r.seedHash !== requestHash(r));

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== id);
      if (id === activeId) setActiveId(next.at(-1));
      return next;
    });
  };

  /** Keep only the tabs `keep` returns; the active tab moves to the nearest one left. */
  const closeTabs = (keep: (id: string, index: number, all: string[]) => boolean) => {
    setTabs((t) => {
      const next = t.filter((id, i) => keep(id, i, t));
      if (!activeId || !next.includes(activeId)) setActiveId(next.at(-1));
      return next;
    });
  };

  // Send a request picked from a menu once it is the active one.
  useEffect(() => {
    if (pendingSend && draft?.id === pendingSend) {
      setPendingSend(null);
      send();
    }
  }, [pendingSend, draft?.id, send]);

  const copyText = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  };

  /** Menu items for one request: the sidebar and the tab strip share them. */
  const requestItems = (id: string, where: 'sidebar' | 'tab'): ContextMenuItem[] => {
    const r = ws.requests.find((x) => x.id === id);
    if (!r) return [];
    const items: ContextMenuItem[] = [];
    if (where === 'sidebar') items.push({ id: 'open', label: tabs.includes(id) ? 'Go to tab' : 'Open in a tab', icon: <ExternalLink size={14} />, onAction: () => open(id) });
    items.push(
      {
        id: 'send',
        label: 'Send',
        icon: <SendIcon size={14} />,
        shortcut: '⌘↵',
        onAction: () => {
          open(id);
          setPendingSend(id);
        },
      },
      { id: 'rename', label: 'Rename…', icon: <Pencil size={14} />, separator: true, onAction: () => setDialog({ kind: 'rename', id }) },
      { id: 'duplicate', label: 'Duplicate', icon: <CopyPlus size={14} />, onAction: () => duplicate(id) },
      { id: 'curl', label: 'Copy as cURL', icon: <Terminal size={14} />, onAction: () => void copyCurl(false, id) },
      { id: 'url', label: 'Copy URL', icon: <LinkIcon size={14} />, onAction: () => void copyText(r.url, 'URL') },
    );
    if (r.operation) {
      items.push({
        id: 'reset',
        label: 'Reset to spec',
        icon: <RotateCcw size={14} />,
        separator: true,
        disabled: !isEdited(r),
        onAction: () => {
          const original = seedRequest(id);
          if (!original) return;
          api.updateRequest(id, structuredClone(original));
          toast(`${original.name} reset to the spec`);
        },
      });
    } else {
      items.push({ id: 'delete', label: 'Delete…', icon: <Trash2 size={14} />, danger: true, separator: true, onAction: () => setDialog({ kind: 'delete', id }) });
    }
    if (where === 'tab') {
      const i = tabs.indexOf(id);
      items.push(
        { id: 'close', label: 'Close tab', icon: <X size={14} />, separator: true, onAction: () => closeTab(id) },
        { id: 'close-others', label: 'Close other tabs', disabled: tabs.length < 2, onAction: () => closeTabs((t) => t === id) },
        { id: 'close-right', label: 'Close tabs to the right', disabled: i === tabs.length - 1, onAction: () => closeTabs((_, j) => j <= i) },
        { id: 'close-all', label: 'Close all tabs', onAction: () => closeTabs(() => false) },
      );
    }
    return items;
  };

  const collectionItems = (collectionId: string): ContextMenuItem[] => {
    const first = ws.requests.find((r) => r.collectionId === collectionId);
    return [
      { id: 'new', label: 'New request', icon: <Plus size={14} />, onAction: () => newRequest(collectionId) },
      ...(features.runner
        ? [
            {
              id: 'run',
              label: 'Run collection',
              icon: <Play size={14} />,
              disabled: !first,
              onAction: () => {
                if (first) setActiveId(first.id);
                setView('runner');
              },
            },
          ]
        : []),
    ];
  };

  const historyItems = (index: number): ContextMenuItem[] => {
    const h = ws.history[index];
    if (!h) return [];
    return [
      {
        id: 'open',
        label: 'Open with this response',
        icon: <ExternalLink size={14} />,
        onAction: () => {
          setResults((r) => ({ ...r, [h.requestId]: h }));
          open(h.requestId);
        },
      },
      { id: 'url', label: 'Copy URL', icon: <LinkIcon size={14} />, onAction: () => void copyText(h.url, 'URL') },
      { id: 'remove', label: 'Remove from history', icon: <X size={14} />, separator: true, onAction: () => api.removeHistory(index) },
      { id: 'clear', label: 'Clear history', icon: <Trash2 size={14} />, danger: true, onAction: api.clearHistory },
    ];
  };

  const environmentItems = (id: string): ContextMenuItem[] => {
    if (id === 'globals') return [];
    const env = ws.environments.find((e) => e.id === id);
    if (!env) return [];
    return [
      { id: 'use', label: id === ws.activeEnvironmentId ? 'Active environment' : 'Use this environment', icon: <Check size={14} />, disabled: id === ws.activeEnvironmentId, onAction: () => api.setActiveEnvironment(id) },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Copy size={14} />,
        onAction: () => {
          api.upsertEnvironment({ ...structuredClone(env), id: `env:${crypto.randomUUID()}`, name: `${env.name} (copy)` });
          toast('Environment duplicated');
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 size={14} />,
        danger: true,
        separator: true,
        onAction: () => {
          api.removeEnvironment(id);
          toast(`${env.name} deleted`);
        },
      },
    ];
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'enter') send();
      else if (k === 'k') setPaletteOpen((o) => !o);
      else if (k === 'b') setSettings({ showSidebar: !settings.showSidebar });
      else if (k === 'j') setSettings({ layout: settings.layout === 'stacked' ? 'side-by-side' : 'stacked' });
      else if (k === 'e' && features.environments) setView('environments');
      else if (k === '/') {
        setSettings({ showSidebar: true });
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.oc-side-search input')?.focus());
      } else return;
      // The client owns these shortcuts while it is on screen (e.g. ⌘K is not the site search here).
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [send, settings.showSidebar, settings.layout, setSettings, features.environments]);

  const actions: PaletteAction[] = [
    { id: 'send', label: 'Send request', hint: '↵', run: send },
    { id: 'new', label: 'New request', run: () => newRequest() },
    { id: 'dup', label: 'Duplicate request', run: () => duplicate() },
    { id: 'curl', label: 'Copy as cURL', run: () => void copyCurl() },
    { id: 'curl-secrets', label: 'Copy as cURL with secret values', run: () => void copyCurl(true) },
    ...(features.environments ? [{ id: 'envs', label: 'Open environments', hint: 'E', run: () => setView('environments') }] : []),
    ...(features.runner ? [{ id: 'runner', label: 'Open collection runner', run: () => setView('runner') }] : []),
    ...(features.history ? [{ id: 'history', label: 'Open history', run: () => setView('history') }] : []),
    { id: 'layout', label: `Switch to ${settings.layout === 'stacked' ? 'side-by-side' : 'stacked'} layout`, hint: 'J', run: () => setSettings({ layout: settings.layout === 'stacked' ? 'side-by-side' : 'stacked' }) },
    { id: 'sidebar', label: settings.showSidebar ? 'Hide sidebar' : 'Show sidebar', hint: 'B', run: () => setSettings({ showSidebar: !settings.showSidebar }) },
    { id: 'settings', label: 'Open settings', run: () => setSettingsOpen(true) },
    ...envs.map((e) => ({ id: `env-${e.id}`, label: `Use environment: ${e.name}`, run: () => api.setActiveEnvironment(e.id) })),
  ];

  // Drag to resize the request/response split.
  const startResize = (e: React.PointerEvent) => {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box) return;
    const horizontal = settings.layout === 'side-by-side';
    const move = (ev: PointerEvent) => {
      const pct = horizontal ? ((ev.clientX - box.left) / box.width) * 100 : ((ev.clientY - box.top) / box.height) * 100;
      setSettings({ split: Math.min(80, Math.max(20, Math.round(pct))) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };

  const style = {
    ...(settings.accent ? { '--accent': settings.accent, '--focus': settings.accent } : {}),
    '--oc-font-size': `${settings.fontSize}px`,
    '--oc-split': `${settings.split}%`,
  } as CSSProperties;

  const activeEnvSelect = (
    <Select aria-label="Active environment" value={ws.activeEnvironmentId ?? 'none'} onChange={(v) => api.setActiveEnvironment(v === 'none' ? undefined : String(v))} className="oc-env-select">
      <Select.Trigger>
        <Select.Value />
        {environment?.production ? (
          <Chip size="sm" color="danger" variant="soft" className="oc-env-prod">
            <Chip.Label>prod</Chip.Label>
          </Chip>
        ) : null}
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {[
            <ListBox.Item key="none" id="none" textValue="No environment">
              No environment
              <ListBox.ItemIndicator />
            </ListBox.Item>,
            ...envs.map((e) => (
              <ListBox.Item key={e.id} id={e.id} textValue={e.name}>
                <span className="oc-env-option">
                  <span className="oc-env-dot" style={{ background: e.color ?? 'var(--muted)' }} />
                  <span className="oc-ellipsis">{e.name}</span>
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )),
          ]}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  return (
    <div className={`oc-client ${className ?? ''}`} style={style} data-density={settings.density} data-sidebar={settings.showSidebar || undefined} data-accent={settings.accent ? '' : undefined}>
      <Toast.Provider placement="bottom end" />
      <Rail view={view} onView={setView} onSettings={() => setSettingsOpen(true)} features={features} />
      {settings.showSidebar ? (
        <CollectionsPanel
          collections={ws.collections}
          requests={ws.requests}
          activeId={draft?.id}
          onOpen={open}
          onNew={newRequest}
          onContextMenu={(e, t, el) =>
            t.kind === 'request' ? ctx.open(e, 'Request actions', requestItems(t.id, 'sidebar'), el) : ctx.open(e, 'Collection actions', collectionItems(t.id), el)
          }
        />
      ) : null}
      <section className="oc-main">
        <header className="oc-topbar">
          <Tooltip delay={300}>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Toggle sidebar" onPress={() => setSettings({ showSidebar: !settings.showSidebar })}>
              <PanelLeft size={16} />
            </Button>
            <Tooltip.Content>Toggle sidebar · ⌘B</Tooltip.Content>
          </Tooltip>
          {view === 'collections' ? (
            <TabStrip
              tabs={openTabs}
              activeId={draft?.id}
              dirty={new Set(Object.keys(results))}
              onActivate={setActiveId}
              onClose={closeTab}
              onNew={() => newRequest()}
              onContextMenu={(e, id) => ctx.open(e, 'Tab actions', requestItems(id, 'tab'))}
            />
          ) : (
            <strong className="oc-view-title">{{ environments: 'Environments', runner: 'Collection runner', history: 'History', import: 'Import', collections: '' }[view]}</strong>
          )}
          {/* The tab strip grows by itself; other views need a spacer after their title. */}
          {view !== 'collections' && <div className="oc-grow" />}
          {activeEnvSelect}
          <Button size="sm" variant="ghost" onPress={() => setPaletteOpen(true)} aria-label="Command palette">
            <Command size={14} /> K
          </Button>
          <Tooltip delay={300}>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Export workspace"
              onPress={() => {
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([api.exportJson()], { type: 'application/json' })), download: 'orbitdocs-workspace.json' });
                a.click();
                URL.revokeObjectURL(a.href);
                toast('Workspace exported (secrets excluded)');
              }}
            >
              <Download size={15} />
            </Button>
            <Tooltip.Content>Export workspace</Tooltip.Content>
          </Tooltip>
        </header>

        {view === 'collections' ? (
          draft ? (
            <div className="oc-workspace">
              <div className="oc-request-head">
                <Input aria-label="Request name" className="oc-name-input" value={draft.name} onChange={(e) => api.updateRequest(draft.id, { name: e.target.value })} />
                {draft.folder ? <span className="oc-hint">in {draft.folder}</span> : null}
              </div>
              <UrlBar
                method={draft.method}
                url={draft.url}
                vars={vars}
                sending={sending}
                onMethod={(method) => api.updateRequest(draft.id, { method })}
                onUrl={(url) => api.updateRequest(draft.id, { url })}
                onSend={send}
                onCopyCurl={(includeSecrets) => void copyCurl(includeSecrets)}
                onDuplicate={() => duplicate()}
              />
              <VariableChips text={`${draft.url} ${draft.headers.map((h) => h.value).join(' ')} ${draft.body.raw}`} vars={vars} />
              <div ref={splitRef} className="oc-split" data-layout={settings.layout}>
                <div className="oc-pane">
                  <RequestPanel
                    draft={draft}
                    onChange={(patch) => api.updateRequest(draft.id, patch)}
                    collection={collection}
                    environment={environment}
                    globals={ws.globals}
                    features={features}
                    snippetLanguage={settings.snippetLanguage}
                    onSnippetLanguage={(snippetLanguage) => setSettings({ snippetLanguage })}
                  />
                </div>
                <div className="oc-resizer" role="separator" aria-label="Resize panels" aria-orientation={settings.layout === 'stacked' ? 'horizontal' : 'vertical'} onPointerDown={startResize} />
                <div className="oc-pane">
                  <ResponsePanel result={results[draft.id]} sending={sending} wrap={settings.wrapLines} />
                </div>
              </div>
            </div>
          ) : (
            <div className="oc-empty">
              <p className="oc-empty-title">No request open</p>
              <Button onPress={() => newRequest()}>New request</Button>
            </div>
          )
        ) : null}

        {view === 'environments' ? (
          <EnvironmentsView
            globals={ws.globals}
            environments={ws.environments}
            activeId={ws.activeEnvironmentId}
            collectionId={collection?.id}
            onGlobals={api.setGlobals}
            onEnvironment={api.upsertEnvironment}
            onRemove={api.removeEnvironment}
            onActivate={api.setActiveEnvironment}
            onContextMenu={(e, id, el) => ctx.open(e, 'Environment actions', environmentItems(id), el)}
          />
        ) : null}
        {view === 'runner' && collection ? (
          <RunnerView
            collection={collection}
            requests={ws.requests.filter((r) => r.collectionId === collection.id)}
            environment={environment}
            globals={ws.globals}
            onWrites={(env, globals) => api.applyWrites(environment?.id, env, globals)}
          />
        ) : null}
        {view === 'history' ? (
          <HistoryView
            history={ws.history}
            onClear={api.clearHistory}
            onContextMenu={(e, i, el) => ctx.open(e, 'History actions', historyItems(i), el)}
            onOpen={(i) => {
              const h = ws.history[i]!;
              setResults((r) => ({ ...r, [h.requestId]: h }));
              open(h.requestId);
            }}
          />
        ) : null}
        {view === 'import' ? (
          <ImportView
            collectionId={collection?.id ?? 'local'}
            collectionName={collection?.name ?? 'your workspace'}
            onImport={(r) => {
              api.addRequest(r);
              open(r.id);
              toast(`Imported ${r.method} ${r.name}`);
            }}
          />
        ) : null}
      </section>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} requests={ws.requests} actions={actions} onOpenRequest={open} />
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={setSettings} onReset={resetSettings} />
      <Modal>
        <Modal.Backdrop isOpen={confirming} onOpenChange={setConfirming}>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Send to {environment?.name}?</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p>This environment is marked as production. The request will run against real data.</p>
                <Label className="oc-hint">You can turn this check off in settings.</Label>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    setConfirming(false);
                    void doSend();
                  }}
                >
                  Send
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      {ctx.element}
      <RequestDialog
        dialog={dialog}
        request={dialog ? ws.requests.find((r) => r.id === dialog.id) : undefined}
        onClose={() => {
          setDialog(null);
          ctx.returnFocus();
        }}
        onRename={(id, name) => {
          api.updateRequest(id, { name });
          toast('Request renamed');
        }}
        onDelete={(id) => {
          const name = ws.requests.find((r) => r.id === id)?.name ?? 'Request';
          closeTabs((t) => t !== id);
          api.removeRequest(id);
          toast(`${name} deleted`);
        }}
      />
    </div>
  );
}

/** Rename a request, or confirm deleting one; opened from the context menus. */
function RequestDialog({
  dialog,
  request,
  onClose,
  onRename,
  onDelete,
}: {
  dialog: { kind: 'rename' | 'delete'; id: string } | null;
  request?: RequestDraft;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (dialog?.kind === 'rename' && request) setName(request.name);
  }, [dialog, request]);
  const isOpen = Boolean(dialog && request);
  return (
    <Modal>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => (o ? undefined : onClose())}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            {dialog?.kind === 'rename' && request ? (
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = name.trim();
                  if (next && next !== request.name) onRename(request.id, next);
                  onClose();
                }}
              >
                <Modal.Header>
                  <Modal.Heading>Rename request</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <TextField value={name} onChange={setName} isRequired autoFocus aria-label="Request name">
                    <Label>Name</Label>
                    <Input onFocus={(e) => e.currentTarget.select()} />
                  </TextField>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" slot="close">
                    Cancel
                  </Button>
                  <Button type="submit" isDisabled={!name.trim()}>
                    Rename
                  </Button>
                </Modal.Footer>
              </Form>
            ) : null}
            {dialog?.kind === 'delete' && request ? (
              <>
                <Modal.Header>
                  <Modal.Heading>Delete {request.name}?</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p>The request and its scripts are removed from this browser. This can't be undone.</p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" slot="close" autoFocus>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onPress={() => {
                      onDelete(request.id);
                      onClose();
                    }}
                  >
                    Delete
                  </Button>
                </Modal.Footer>
              </>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
