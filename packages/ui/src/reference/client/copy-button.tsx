'use client';

import { LuCheck as Check, LuCopy as Copy } from 'react-icons/lu';
import { useState } from 'react';

export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className ?? 'od-icon-button'}
      aria-label={label ?? 'Copy'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {label ? <span>{done ? 'Copied' : label}</span> : null}
    </button>
  );
}
