import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/edge.ts', 'src/express.ts'],
  format: ['esm', 'cjs'],
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  target: 'node22',
  shims: true,
  external: ['react', /^react-icons/],
});
