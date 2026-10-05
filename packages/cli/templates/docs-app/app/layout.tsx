import { OrbitRoot, siteIcons } from '@vitra-ai/orbitdocs-next';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { orbit } from '@/lib/orbit';
import { overrides } from '@/lib/overrides';

import './global.css';

export const metadata: Metadata = {
  title: { default: orbit.site.title, template: `%s · ${orbit.site.title}` },
  description: orbit.site.description,
  // Favicons from public/ (replace them with your own): site.favicon or icon.png, and apple-icon.png.
  icons: siteIcons(orbit),
  ...(orbit.site.url ? { metadataBase: new URL(orbit.site.url) } : {}),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir={orbit.site.dir} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <OrbitRoot config={orbit} overrides={overrides}>
          {children}
        </OrbitRoot>
      </body>
    </html>
  );
}
