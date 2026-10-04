'use client';

import { Switch, Tabs } from '@heroui/react';
import { type ReactNode, useState } from 'react';

import { CopyButton } from './copy-button';

export interface ResponseExampleView {
  status: string;
  description: string;
  code?: string;
  html?: string;
  /** Server-rendered schema fields (shown with "Show Schema"). */
  schema?: ReactNode;
  /** The same as HTML (operations shipped as data). */
  schemaHtml?: string;
}

export function ResponseCard({ responses }: { responses: ResponseExampleView[] }) {
  const [active, setActive] = useState(responses[0]?.status);
  const [showSchema, setShowSchema] = useState(false);
  const current = responses.find((r) => r.status === active) ?? responses[0];
  if (!current) return null;
  const hasSchema = Boolean(current.schema || current.schemaHtml);
  const body =
    showSchema && hasSchema ? (
      current.schema ? (
        <div className="od-response-schema">{current.schema}</div>
      ) : (
        <div className="od-response-schema" dangerouslySetInnerHTML={{ __html: current.schemaHtml ?? '' }} />
      )
    ) : current.html ? (
      <div className="od-code-wrap">
        <div className="od-code" dangerouslySetInnerHTML={{ __html: current.html }} />
        {current.code ? <CopyButton text={current.code} className="od-icon-button od-code-copy" /> : null}
      </div>
    ) : (
      <div className="od-empty">No body</div>
    );
  return (
    <div className="od-card od-response-card">
      <Tabs selectedKey={current.status} onSelectionChange={(k) => setActive(String(k))} variant="secondary" className="od-status-tabs">
        <div className="od-card-header od-tabs-header">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Response status">
              {responses.map((r) => (
                <Tabs.Tab key={r.status} id={r.status} className="od-status-tab" data-tone={r.status[0]}>
                  {r.status}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
          {hasSchema ? (
            <Switch size="sm" isSelected={showSchema} onChange={setShowSchema} className="od-schema-toggle">
              <Switch.Content>
                Show Schema
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          ) : null}
        </div>
        {responses.map((r) => (
          <Tabs.Panel key={r.status} id={r.status} className="od-status-panel">
            {r.status === current.status ? body : null}
          </Tabs.Panel>
        ))}
      </Tabs>
      <div className="od-card-footer od-response-description">{current.description}</div>
    </div>
  );
}
