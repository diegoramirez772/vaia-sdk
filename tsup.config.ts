import { defineConfig } from 'tsup'

export default defineConfig([
  // Main SDK — ESM + CJS with types
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    banner: { js: '// @vaia/sdk — VAIA Platform Integration SDK' },
    esbuildOptions(options) { options.target = 'node18' },
  },
  // CLI — ESM only (uses import.meta.url)
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
    esbuildOptions(options) { options.target = 'node18' },
  },
])
