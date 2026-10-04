'use client';

import { Button, Input, Tabs } from '@heroui/react';
import { useState } from 'react';
import { LuEye as Eye, LuEyeOff as EyeOff } from 'react-icons/lu';

import { LanguageMenu } from './language-menu';
import { useReference } from './store';

export function ServerCard() {
  const { servers, server, setServer } = useReference();
  if (!servers.length) return null;
  const current = servers.find((s) => s.url === server);
  return (
    <div className="od-card">
      <div className="od-card-header">Server</div>
      <div className="od-card-row">
        {servers.length > 1 ? (
          <LanguageMenu label="Server" className="od-mono od-picker-wide" options={servers.map((s) => ({ id: s.url, label: s.url }))} value={server} onChange={setServer} />
        ) : (
          <span className="od-mono">{server}</span>
        )}
      </div>
      {current?.description ? <div className="od-card-row od-muted">{current.description}</div> : null}
    </div>
  );
}

export function AuthCard() {
  const { schemes, credentials, setCredential } = useReference();
  const [selected, setSelected] = useState(schemes[0]?.name);
  const [reveal, setReveal] = useState(false);
  const scheme = schemes.find((s) => s.name === selected);
  if (!scheme) return null;
  const label =
    scheme.type === 'apiKey' ? `${scheme.paramName ?? scheme.name}:` : scheme.scheme === 'basic' ? 'Username:Password' : 'Bearer Token:';
  return (
    <div className="od-card">
      <div className="od-card-header">
        <span>
          Authentication <span className="od-muted">Required</span>
        </span>
        {schemes.length > 1 ? (
          <LanguageMenu label="Security scheme" options={schemes.map((s) => ({ id: s.name, label: s.name }))} value={selected ?? ''} onChange={setSelected} />
        ) : (
          <span className="od-muted">{scheme.name}</span>
        )}
      </div>
      {scheme.description ? <div className="od-card-row od-muted">{scheme.description}</div> : null}
      <div className="od-card-row od-auth-row">
        <span id="od-auth-label">{label}</span>
        <Input
          aria-labelledby="od-auth-label"
          className="od-auth-input"
          variant="secondary"
          type={reveal ? 'text' : 'password'}
          placeholder={scheme.type === 'apiKey' ? 'Value' : 'Token'}
          value={credentials[scheme.name] ?? ''}
          onChange={(e) => setCredential(scheme.name, e.target.value)}
          autoComplete="off"
        />
        <Button isIconOnly size="sm" variant="ghost" aria-label={reveal ? 'Hide' : 'Show'} onPress={() => setReveal((r) => !r)}>
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </Button>
      </div>
    </div>
  );
}

export function ClientLibrariesCard() {
  const { languages, language, setLanguage } = useReference();
  const visible = languages.slice(0, 5);
  const rest = languages.slice(5);
  const current = languages.find((l) => l.id === language);
  const inRest = rest.some((l) => l.id === language);
  // A language picked from "More" joins the tabs so one tab is always selected.
  const tabs = inRest && current ? [...visible, current] : visible;
  return (
    <div className="od-card">
      <div className="od-card-header">Client Libraries</div>
      <div className="od-lib-tabs">
        <Tabs selectedKey={language} onSelectionChange={(k) => setLanguage(String(k))} variant="secondary" className="od-lib-tablist">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Client libraries">
              {tabs.map((l) => (
                <Tabs.Tab key={l.id} id={l.id}>
                  {l.label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        {rest.length ? (
          <LanguageMenu label="More languages" placeholder="More" options={rest} value="" onChange={setLanguage} className="od-lib-more" />
        ) : null}
      </div>
      <div className="od-card-row od-mono od-muted">{current?.label ?? ''}</div>
    </div>
  );
}
