import type { OrbitDocsConfig } from '@orbitdocs/core';
import { ApiClient } from '@orbitdocs/ui/api-client';
import { clientSeed } from '@orbitdocs/ui/api-client/server';
import { notFound } from 'next/navigation';

import { loadApis } from './apis';
import { accessAt, accessManifest, modelFor, variantOptions } from './variants';

/**
 * The standalone API client (`/client`): every API's collection in one
 * workspace, with only the operations its reader may open. `/client/` holds
 * what every reader of it may see; with private docs, readers who may see
 * more get a variant (`/client/<variant>/`, picked by the access gate).
 */
export async function ClientPage({ config, variant }: { config: OrbitDocsConfig; variant?: string }) {
  const manifest = accessManifest();
  if (variant && !variantOptions(manifest, 'client').some((o) => o.key === variant)) notFound();
  const viewer = manifest ? accessAt(manifest, variant ? `/client/${variant}` : '/client') : null;
  const apis = await loadApis(config);
  const models = apis.map((a) => ({ full: a.model, shown: modelFor(manifest, a.model, a.route, viewer) }));
  // An API none of whose operations this reader may open is left out entirely.
  const seeds = models.filter((m) => m.shown.operations.length || !m.full.operations.length).map((m) => clientSeed(m.shown));
  return (
    <div className="oc-page">
      <ApiClient seeds={seeds} storageKey="orbitdocs:client" defaults={config.client} />
    </div>
  );
}

