import { ClientPage, orbitLayoutOptions } from '@orbitdocs/next';
import { clientStaticParams } from '@orbitdocs/next/server';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';

export const metadata = { title: 'API Client' };

type Props = { params: Promise<{ variant?: string[] }> };

/**
 * The API client. With private docs, /client/ holds the operations every
 * reader may open; readers who may open more get /client/<variant>/ in its
 * place (served by the access gate, same URL).
 */
export default async function Page({ params }: Props) {
  const { variant } = await params;
  return (
    <HomeLayout {...orbitLayoutOptions(orbit, { readerOf: variant ? `/client/${variant[0]}` : '/client', overrides })}>
      <ClientPage config={orbit} variant={variant?.[0]} />
    </HomeLayout>
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return clientStaticParams();
}
