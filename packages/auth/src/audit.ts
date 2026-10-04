import { appendFile } from 'node:fs/promises';

import type { AccessManifest } from './manifest';

export interface AuditEvent {
  type: 'sign_in' | 'sign_in_failed' | 'sign_out' | 'denied';
  at: string;
  email?: string;
  provider?: string;
  path?: string;
  ip?: string;
  reason?: string;
}

/** Writes an audit event as a JSON line to a file and/or POSTs it to a webhook. Never throws. */
export async function audit(manifest: AccessManifest, event: Omit<AuditEvent, 'at'>, fetcher: typeof fetch = fetch): Promise<void> {
  const cfg = manifest.audit;
  if (!cfg) return;
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  await Promise.allSettled([
    cfg.file ? appendFile(cfg.file, `${line}\n`) : Promise.resolve(),
    cfg.webhookUrl
      ? fetcher(cfg.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: line, signal: AbortSignal.timeout(3000) })
      : Promise.resolve(),
  ]);
}
