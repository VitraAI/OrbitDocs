'use client';

import { LuCheck as Check, LuCopy as Copy, LuExternalLink as ExternalLink } from 'react-icons/lu';
import { useState } from 'react';

const btn = 'od-ghost-button';

/** Copy the page as Markdown, or open it in an AI chat with the page as context. */
export function PageActions({ markdownUrl, pageUrl, actions }: { markdownUrl: string; pageUrl: string; actions: string[] }) {
  const [copied, setCopied] = useState(false);
  const prompt = encodeURIComponent(`Read ${pageUrl} and help me with it.`);
  return (
    <div className="od-page-actions">
      {actions.includes('copy-markdown') ? (
        <button
          type="button"
          className={btn}
          onClick={async () => {
            const text = await fetch(markdownUrl).then((r) => r.text());
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy page'}
        </button>
      ) : null}
      {actions.includes('open-in-chatgpt') ? (
        <a className={btn} href={`https://chatgpt.com/?hints=search&q=${prompt}`} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Open in ChatGPT
        </a>
      ) : null}
      {actions.includes('open-in-claude') ? (
        <a className={btn} href={`https://claude.ai/new?q=${prompt}`} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Open in Claude
        </a>
      ) : null}
    </div>
  );
}
