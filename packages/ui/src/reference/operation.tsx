import type { OperationModel, ReferenceModel } from '@orbitdocs/openapi';

import { OperationSlot } from './client/index';
import type { ExtraContent } from './sections';
import { operationData, operationHead } from './server/sections';

export type { ExtraContent } from './sections';

/**
 * One operation, fully rendered. The markup comes from `OperationSlot`, the
 * component that also renders lazily loaded operations, from the same data.
 */
export async function OperationSection({
  op,
  model,
  serverUrl,
  extras,
  lazySamples = false,
  href,
}: {
  op: OperationModel;
  model: ReferenceModel;
  serverUrl: string;
  /** Ship only the default sample; the rest load when the reader picks another language. */
  lazySamples?: boolean;
  /** From `reference/<api>/<operation>.mdx` files. */
  extras?: ExtraContent[];
  /** The operation's own URL. */
  href?: string;
}) {
  const data = await operationData(op, model, serverUrl, { lazySamples });
  return <OperationSlot head={operationHead(op, model)} file={op.group ?? ''} href={href ?? `#${op.slug}`} data={data} extras={extras} />;
}
