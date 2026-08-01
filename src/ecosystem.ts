/**
 * Ecosistemas — que las piezas sueltas dejen de ser islas.
 *
 * Un ecosistema es un conjunto de capacidades que comparten identidad,
 * contrato y reglas, aunque vivan en productos distintos, en máquinas
 * distintas, o las haya escrito gente distinta.
 *
 * Tus tres proyectos viejos, un modelo local, dos servidores MCP que bajaste
 * de internet y un repo que te gustó: eso es un ecosistema en cuanto algo los
 * gobierna igual. Sin gobierno, "conectar todo" solo hace el desastre más
 * grande.
 *
 * ── El bucle del agente ──────────────────────────────────────────────────
 * También vive aquí, y corre con EL MODELO QUE PONGA EL DESARROLLADOR. El SDK
 * no trae ninguno: recibe una función que habla y devuelve texto. Ollama en su
 * máquina, Claude, o lo que salga el año que viene.
 */

import type { Authority, ToolDef } from './pieces.js'
import type { Capability, CapabilityCall, CapabilityResult } from './capabilities.js'

// ─── Declarar un ecosistema ──────────────────────────────────────────────────

export interface EcosystemConfig {
  name: string
  /** Las capacidades que lo componen, ya construidas. */
  capabilities: Capability[]
  /**
   * Reglas por patrón, aplicadas SOBRE lo que cada capacidad declare.
   *
   * Se admite `*` al final: `'delete_*'`. Sirve para poner una regla de casa
   * —"nada que borre corre solo"— sin revisar herramienta por herramienta
   * cuando conectas un servidor con treinta.
   */
  authority?: Record<string, Authority> | undefined
}

export interface Ecosystem {
  readonly name: string
  /** Todas las herramientas, con su capacidad de origen. */
  readonly tools: (ToolDef & { capability: string })[]
  /** Ejecuta buscando en qué capacidad vive esa herramienta. */
  run(call: CapabilityCall): Promise<CapabilityResult>
  /** Quita una capacidad en caliente. */
  remove(capabilityId: string): Promise<void>
  /** Agrega una capacidad en caliente. */
  add(capability: Capability): void
  dispose(): Promise<void>
}

/** ¿Coincide el nombre con el patrón? Solo comodín al final, a propósito:
 *  patrones complicados esconden errores de permisos. */
function coincide(patron: string, nombre: string): boolean {
  if (patron === '*') return true
  if (patron.endsWith('*')) return nombre.startsWith(patron.slice(0, -1))
  return patron === nombre
}

/**
 * Aplica las reglas de casa. Gana la MÁS restrictiva.
 *
 * Nunca se sube la autoridad de una herramienta por una regla del ecosistema:
 * si la capacidad dijo "esto requiere aprobación", el ecosistema no puede
 * volverla autónoma. Al revés sí. Las reglas de casa aprietan, nunca aflojan.
 */
const ORDEN = { prohibida: 0, requiere_aprobacion: 1, autonoma: 2 } as const

function aplicarReglas(
  tool: ToolDef,
  reglas: Record<string, Authority> | undefined,
): ToolDef {
  if (!reglas) return tool
  let resultado = tool.authority
  for (const [patron, regla] of Object.entries(reglas)) {
    if (!coincide(patron, tool.name)) continue
    if (ORDEN[regla.level] < ORDEN[resultado.level]) resultado = regla
    // Un tope más bajo también aprieta.
    else if (
      regla.maxAmount !== undefined &&
      (resultado.maxAmount === undefined || regla.maxAmount < resultado.maxAmount)
    ) {
      resultado = { ...resultado, maxAmount: regla.maxAmount, currency: regla.currency ?? resultado.currency }
    }
  }
  return { ...tool, authority: resultado }
}

export function defineEcosystem(cfg: EcosystemConfig): Ecosystem {
  const caps = new Map(cfg.capabilities.map(c => [c.id, c]))

  const recopilar = () =>
    [...caps.values()].flatMap(c =>
      c.tools.map(t => ({ ...aplicarReglas(t, cfg.authority), capability: c.id })),
    )

  let tools = recopilar()

  return {
    name: cfg.name,
    get tools() { return tools },

    async run(call) {
      const dueño = [...caps.values()].find(c => c.tools.some(t => t.name === call.name))
      if (!dueño) {
        return { ok: false, error: `Ninguna capacidad de "${cfg.name}" declara "${call.name}".` }
      }

      // Las reglas de casa se comprueban ANTES de delegar: si el ecosistema
      // apretó la autoridad, la capacidad no debe poder ignorarlo.
      const conReglas = tools.find(t => t.name === call.name)
      if (conReglas && conReglas.authority.level === 'prohibida') {
        return { ok: false, error: `"${call.name}" está prohibida por las reglas de ${cfg.name}.` }
      }
      if (conReglas && conReglas.authority.level !== 'autonoma' && !call.approved) {
        return { ok: false, needsApproval: true, error: 'Requiere aprobación humana antes de ejecutarse.' }
      }

      return dueño.run(call)
    },

    add(capability) {
      caps.set(capability.id, capability)
      tools = recopilar()
    },

    async remove(capabilityId) {
      const c = caps.get(capabilityId)
      if (!c) return
      await c.dispose?.()
      caps.delete(capabilityId)
      tools = recopilar()
    },

    async dispose() {
      for (const c of caps.values()) await c.dispose?.()
      caps.clear()
      tools = []
    },
  }
}

