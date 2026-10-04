'use client';

import { Button } from '@heroui/react';
import { LuPlay as Play } from 'react-icons/lu';
import { useEffect, useState } from 'react';

import { CopyButton } from './copy-button';
import { fillCredentials } from './credentials';
import { LanguageMenu } from './language-menu';
import { useReference } from './store';
import { ClientModal } from './client-modal';

export interface SampleView {
  id: string;
  label: string;
  code: string;
  html: string;
}

export function RequestCard({
  method,
  path,
  samples: initial,
  options,
  requestId,
}: {
  method: string;
  path: string;
  samples: SampleView[];
  /** Every language, when only some samples are in the page (the rest load on demand). */
  options?: Array<{ id: string; label: string }>;
  /** `<api>:<operation-slug>`, the request opened in the client. */
  requestId: string;
}) {
  const { language, setLanguage, schemes, credentials, seed, clientDefaults, moreSamples, loadSamples } = useReference();
  const [open, setOpen] = useState(false);
  const slug = requestId.split(':')[1] ?? '';
  const samples = moreSamples?.[slug] ?? initial;
  // The reader picked a language this page doesn't carry: fetch the rest once.
  useEffect(() => {
    if (options && !samples.some((s) => s.id === language) && options.some((o) => o.id === language)) loadSamples();
  }, [options, samples, language, loadSamples]);
  // The reader's language (generated or an `x-codeSamples` label like "TypeScript SDK"); else the first generated one.
  const sample = samples.find((s) => s.id === language) ?? samples.find((s) => !s.id.startsWith('x-')) ?? samples[0];
  const html = sample ? fillCredentials(sample.html, schemes, credentials, true) : '';
  const code = sample ? fillCredentials(sample.code, schemes, credentials, false) : '';

  return (
    <div className="od-card od-request-card">
      <div className="od-card-header">
        <span className="od-request-line">
          <span className={`od-method od-method-${method}`}>{method.toUpperCase()}</span>
          <span className="od-path">{path}</span>
        </span>
        <LanguageMenu
          options={options ?? samples.map((s) => ({ id: s.id, label: s.label }))}
          value={sample?.id ?? ''}
          onChange={setLanguage}
        />
      </div>
      <div className="od-code" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="od-card-footer">
        <CopyButton text={code} label="Copy" className="od-ghost-button" />
        {seed ? (
          <Button size="sm" className="od-test-button" onPress={() => setOpen(true)}>
            <Play size={12} fill="currentColor" />
            Test Request
          </Button>
        ) : null}
      </div>
      {seed ? <ClientModal open={open} onOpenChange={setOpen} seed={seed} requestId={requestId} defaults={clientDefaults} /> : null}
    </div>
  );
}
