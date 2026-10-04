import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    clean: true,
    target: 'node22',
    shims: true,
    external: [/^@nestjs\//, 'reflect-metadata', 'express'],
  },
  {
    // Spawned by the CLI inside the user's Nest project: CommonJS, so it can require() their compiled app.
    entry: ['src/extract-cli.ts'],
    format: ['cjs'],
    target: 'node22',
    shims: true,
    external: [/^@nestjs\//, 'reflect-metadata'],
  },
]);
