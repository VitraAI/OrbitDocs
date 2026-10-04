'use client';

import { RootProvider, type RootProviderProps } from 'fumadocs-ui/provider/next';

/**
 * next-themes sets the light or dark class before the page paints with an inline
 * <script>. In the server HTML it must run, so it keeps its type. On the client
 * React 19 warns about rendering a <script> ("Scripts inside React components
 * are never executed"), so there it renders as inert JSON. The tag carries
 * suppressHydrationWarning, so the differing type doesn't count as a mismatch.
 */
const themeScript = typeof window === 'undefined' ? undefined : { type: 'application/json' };

/** Fumadocs' RootProvider without React's theme-script warning. */
export function OrbitRootProvider({ theme, ...props }: RootProviderProps) {
  return <RootProvider {...props} theme={{ scriptProps: themeScript, ...theme }} />;
}
