import type { NextConfig } from 'next';

/** The dashboard is static files served by the platform server (same origin as /api). */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default config;
