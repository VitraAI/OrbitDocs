import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest needs decorator metadata, which only SWC/tsc emit (not esbuild/oxc).
export default defineConfig({ plugins: [swc.vite({ module: { type: 'es6' } })], oxc: false });