// ─── El bucle del agente ─────────────────────────────────────────────────────

/**
 * Función de modelo. La pone el desarrollador.
 *
 * Recibe el mensaje del usuario y las herramientas disponibles; devuelve texto
 * o una acción a ejecutar. El SDK no sabe ni le importa qué hay detrás.
 */
export type ModelFn = (input: {
  message: string
  tools: { name: string; description: string }[]
  history: { role: 'user' | 'agent'; text: string }[]
  lastResult?: CapabilityResult | undefined
}) => Promise<{ text?: string; action?: { name: string; args?: Record<string, unknown> } }>

export interface AgentLoopOptions {
  ecosystem: Ecosystem
  model: ModelFn
  /**
   * Cómo se pide el visto bueno humano. Si no se define, lo que requiera
   * aprobación simplemente no se ejecuta — que es el comportamiento seguro.
   */
  onApproval?: ((tool: string, args: Record<string, unknown>) => Promise<boolean>) | undefined
  /** Tope de vueltas. Un agente sin tope es una factura sin tope. */
  maxSteps?: number | undefined
}

export interface AgentTurn {
  text?: string | undefined
  steps: { action: string; ok: boolean; error?: string | undefined }[]
}

/**
 * Corre un turno completo: el modelo decide, la autoridad revisa, la capacidad
 * ejecuta, y el resultado vuelve al modelo para que cierre.
 *
 * Con esto alguien se arma un agente entero sin tocar ninguna plataforma.
 */
export async function agentLoop(opts: AgentLoopOptions) {
  const maxSteps = opts.maxSteps ?? 6

  return async function turno(
    message: string,
    history: { role: 'user' | 'agent'; text: string }[] = [],
  ): Promise<AgentTurn> {
    const steps: AgentTurn['steps'] = []
    let lastResult: CapabilityResult | undefined

    for (let i = 0; i < maxSteps; i++) {
      const salida = await opts.model({
        message,
        tools: opts.ecosystem.tools.map(t => ({ name: t.name, description: t.description })),
        history,
        lastResult,
      })

      if (!salida.action) return { text: salida.text, steps }

      let resultado = await opts.ecosystem.run(salida.action)

      // Si hacía falta un humano, se le pregunta de verdad — y solo entonces
      // se reintenta. Sin manejador, no se ejecuta: es lo seguro.
      if (resultado.needsApproval && opts.onApproval) {
        const aprobado = await opts.onApproval(salida.action.name, salida.action.args ?? {})
        if (aprobado) {
          resultado = await ejecutarAprobado(opts.ecosystem, salida.action)
        } else {
          resultado = { ok: false, error: 'El usuario no lo autorizó.' }
        }
      }

      steps.push({ action: salida.action.name, ok: resultado.ok, error: resultado.error })
      lastResult = resultado
    }

    // Se agotaron las vueltas. Se dice, no se finge que terminó.
    return { text: 'No pude completarlo en los pasos disponibles.', steps }
  }
}

/**
 * Ejecuta algo que un humano acaba de aprobar.
 *
 * La aprobación levanta la barrera SOLO para esta llamada concreta. No cambia
 * la declaración: la próxima vez se vuelve a preguntar. Un "sí" no es un
 * cheque en blanco.
 */
async function ejecutarAprobado(
  eco: Ecosystem,
  action: { name: string; args?: Record<string, unknown> },
): Promise<CapabilityResult> {
  const t = eco.tools.find(x => x.name === action.name)
  if (!t) return { ok: false, error: 'La herramienta ya no existe.' }
  if (t.authority.level === 'prohibida') {
    // Lo prohibido no se desbloquea ni con permiso humano: para eso está
    // declarado como prohibido y no como "requiere aprobación".
    return { ok: false, error: 'Prohibida: ni con aprobación se ejecuta.' }
  }
  return eco.run({ ...action, approved: true })
}
