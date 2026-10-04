import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = { title: { default: 'OrbitDocs', template: '%s · OrbitDocs' }, description: 'Your API docs platform', icons: { icon: '/icon.png', apple: '/apple-icon.png' } };

/** Applies the saved or system theme before paint. */
const THEME = `try{var t=localStorage.getItem('od-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.add(t);document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
