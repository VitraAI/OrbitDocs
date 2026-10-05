import { orbitLayoutOptions, ReferencePage, referenceMetadata, referenceStaticParams } from '@vitra-ai/orbitdocs-next';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';
import { referenceContent } from '@/lib/source';

type Props = { params: Promise<{ api: string; slug?: string[] }> };

export default async function Page({ params }: Props) {
  const p = await params;
  return (
    // readerOf: with private docs, the top bar lists only the APIs this page's readers may open.
    <HomeLayout {...orbitLayoutOptions(orbit, { readerOf: `/reference/${p.api}`, overrides })}>
      <ReferencePage config={orbit} params={p} content={referenceContent} />
    </HomeLayout>
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return referenceStaticParams(orbit);
}

export async function generateMetadata({ params }: Props) {
  return referenceMetadata(orbit, await params);
}
