'use client';

import { Alert, Button, Chip, Description, Dropdown, Input, Label, ListBox, Select, Switch, Tabs, TextArea, TextField, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react';
import { snippetz } from '@scalar/snippetz';
import { LuCopy as Copy, LuSparkles as Sparkles, LuWandSparkles as WandSparkles } from 'react-icons/lu';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { codeRequest, unescapeVariables } from '../code';
import { pickedFiles } from '../send';
import type { ClientFeatures } from '../settings';
import type { AuthDraft, BodyMode, Collection, Environment, RequestDraft, Variable } from '../types';
import { scope } from '../variables';
import { KVEditor } from './kv-editor';

const SNIPPETS: Array<{ id: string; label: string; target: string; client: string }> = [
  { id: 'curl', label: 'cURL', target: 'shell', client: 'curl' },
  { id: 'fetch', label: 'JavaScript', target: 'js', client: 'fetch' },
  { id: 'node', label: 'Node.js', target: 'node', client: 'fetch' },
  { id: 'python', label: 'Python', target: 'python', client: 'requests' },
  { id: 'go', label: 'Go', target: 'go', client: 'native' },
  { id: 'php', label: 'PHP', target: 'php', client: 'guzzle' },
  { id: 'ruby', label: 'Ruby', target: 'ruby', client: 'native' },
  { id: 'csharp', label: 'C#', target: 'csharp', client: 'httpclient' },
];

/** One-click script snippets (Postman-compatible). */
const SCRIPT_SNIPPETS: Record<'pre' | 'post', Array<{ id: string; label: string; code: string }>> = {
  pre: [
    { id: 'uuid', label: 'Set a request ID header', code: "pm.request.headers.upsert({ key: 'X-Request-Id', value: crypto.randomUUID() });" },
    { id: 'idem', label: 'Add an Idempotency-Key', code: "pm.request.headers.upsert({ key: 'Idempotency-Key', value: crypto.randomUUID() });" },
    { id: 'ts', label: 'Save a timestamp variable', code: "pm.variables.set('now', new Date().toISOString());" },
  ],
  post: [
    { id: 'status', label: 'Test: status is 2xx', code: "pm.test('status is 2xx', () => {\n  pm.expect(pm.response.code).to.be.at.least(200);\n  pm.expect(pm.response.code).to.be.below(300);\n});" },
    { id: 'json', label: 'Test: body is JSON', code: "pm.test('body is JSON', () => pm.response.to.have.jsonBody());" },
    { id: 'time', label: 'Test: faster than 500 ms', code: "pm.test('faster than 500 ms', () => pm.expect(pm.response.responseTime).to.be.below(500));" },
    { id: 'save', label: 'Save response id to {{id}}', code: "pm.environment.set('id', pm.response.json().id);" },
    { id: 'log', label: 'Log the response', code: 'console.log(pm.response.json());' },
  ],
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="oc-field">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TextInput({ label, value, onChange, secret }: { label: string; value: string; onChange: (v: string) => void; secret?: boolean }) {
  return (
    <TextField value={value} onChange={onChange} className="oc-field">
      <Label>{label}</Label>
      <Input type={secret ? 'password' : 'text'} className="oc-mono-input" />
    </TextField>
  );
}

function AuthEditor({ auth, onChange, inherited }: { auth: AuthDraft; onChange: (a: AuthDraft) => void; inherited?: AuthDraft }) {
  const types: Array<[AuthDraft['type'], string]> = [
    ['inherit', 'Inherit from collection'],
    ['none', 'No auth'],
    ['apiKey', 'API key'],
    ['bearer', 'Bearer token'],
    ['basic', 'Basic auth'],
    ['oauth2', 'OAuth 2.0 · client credentials'],
  ];
  const change = (t: AuthDraft['type']) =>
    onChange(
      t === 'apiKey' ? { type: 'apiKey', in: 'header', name: 'X-API-Key', value: '{{apiKey}}' }
      : t === 'bearer' ? { type: 'bearer', token: '{{token}}' }
      : t === 'basic' ? { type: 'basic', username: '{{username}}', password: '{{password}}' }
      : t === 'oauth2' ? { type: 'oauth2', tokenUrl: '', clientId: '{{clientId}}', clientSecret: '{{clientSecret}}', scope: '', token: '' }
      : ({ type: t } as AuthDraft),
    );
  return (
    <div className="oc-stack">
      <Field label="Type">
        <Select aria-label="Auth type" value={auth.type} onChange={(v) => v && change(v as AuthDraft['type'])} className="oc-w-72">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {types.map(([id, label]) => (
                <ListBox.Item key={id} id={id} textValue={label}>
                  {label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </Field>
      {auth.type === 'inherit' ? (
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Uses the collection's {inherited?.type === 'apiKey' ? 'API key' : (inherited?.type ?? 'auth')}</Alert.Title>
            <Alert.Description>Values like {'{{apiKey}}'} come from the active environment. Set them once in Environments.</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {auth.type === 'apiKey' ? (
        <div className="oc-grid">
          <Field label="Add to">
            <ToggleButtonGroup selectionMode="single" disallowEmptySelection selectedKeys={new Set([auth.in])} onSelectionChange={(k) => onChange({ ...auth, in: [...k][0] as 'header' | 'query' })} aria-label="Send key in">
              <ToggleButton id="header">Header</ToggleButton>
              <ToggleButton id="query">
                <ToggleButtonGroup.Separator />
                Query
              </ToggleButton>
            </ToggleButtonGroup>
          </Field>
          <TextInput label="Name" value={auth.name} onChange={(name) => onChange({ ...auth, name })} />
          <TextInput label="Value" value={auth.value} onChange={(value) => onChange({ ...auth, value })} secret />
        </div>
      ) : null}
      {auth.type === 'bearer' ? <TextInput label="Token" value={auth.token} onChange={(token) => onChange({ ...auth, token })} secret /> : null}
      {auth.type === 'basic' ? (
        <div className="oc-grid">
          <TextInput label="Username" value={auth.username} onChange={(username) => onChange({ ...auth, username })} />
          <TextInput label="Password" value={auth.password} onChange={(password) => onChange({ ...auth, password })} secret />
        </div>
      ) : null}
      {auth.type === 'oauth2' ? (
        <div className="oc-grid">
          <TextInput label="Token URL" value={auth.tokenUrl} onChange={(tokenUrl) => onChange({ ...auth, tokenUrl })} />
          <TextInput label="Client ID" value={auth.clientId} onChange={(clientId) => onChange({ ...auth, clientId })} />
          <TextInput label="Client secret" value={auth.clientSecret} onChange={(clientSecret) => onChange({ ...auth, clientSecret })} secret />
          <TextInput label="Scope" value={auth.scope} onChange={(scope) => onChange({ ...auth, scope })} />
          <TextInput label="Access token (skips the token request)" value={auth.token} onChange={(token) => onChange({ ...auth, token })} secret />
        </div>
      ) : null}
    </div>
  );
}

function BodyEditor({ draft, onChange }: { draft: RequestDraft; onChange: (patch: Partial<RequestDraft>) => void }) {
  const b = draft.body;
  const jsonState = useMemo(() => {
    if (b.mode !== 'json' || !b.raw.trim()) return undefined;
    try {
      // Variables are valid inside strings and as bare values.
      JSON.parse(b.raw.replace(/\{\{[^}]+\}\}/g, '0'));
      return 'valid';
    } catch (e) {
      return (e as Error).message;
    }
  }, [b.mode, b.raw]);
  const modes: Array<[BodyMode, string]> = [
    ['none', 'None'],
    ['json', 'JSON'],
    ['raw', 'Raw'],
    ['form-urlencoded', 'Form'],
    ['multipart', 'Multipart'],
  ];
  return (
    <div className="oc-stack">
      <div className="oc-row">
        <ToggleButtonGroup size="sm" selectionMode="single" disallowEmptySelection selectedKeys={new Set([b.mode])} onSelectionChange={(k) => onChange({ body: { ...b, mode: [...k][0] as BodyMode } })} aria-label="Body type">
          {modes.map(([id, label], i) => (
            <ToggleButton key={id} id={id}>
              {i ? <ToggleButtonGroup.Separator /> : null}
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {b.mode === 'json' ? (
          <>
            {jsonState ? (
              <Chip size="sm" variant="soft" color={jsonState === 'valid' ? 'success' : 'danger'}>
                <Chip.Label>{jsonState === 'valid' ? 'Valid JSON' : 'Invalid JSON'}</Chip.Label>
              </Chip>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              isDisabled={jsonState !== 'valid' || /\{\{/.test(b.raw)}
              onPress={() => onChange({ body: { ...b, raw: JSON.stringify(JSON.parse(b.raw), null, 2) } })}
            >
              <WandSparkles size={14} /> Prettify
            </Button>
          </>
        ) : null}
      </div>
      {b.mode === 'json' || b.mode === 'raw' ? (
        <TextArea aria-label="Request body" className="oc-code-input" rows={12} spellCheck={false} value={b.raw} onChange={(e) => onChange({ body: { ...b, raw: e.target.value } })} />
      ) : null}
      {jsonState && jsonState !== 'valid' ? <p className="oc-hint oc-danger-text">{jsonState}</p> : null}
      {b.mode === 'form-urlencoded' || b.mode === 'multipart' ? (
        <KVEditor
          rows={b.form}
          allowFiles={b.mode === 'multipart'}
          keyLabel="Field"
          onChange={(form) => onChange({ body: { ...b, form } })}
          onFile={(i, file) => (file ? pickedFiles.set(`${draft.id}:${i}`, file) : pickedFiles.delete(`${draft.id}:${i}`))}
        />
      ) : null}
      {b.mode === 'none' ? <p className="oc-hint">This request has no body.</p> : null}
    </div>
  );
}

function ScriptEditor({ phase, value, onChange }: { phase: 'pre' | 'post'; value: string; onChange: (v: string) => void }) {
  return (
    <div className="oc-stack">
      <div className="oc-row">
        <span className="oc-hint">
          {phase === 'pre' ? 'Runs before the request is sent.' : 'Runs after the response arrives. Use pm.test(…) for tests.'}
        </span>
        <Dropdown>
          <Button size="sm" variant="ghost">
            <Sparkles size={14} /> Insert snippet
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu aria-label="Script snippets" onAction={(k) => onChange(`${value.trim() ? `${value.trimEnd()}\n` : ''}${SCRIPT_SNIPPETS[phase].find((s) => s.id === k)!.code}\n`)}>
              {SCRIPT_SNIPPETS[phase].map((s) => (
                <Dropdown.Item key={s.id} id={s.id} textValue={s.label}>
                  <Label>{s.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <TextArea
        aria-label={phase === 'pre' ? 'Pre-request script' : 'Post-response script'}
        className="oc-code-input"
        rows={12}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={phase === 'pre' ? "pm.environment.set('requestId', crypto.randomUUID());" : "pm.test('status is 200', () => pm.response.to.have.status(200));"}
      />
    </div>
  );
}

function CodePanel({ draft, collection, environment, globals, language, onLanguage }: { draft: RequestDraft; collection?: Collection; environment?: Environment; globals: Variable[]; language: string; onLanguage: (l: string) => void }) {
  const [code, setCode] = useState('');
  // Off on every visit: code is copied and shared, so real secrets need an explicit opt-in.
  const [includeSecrets, setIncludeSecrets] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void codeRequest(draft, { collection, environment, globals }, scope(globals, environment), { includeSecrets })
      .then((req) => {
        const s = SNIPPETS.find((x) => x.id === language) ?? SNIPPETS[0]!;
        const u = new URL(req.url);
        const out = snippetz().print(s.target as never, s.client as never, {
          method: req.method,
          url: unescapeVariables(`${u.origin}${u.pathname}`),
          queryString: [...u.searchParams.entries()].map(([name, value]) => ({ name, value })),
          headers: req.headers.map((h) => ({ name: h.key, value: h.value })),
          ...(req.body ? { postData: { mimeType: req.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? 'text/plain', text: req.body } } : {}),
        } as never);
        if (!cancelled) setCode(out ?? '');
      })
      .catch((e: Error) => !cancelled && setCode(`// ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, [draft, collection, environment, globals, language, includeSecrets]);
  return (
    <div className="oc-stack">
      <div className="oc-row">
        <Select aria-label="Snippet language" value={language} onChange={(v) => v && onLanguage(String(v))} className="oc-w-48">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {SNIPPETS.map((s) => (
                <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                  {s.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Button size="sm" variant="secondary" onPress={() => void navigator.clipboard.writeText(code).then(() => toast(includeSecrets ? 'Copied with real secret values' : 'Copied to clipboard'))}>
          <Copy size={14} /> Copy
        </Button>
      </div>
      <Switch size="sm" isSelected={includeSecrets} onChange={setIncludeSecrets}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Include secret values</Label>
        </Switch.Content>
        <Description>
          {includeSecrets
            ? 'The code below contains your real keys, tokens and passwords. Don\'t paste it anywhere public.'
            : 'Keys, tokens, passwords and secret variables are shown as {{variable}} or YOUR_… placeholders.'}
        </Description>
      </Switch>
      <pre className="oc-pre oc-code-block">{code}</pre>
    </div>
  );
}

export function RequestPanel({
  draft,
  onChange,
  collection,
  environment,
  globals,
  features,
  snippetLanguage,
  onSnippetLanguage,
}: {
  draft: RequestDraft;
  onChange: (patch: Partial<RequestDraft>) => void;
  collection?: Collection;
  environment?: Environment;
  globals: Variable[];
  features: ClientFeatures;
  snippetLanguage: string;
  onSnippetLanguage: (l: string) => void;
}) {
  const [tab, setTab] = useState<string>(draft.body.mode !== 'none' ? 'body' : 'params');
  useEffect(() => setTab(draft.body.mode !== 'none' ? 'body' : 'params'), [draft.id]);
  const n = (count: number) =>
    count ? (
      <Chip size="sm" variant="soft" className="oc-tab-count">
        <Chip.Label>{count}</Chip.Label>
      </Chip>
    ) : null;
  const tabs: Array<[string, string, ReactNode]> = [
    ['params', 'Params', n(draft.params.filter((p) => p.enabled).length)],
    ['headers', 'Headers', n(draft.headers.filter((p) => p.enabled).length)],
    ['body', 'Body', draft.body.mode !== 'none' ? <span className="oc-dot" /> : null],
    ['auth', 'Auth', null],
    ...(features.scripts ? ([['scripts', 'Scripts', n([draft.preRequestScript, draft.postResponseScript].filter((s) => s.trim()).length)]] as Array<[string, string, ReactNode]>) : []),
    ['code', 'Code', null],
  ];
  return (
    <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))} variant="secondary" className="oc-request-tabs">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Request sections">
          {tabs.map(([id, label, badge]) => (
            <Tabs.Tab key={id} id={id}>
              {label}
              {badge}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="params" className="oc-panel">
        <KVEditor rows={draft.params} onChange={(params) => onChange({ params })} keyLabel="Parameter" emptyHint="Query parameters are added to the URL." />
      </Tabs.Panel>
      <Tabs.Panel id="headers" className="oc-panel">
        <KVEditor rows={draft.headers} onChange={(headers) => onChange({ headers })} keyLabel="Header" emptyHint="Auth headers are added from the Auth tab." />
      </Tabs.Panel>
      <Tabs.Panel id="body" className="oc-panel">
        <BodyEditor draft={draft} onChange={onChange} />
      </Tabs.Panel>
      <Tabs.Panel id="auth" className="oc-panel">
        <AuthEditor auth={draft.auth} onChange={(auth) => onChange({ auth })} inherited={collection?.auth} />
      </Tabs.Panel>
      {features.scripts ? (
        <Tabs.Panel id="scripts" className="oc-panel">
          <div className="oc-scripts">
            <ScriptEditor phase="pre" value={draft.preRequestScript} onChange={(preRequestScript) => onChange({ preRequestScript })} />
            <ScriptEditor phase="post" value={draft.postResponseScript} onChange={(postResponseScript) => onChange({ postResponseScript })} />
          </div>
        </Tabs.Panel>
      ) : null}
      <Tabs.Panel id="code" className="oc-panel">
        <CodePanel draft={draft} collection={collection} environment={environment} globals={globals} language={snippetLanguage} onLanguage={onSnippetLanguage} />
      </Tabs.Panel>
    </Tabs>
  );
}
