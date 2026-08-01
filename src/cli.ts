/**
 * @vaia-lab/sdk CLI
 *
 * Usage:
 *   npx vaia manifest              → generates gandia.manifest.json from vaia.config.js
 *   npx vaia manifest --validate   → validates an existing gandia.manifest.json
 *   npx vaia sign <payload.json>   → signs a payload with GANDIA_KEY_SECRET
 *   npx vaia version               → prints SDK version
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import { hmacSign } from './crypto.js'
import { toManifest, defineCapability } from './define.js'
import type { CapabilityConfig } from './types.js'

const pkg  = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
const args = process.argv.slice(2)
const cmd  = args[0]

async function main() {
  switch (cmd) {
    case 'init':     return cmdInit()
    case 'doctor':   return cmdDoctor()
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


// ─── init ────────────────────────────────────────────────────────────────────

/**
 * `npx vaia init` — deja una capacidad declarada y lista en un archivo.
 *
 * Existe porque la primera experiencia decide si alguien se queda: si para ver
 * algo hay que registrarse, leer documentación y pedir credenciales, la gente
 * se va. Esto corre sin cuenta, sin claves y sin red — y lo que genera ya pasa
 * la validación de autoridad, así que el ejemplo enseña la regla en vez de
 * enseñar el atajo.
 */
async function cmdInit() {
  const cwd  = process.cwd()
  const out  = join(cwd, 'vaia.config.ts')

  if (existsSync(out)) {
    console.error('✗ Ya existe vaia.config.ts en esta carpeta.')
    process.exit(1)
  }

  const plantilla = `import { defineCapability } from '@vaia-lab/sdk'

/**
 * Tu capacidad, declarada.
 *
 * Esto es la única fuente de verdad: el portal la lee y arma el manifest solo.
 */
export default defineCapability({
  id: 'mx.mi-capacidad',
  name: 'Mi capacidad',
  version: '0.1.0',
  target: 'handeia',       // 'gandia' | 'handeia' | 'both'
  type: 'app',
  sector: 'general',
  description: 'Describe en una línea qué resuelve.',

  surfaces: {
    text: { endpoint: '/api/vaia/invoke' },
  },

  // ── Las piezas ────────────────────────────────────────────────────────────
  // La autoridad NO es opcional: hay que decir hasta dónde puede llegar cada
  // cosa. Lo irreversible nunca puede ser autónomo, y lo que gasta dinero
  // necesita tope y moneda. Si te lo saltas, esto no compila.
  pieces: {
    tools: [
      {
        name: 'consultar_datos',
        description: 'Lee datos del usuario para responder preguntas.',
        permission: 'read:datos',
        authority: {
          level: 'autonoma',          // 'autonoma' | 'requiere_aprobacion' | 'prohibida'
          consequence: 'reversible',  // 'reversible' | 'costosa' | 'irreversible'
          rationale: 'Solo lee. No cambia nada del usuario.',
        },
      },
    ],
  },

  // ── El agente dentro de tu app ────────────────────────────────────────────
  // El asistente de Handeia vive en tu superficie. Tú declaras qué sabes
  // hacer; él razona con eso más lo que sabe del usuario, que tú nunca ves.
  agent: {
    greeting: '¿En qué te ayudo?',
    actions: [
      {
        name: 'ir_a',
        description: 'Lleva al usuario a una sección de la app.',
        params: [
          { name: 'seccion', type: 'string', description: 'Sección destino.', required: true },
        ],
      },
    ],
    // Servicios que necesitas consultar. NUNCA recibes el token del usuario:
    // pides la operación y la plataforma te devuelve solo el resultado.
    needs: [],
  },

  permissions: ['read:datos'],
  risk: 'low',
})
`

  writeFileSync(out, plantilla, 'utf8')
  console.log('✓ vaia.config.ts creado')
  console.log('')
  console.log('  Siguiente:')
  console.log('    1. Edita el id, el nombre y lo que sabe hacer tu app.')
  console.log('    2. npx vaia manifest      → genera el manifest')
  console.log('    3. Súbelo desde el portal de developers.')
}


// ─── doctor ──────────────────────────────────────────────────────────────────

/**
 * `npx vaia doctor` — revisa tu configuración y te dice qué está mal.
 *
 * Existe porque los errores de autoridad no se ven leyendo: se ven cuando algo
 * ya pasó. Esto los saca antes, y en lenguaje de persona.
 */
async function cmdDoctor() {
  const cwd = process.cwd()
  const configPath = resolve(cwd, 'vaia.config.js')

  if (!existsSync(configPath)) {
    console.error('✗ No encontré vaia.config.js. Compila tu vaia.config.ts primero, o corre `vaia init`.')
    process.exit(1)
  }

  let config: CapabilityConfig
  try {
    const mod = await import(pathToFileURL(configPath).href)
    config = (mod.default ?? mod.config) as CapabilityConfig
  } catch (err) {
    console.error(`✗ No pude cargar vaia.config.js:\n  ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const avisos: string[] = []
  const graves: string[] = []

  // defineCapability ya rechaza lo inválido. Esto busca lo que es LEGAL pero
  // probablemente no es lo que el desarrollador quiso.
  for (const t of config.pieces?.tools ?? []) {
    if (t.authority.level === 'autonoma' && t.authority.consequence === 'costosa' && !t.authority.rationale) {
      avisos.push(`"${t.name}" gasta dinero sola y no explica por qué se le dio esa confianza.`)
    }
    if (t.permission && !config.permissions.includes(t.permission)) {
      graves.push(`"${t.name}" pide el permiso "${t.permission}", que no está en la lista de permisos de la capacidad.`)
    }
  }

  const usados = new Set((config.pieces?.tools ?? []).map(t => t.permission))
  for (const p of config.permissions) {
    if (!usados.has(p)) avisos.push(`El permiso "${p}" se pide pero ninguna herramienta lo usa. Pedir de más incomoda al usuario.`)
  }

  for (const a of config.agent?.actions ?? []) {
    if (a.writes && !a.permission) {
      graves.push(`La acción "${a.name}" modifica datos y no declara permiso.`)
    }
  }

  if (graves.length === 0 && avisos.length === 0) {
    console.log('✓ Todo en orden.')
    return
  }
  for (const g of graves) console.error(`✗ ${g}`)
  for (const a of avisos) console.log(`⚠ ${a}`)
  if (graves.length > 0) process.exit(1)
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
    '  vaia-sdk init                  Crea vaia.config.ts listo para editar',
    '  vaia-sdk doctor                Revisa tu configuración y avisa qué está mal',
    '  vaia-sdk manifest              Genera gandia.manifest.json desde vaia.config.js',
    '  vaia-sdk manifest --validate   Valida un gandia.manifest.json existente',
    '  vaia-sdk sign [payload]        Firma un payload con GANDIA_KEY_SECRET',
    '  vaia-sdk version               Muestra la versión del SDK',
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
