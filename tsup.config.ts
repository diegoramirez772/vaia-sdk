import { defineConfig } from 'tsup'

export default defineConfig([
  // Main SDK — ESM + CJS with types
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    // Sin sourcemaps: incrustan los 17 archivos fuente completos en el paquete
    // publicado, con todo y comentarios que describen la arquitectura interna.
    // El código se lee en el repo, que para eso es abierto.
    sourcemap: false,
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
