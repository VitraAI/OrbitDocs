'use client';

import { Modal } from '@heroui/react';
import { useMemo } from 'react';

import { ApiClient } from '../../api-client/api-client';
import type { ClientDefaults } from '../../api-client/settings';
import type { ClientSeed } from '../../api-client/seed';
import { useReference } from './store';

/**
 * The full API client in a modal, opened on one operation (Scalar's
 * "Test Request"). Credentials and server chosen on the page carry over.
 */
export function ClientModal({
  open,
  onOpenChange,
  seed,
  requestId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed: ClientSeed;
  requestId: string;
  defaults?: ClientDefaults;
}) {
  const { schemes, credentials, server } = useReference();
  const seeds = useMemo(() => [seed], [seed]);
  const secrets = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of schemes) {
      const v = credentials[s.name];
      if (!v) continue;
      if (s.type === 'apiKey') out.apiKey = v;
      else if (s.type === 'http' && s.scheme?.toLowerCase() === 'basic') {
        const [username = '', password = ''] = v.split(':');
        out.username = username;
        out.password = password;
      } else out.token = v;
    }
    return out;
  }, [schemes, credentials]);
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} variant="blur">
        <Modal.Container size="cover" scroll="inside" className="oc-modal-container">
          <Modal.Dialog className="oc-modal" aria-label="API client">
            <Modal.CloseTrigger className="oc-modal-close" />
            {open ? (
              <ApiClient
                seeds={seeds}
                storageKey="orbitdocs:client"
                initialRequestId={requestId}
                initialSecrets={secrets}
                preferredServer={server}
                defaults={defaults}
              />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
