'use client';

import { Button, Chip, SearchField, Table, Tabs, Tooltip, toast } from '@heroui/react';
import { LuCircleCheck as CheckCircle2, LuClock as Clock, LuCopy as Copy, LuDownload as Download, LuHardDrive as HardDrive, LuCircleX as XCircle } from 'react-icons/lu';
import { useMemo, useState } from 'react';

import type { RunResult } from '../types';
import { JsonTree } from './json-tree';

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const tone = (status: number) => (status >= 200 && status < 300 ? 'success' : status >= 300 && status < 400 ? 'accent' : status >= 400 && status < 500 ? 'warning' : 'danger');

export function ResponsePanel({ result, sending, wrap }: { result?: RunResult; sending: boolean; wrap: boolean }) {
  const [tab, setTab] = useState('pretty');
  const [query, setQuery] = useState('');
  const r = result?.response;
  const json = useMemo(() => {
    if (!r?.body) return undefined;
    try {
      return { value: JSON.parse(r.body) as unknown };
    } catch {
      return undefined;
    }
  }, [r?.body]);

  if (!result) {
    return (
      <div className="oc-response oc-empty">
        <div className="oc-empty-art" aria-hidden>
          ⟶
        </div>
        <p className="oc-empty-title">{sending ? 'Sending…' : 'Send a request to see the response'}</p>
        <p className="oc-hint">Press ⌘ ↵ to send · ⌘ K for commands</p>
      </div>
    );
  }

  const passed = result.tests.filter((t) => t.passed).length;
  const contentType = r?.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  return (
    <div className="oc-response">
      <div className="oc-response-bar">
        {r ? (
          <>
            <Chip color={r.status ? tone(r.status) : 'danger'} variant="soft">
              <Chip.Label className="oc-mono">
                {r.status || 'ERR'} {r.statusText}
              </Chip.Label>
            </Chip>
            <Chip variant="soft" size="sm">
              <Clock size={12} />
              <Chip.Label>{r.time} ms</Chip.Label>
            </Chip>
            <Chip variant="soft" size="sm">
              <HardDrive size={12} />
              <Chip.Label>{bytes(r.size)}</Chip.Label>
            </Chip>
          </>
        ) : null}
        {result.tests.length ? (
          <Chip size="sm" variant="soft" color={passed === result.tests.length ? 'success' : 'danger'}>
            {passed === result.tests.length ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            <Chip.Label>
              Tests {passed}/{result.tests.length}
            </Chip.Label>
          </Chip>
        ) : null}
        <div className="oc-grow" />
        {r?.body ? (
          <>
            <Tooltip delay={300}>
              <Button isIconOnly size="sm" variant="ghost" aria-label="Copy body" onPress={() => void navigator.clipboard.writeText(r.body).then(() => toast('Response copied'))}>
                <Copy size={14} />
              </Button>
              <Tooltip.Content>Copy body</Tooltip.Content>
            </Tooltip>
            <Tooltip delay={300}>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label="Download body"
                onPress={() => {
                  const a = Object.assign(document.createElement('a'), {
                    href: URL.createObjectURL(new Blob([r.body], { type: contentType || 'text/plain' })),
                    download: json ? 'response.json' : 'response.txt',
                  });
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download size={14} />
              </Button>
              <Tooltip.Content>Download</Tooltip.Content>
            </Tooltip>
          </>
        ) : null}
      </div>
      {result.error || r?.error ? <div className="oc-error-banner">{result.error ?? r?.error}</div> : null}
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))} variant="secondary" className="oc-response-tabs">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Response views">
            <Tabs.Tab id="pretty">
              {json ? 'Pretty' : 'Body'}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="raw">
              Raw
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="headers">
              Headers {r ? `(${r.headers.length})` : ''}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="tests">
              Tests {result.tests.length ? `(${passed}/${result.tests.length})` : ''}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="console">
              Console {result.logs.length ? `(${result.logs.length})` : ''}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="pretty" className="oc-panel">
          {json ? (
            <>
              <SearchField aria-label="Search response" value={query} onChange={setQuery} className="oc-response-search">
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Filter keys and values" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <JsonTree value={json.value} query={query} />
            </>
          ) : (
            <pre className="oc-pre" data-wrap={wrap}>
              {r?.body || '(empty body)'}
            </pre>
          )}
        </Tabs.Panel>
        <Tabs.Panel id="raw" className="oc-panel">
          <pre className="oc-pre" data-wrap={wrap}>
            {r?.body || '(empty body)'}
          </pre>
        </Tabs.Panel>
        <Tabs.Panel id="headers" className="oc-panel">
          {r?.headers.length ? (
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Response headers">
                  <Table.Header>
                    <Table.Column isRowHeader>Header</Table.Column>
                    <Table.Column>Value</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {r.headers.map(([k, v]) => (
                      <Table.Row key={k} id={k}>
                        <Table.Cell className="oc-mono">{k}</Table.Cell>
                        <Table.Cell className="oc-mono">{v}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          ) : (
            <p className="oc-hint">No headers.</p>
          )}
        </Tabs.Panel>
        <Tabs.Panel id="tests" className="oc-panel">
          {result.tests.length ? (
            <div className="oc-tests">
              {result.tests.map((t, i) => (
                <div key={i} className="oc-test" data-passed={t.passed}>
                  <Chip size="sm" variant="soft" color={t.passed ? 'success' : 'danger'}>
                    <Chip.Label>{t.passed ? 'PASS' : 'FAIL'}</Chip.Label>
                  </Chip>
                  <div>
                    <div>{t.name}</div>
                    {t.error ? <div className="oc-hint oc-mono">{t.error}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="oc-hint">No tests ran. Add pm.test(…) in the post-response script, or use Insert snippet.</p>
          )}
        </Tabs.Panel>
        <Tabs.Panel id="console" className="oc-panel">
          <pre className="oc-pre">{result.logs.join('\n') || '(no output)'}</pre>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
