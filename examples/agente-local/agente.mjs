/**
 * Agente completo con modelo LOCAL. Cero cuentas, cero llaves, cero nube.
 *
 * El punto de este ejemplo no es que el agente funcione: es que se DETENGA.
 * Fíjate en la última prueba — el modelo pide borrar y no pasa nada, porque
 * la configuración lo prohíbe. No porque el modelo se portara bien.
 */
import { capabilities, defineEcosystem, agentLoop } from '@vaia-lab/sdk'

const LIBRE   = { level: 'autonoma', consequence: 'reversible' }
const PROHIBIDA = { level: 'prohibida', consequence: 'irreversible' }

// ── 1. Una capacidad tuya ────────────────────────────────────────────────────
const misDatos = capabilities.local({
  id: 'mis_datos',
  tools: [
    { name: 'contar_pedidos', description: 'Cuenta los pedidos de hoy.',
      permission: 'read:pedidos', authority: LIBRE },
    { name: 'borrar_pedidos', description: 'Borra todos los pedidos.',
      permission: 'write:pedidos', authority: PROHIBIDA },
  ],
  handler: (nombre) => {
    if (nombre === 'contar_pedidos') return { pedidos: 42 }
    // Nunca llega aquí: la autoridad lo detiene antes.
    throw new Error('esto jamás debería ejecutarse')
  },
})

// ── 2. El ecosistema, con una regla de casa ─────────────────────────────────
const eco = defineEcosystem({
  name: 'mi_negocio',
  capabilities: [misDatos],
  // Aunque alguien declare mal una herramienta, esto aprieta encima.
  authority: { 'borrar_*': PROHIBIDA },
})

// ── 3. Tu modelo. Ollama, en tu máquina ─────────────────────────────────────
const ollama = async ({ message, tools, lastResult }) => {
  const prompt = [
    'Eres un asistente. Herramientas disponibles:',
    ...tools.map(t => `- ${t.name}: ${t.description}`),
    lastResult ? `Resultado previo: ${JSON.stringify(lastResult)}` : '',
    `Usuario: ${message}`,
    'Responde SOLO con JSON: {"action":{"name":"...","args":{}}} o {"text":"..."}',
  ].filter(Boolean).join('\n')

  const r = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model: 'llama3.2', prompt, stream: false, format: 'json' }),
  })
  const { response } = await r.json()
  try { return JSON.parse(response) } catch { return { text: response } }
}

const turno = await agentLoop({ ecosystem: eco, model: ollama, maxSteps: 4 })

// ── 4. Pruébalo ──────────────────────────────────────────────────────────────
console.log('\n▸ Pregunta normal')
console.log(await turno('¿cuántos pedidos hay hoy?'))

console.log('\n▸ Pidiendo algo prohibido')
const r = await turno('borra todos los pedidos')
console.log(r)
console.log(
  r.steps.every(s => !s.ok)
    ? '\n✓ Bloqueado. No porque el modelo se portara bien: porque no se puede.'
    : '\n✗ Algo salió mal.',
)
