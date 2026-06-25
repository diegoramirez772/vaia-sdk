#!/usr/bin/env node
/**
 * @vaia/sdk CLI
 *
 * Usage:
 *   npx vaia manifest              → generates gandia.manifest.json from vaia.config.js
 *   npx vaia manifest --validate   → validates an existing gandia.manifest.json
 *   npx vaia sign <payload.json>   → signs a payload with GANDIA_KEY_SECRET
 *   npx vaia version               → prints SDK version
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createInterface } from 'node:readline'
import { hmacSign } from './crypto.js'
import { toManifest, defineCapability } from './define.js'
import type { CapabilityConfig } from './types.js'

const pkg  = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
const args = process.argv.slice(2)
const cmd  = args[0]

async function main() {
  switch (cmd) {
    case 'manifest': return cmdManifest()
    case 'sign':     return cmdSign()
    case 'version':
    case '-v':
    case '--version':
      console.log(`@vaia/sdk v${pkg.version}`)
      break
    default:
      printHelp()
  }
}

// ─── manifest ────────────────────────────────────────────────────────────────

async function cmdManifest() {
  const cwd        = process.cwd()
  const configPath = resolve(cwd, 'vaia.config.js')
  const outPath    = join(cwd, 'gandia.manifest.json')
  const validate   = args.includes('--validate')

  if (validate) {
    if (!existsSync(outPath)) {
      console.error('✗ gandia.manifest.json no encontrado.')
      process.exit(1)
    }
    const raw = JSON.parse(readFileSync(outPath, 'utf8')) as Record<string, unknown>
    const required = ['schema', 'capability_id', 'name', 'version', 'target', 'type', 'sector', 'permissions', 'risk']
    const missing  = required.filter(k => !raw[k])
    if (missing.length > 0) {
      console.error(`✗ Campos requeridos faltantes: ${missing.join(', ')}`)
      process.exit(1)
    }
    console.log(`✓ gandia.manifest.json válido (${raw['capability_id']})`)
    return
  }

  if (!existsSync(configPath)) {
    console.error([
      '✗ vaia.config.js no encontrado en:', cwd,
      '',
      'Crea vaia.config.ts en la raíz de tu proyecto:',
      '',
      '  import { defineCapability } from \'@vaia/sdk\'',
      '  export default defineCapability({',
      '    id: \'mx.mi-capacidad\',',
      '    name: \'Mi Capacidad\',',
      '    version: \'1.0.0\',',
      '    target: \'gandia\',',
      '    type: \'app\',',
      '    sector: \'educacion\',',
      '    surfaces: { card: { endpoint: \'/api/gandia/invoke\' } },',
      '    permissions: [\'read:data\'],',
      '    risk: \'low\',',
      '  })',
      '',
      'Compila primero con tsc o tsx, luego corre: npx vaia manifest',
    ].join('\n'))
    process.exit(1)
  }

  let config: CapabilityConfig | undefined
  try {
    const mod = await import(configPath) as { default: CapabilityConfig }
    config = mod.default
    defineCapability(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`✗ Error al cargar vaia.config.js:\n  ${msg}`)
    process.exit(1)
  }

  if (!config) {
    console.error('✗ vaia.config.js no exportó ninguna configuración.')
    process.exit(1)
  }

  const manifest = toManifest(config)
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`✓ gandia.manifest.json generado → ${outPath}`)
  console.log(`  capability_id : ${manifest.capability_id}`)
  console.log(`  target        : ${Array.isArray(manifest.target) ? manifest.target.join(' + ') : manifest.target}`)
  console.log(`  surfaces      : ${manifest.surfaces.join(', ')}`)
  console.log(`  permissions   : ${manifest.permissions.join(', ')}`)
  console.log(`  risk          : ${manifest.risk}`)
}

// ─── sign ─────────────────────────────────────────────────────────────────────

async function cmdSign() {
  const payloadArg = args[1]
  const secret     = process.env['GANDIA_KEY_SECRET'] ?? process.env['HANDEIA_KEY_SECRET']

  if (!secret) {
    console.error('✗ GANDIA_KEY_SECRET o HANDEIA_KEY_SECRET requerido en el entorno.')
    process.exit(1)
  }

  let payload: string
  if (payloadArg && existsSync(payloadArg)) {
    payload = readFileSync(payloadArg, 'utf8').trim()
  } else if (payloadArg) {
    payload = payloadArg
  } else {
    // Read from stdin
    payload = await readStdin()
  }

  const timestamp = Date.now().toString()
  const signed    = `${timestamp}.${payload}`
  const sig       = await hmacSign(secret, signed)

  console.log(JSON.stringify({
    'X-Gandia-Signature': `sha256=${sig}`,
    'X-Gandia-Timestamp': timestamp,
    signed_payload:       signed,
  }, null, 2))
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function printHelp() {
  console.log([
    `@vaia/sdk v${pkg.version}`,
    '',
    'Comandos:',
    '  vaia manifest              Genera gandia.manifest.json desde vaia.config.js',
    '  vaia manifest --validate   Valida un gandia.manifest.json existente',
    '  vaia sign [payload]        Firma un payload con GANDIA_KEY_SECRET',
    '  vaia version               Muestra la versión del SDK',
    '',
    'Docs: https://github.com/diegoramirez772/vaia-sdk',
  ].join('\n'))
}

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    const rl     = createInterface({ input: process.stdin })
    const lines: string[] = []
    rl.on('line', (l: string) => lines.push(l))
    rl.on('close', () => resolve(lines.join('\n')))
  })
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
