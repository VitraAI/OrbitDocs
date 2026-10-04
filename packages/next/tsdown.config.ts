import { defineConfig } from 'tsdown';

// One output file per source file (unbundled): each client component keeps its
// own 'use client' directive, and import paths get their extensions here.
export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.spec.ts', '!src/**/*.spec.tsx'],
  unbundle: true,
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'neutral',
  target: 'es2022',
  sourcemap: false,
  inputOptions: {
    // Unbundled output keeps every file's own directive, so this warning does not apply.
    onLog(level, log, handler) {
      if (log.code === 'MODULE_LEVEL_DIRECTIVE') return;
      handler(level, log);
    },
  },
});
