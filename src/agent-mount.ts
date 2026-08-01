/**
 * El círculo del agente de Handeia, para montar dentro de un espacio.
 *
 * Montaje NEUTRAL a propósito: no depende de React ni de ningún framework. El
 * SDK presume de cero dependencias y atarlo a React lo traicionaría — un
 * espacio hecho en Vue, Svelte o HTML puro tiene el mismo derecho al agente.
 * Encima de esto, un envoltorio de React son tres líneas.
 *
 * Lo que el desarrollador pone:
 *   - de dónde sacar el contexto (qué está viendo el usuario)
 *   - qué acciones sabe ejecutar
 * Lo que pone el SDK: el círculo, el campo, el transporte y la identidad.
 *
 * El aspecto lo controla el SDK a propósito: así el agente se ve y se comporta
 * igual en todos los espacios, que es parte de que se sienta Handeia y no un
 * chat pegado a una app.
 */

import {
  AGENT_PROTOCOL_VERSION,
  type AgentAction,
  type AgentActionResult,
  type AgentSpaceContext,
  type AgentTurnResponse,
} from './agent.js'

export interface MountAgentOptions {
  /** capability_id del espacio, el mismo del manifest. */
  capabilityId: string
  /**
   * Dónde vive Handeia. Un solo endpoint, y el SDK no sabe qué hay detrás:
   * así Handeia puede reordenar sus capas sin publicar una versión nueva.
   */
  handeiaUrl?: string | undefined
  /** Qué está viendo el usuario AHORA. Se pregunta en cada turno, no se cachea. */
  getContext?: (() => AgentSpaceContext | Promise<AgentSpaceContext>) | undefined
  /** Las mismas acciones que el manifest declara. */
  actions?: AgentAction[] | undefined
  /** Ejecuta una acción. Solo se llama con acciones declaradas y ya validadas. */
  onAction?: ((name: string, args: Record<string, unknown>) => Promise<AgentActionResult> | AgentActionResult) | undefined
  /** Dónde montar. Por defecto, el body. */
  container?: HTMLElement | undefined
  /** Saludo propio del espacio. */
  greeting?: string | undefined
}

export interface AgentHandle {
  open(): void
  close(): void
  destroy(): void
}

const HANDEIA_POR_DEFECTO = 'https://handeia.com'
const RUTA_TURNO = '/api/agent/space'

/** Todo el CSS va con nombres propios para no chocar con los del espacio. */
const CSS = `
.hdi-agent-root{position:fixed;z-index:2147483000;bottom:20px;right:20px;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.hdi-agent-orb{width:44px;height:44px;border-radius:9999px;border:0;cursor:pointer;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px -6px rgba(0,0,0,.4);transition:transform .15s}
.hdi-agent-orb:hover{transform:scale(1.05)}
.hdi-agent-orb:active{transform:scale(.95)}
.hdi-agent-panel{position:absolute;bottom:56px;right:0;width:min(360px,calc(100vw - 40px));background:#fff;color:#111;border:1px solid rgba(0,0,0,.09);border-radius:18px;box-shadow:0 24px 60px -18px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;max-height:min(60vh,460px)}
.hdi-agent-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-size:12.5px;font-weight:600}
.hdi-agent-dot{width:7px;height:7px;border-radius:9999px;background:#8b5cf6}
.hdi-agent-log{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.55}
.hdi-agent-turn{white-space:pre-wrap}
.hdi-agent-q{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,0,0,.34)}
.hdi-agent-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(0,0,0,.06)}
.hdi-agent-input{flex:1;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;outline:none}
.hdi-agent-input:focus{border-color:rgba(0,0,0,.34)}
.hdi-agent-send{border:0;border-radius:10px;padding:0 12px;background:#000;color:#fff;cursor:pointer;font-size:12.5px}
.hdi-agent-confirm{display:flex;gap:8px;margin-top:4px}
.hdi-agent-btn{border:1px solid rgba(0,0,0,.14);background:#fff;border-radius:9999px;padding:5px 12px;font-size:12px;cursor:pointer}
.hdi-agent-btn-primary{background:#000;color:#fff;border-color:#000}
@media (prefers-color-scheme:dark){
.hdi-agent-orb{background:#fff;color:#000}
.hdi-agent-panel{background:#171717;color:#f5f5f5;border-color:rgba(255,255,255,.13)}
.hdi-agent-head,.hdi-agent-form{border-color:rgba(255,255,255,.1)}
.hdi-agent-q{color:rgba(255,255,255,.5)}
.hdi-agent-input{background:transparent;color:inherit;border-color:rgba(255,255,255,.16)}
.hdi-agent-send{background:#fff;color:#000}
.hdi-agent-btn{background:transparent;color:inherit;border-color:rgba(255,255,255,.18)}
.hdi-agent-btn-primary{background:#fff;color:#000}
}`

/** Se escribe con textContent, nunca con innerHTML: lo que devuelve el agente
 *  y lo que teclea el usuario son texto, y así no hay forma de inyectar HTML
 *  en la página del espacio. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

/**
 * Monta el agente. Devuelve un manejador para abrirlo, cerrarlo o quitarlo.
 *
 * Es idempotente por espacio: montarlo dos veces no deja dos círculos.
 */
export function mountAgent(opts: MountAgentOptions): AgentHandle {
  if (typeof document === 'undefined') {
    throw new Error('[@vaia-lab/sdk] mountAgent solo corre en el navegador.')
  }

  const base = (opts.handeiaUrl ?? HANDEIA_POR_DEFECTO).replace(/\/$/, '')
  const contenedor = opts.container ?? document.body

  // Un solo agente por espacio, aunque el desarrollador llame dos veces.
  const previo = contenedor.querySelector<HTMLElement>('.hdi-agent-root')
  if (previo) previo.remove()

  if (!document.getElementById('hdi-agent-css')) {
    const estilo = el('style')
    estilo.id = 'hdi-agent-css'
    estilo.textContent = CSS
    document.head.appendChild(estilo)
  }

  const raiz = el('div', 'hdi-agent-root')
  const orbe = el('button', 'hdi-agent-orb')
  orbe.type = 'button'
  orbe.setAttribute('aria-label', 'Abrir asistente de Handeia')
  orbe.textContent = '✦'

  const panel = el('div', 'hdi-agent-panel')
  panel.hidden = true
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Asistente de Handeia')

  const cabeza = el('div', 'hdi-agent-head')
  cabeza.appendChild(el('span', 'hdi-agent-dot'))
  cabeza.appendChild(el('span', undefined, 'Handeia'))

  const registro = el('div', 'hdi-agent-log')
  if (opts.greeting) registro.appendChild(el('div', 'hdi-agent-turn', opts.greeting))

  const forma = el('form', 'hdi-agent-form')
  const entrada = el('input', 'hdi-agent-input')
  entrada.type = 'text'
  entrada.placeholder = 'Pregúntale a Handeia…'
  entrada.autocomplete = 'off'
  const enviar = el('button', 'hdi-agent-send', 'Enviar')
  enviar.type = 'submit'
  forma.append(entrada, enviar)
  panel.append(cabeza, registro, forma)
  raiz.append(panel, orbe)
  contenedor.appendChild(raiz)

  const historial: { role: 'user' | 'agent'; text: string }[] = []

  const decir = (texto: string, clase = 'hdi-agent-turn') => {
    const n = el('div', clase, texto)
    registro.appendChild(n)
    registro.scrollTop = registro.scrollHeight
    return n
  }

  /** Un turno contra Handeia. `actionResult` cierra el ciclo de una acción. */
  async function turno(mensaje: string, actionResult?: AgentActionResult): Promise<void> {
    let context: AgentSpaceContext | undefined
    try {
      context = await opts.getContext?.()
    } catch {
      // Que el espacio falle armando su contexto no debe tumbar el agente:
      // simplemente responde sin él.
      context = undefined
    }

    let res: Response
    try {
      res = await fetch(`${base}${RUTA_TURNO}`, {
        method: 'POST',
        // La identidad va en la cookie de sesión de Handeia. El espacio nunca
        // toca ni ve el token del usuario.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          protocol: AGENT_PROTOCOL_VERSION,
          capId: opts.capabilityId,
          message: mensaje,
          context,
          actions: opts.actions ?? [],
          history: historial.slice(-12),
          actionResult,
        }),
      })
    } catch {
      decir('No pude comunicarme con Handeia. Revisa tu conexión.')
      return
    }

    let data: AgentTurnResponse & { ok?: boolean; error?: string }
    try {
      data = await res.json()
    } catch {
      decir('Handeia respondió algo que no pude leer.')
      return
    }

    if (!res.ok || data.ok === false) {
      decir(
        data.error === 'no_autenticado'
          ? 'Inicia sesión en Handeia para usar el asistente.'
          : data.error === 'espacio_no_instalado'
            ? 'Este espacio no está instalado en tu Handeia.'
            : 'Handeia no pudo responder ahora mismo.',
      )
      return
    }

    if (data.text) {
      decir(data.text)
      historial.push({ role: 'agent', text: data.text })
    }

    if (!data.action) return

    // Handeia ya validó la acción contra lo declarado; si aun así el espacio no
    // registró un ejecutor, no se finge que pasó algo.
    if (!opts.onAction) {
      decir('Esto requiere una acción que este espacio todavía no sabe ejecutar.')
      return
    }

    const ejecutar = async () => {
      let resultado: AgentActionResult
      try {
        resultado = await opts.onAction!(data.action!.name, data.action!.args ?? {})
      } catch (e) {
        resultado = { action: data.action!.name, ok: false, error: e instanceof Error ? e.message : 'falló' }
      }
      await turno(mensaje, resultado)
    }

    // Lo que modifica datos se confirma. Un agente que escribe sin preguntar se
    // siente fuera de control incluso cuando acierta.
    if (data.confirm) {
      const fila = el('div', 'hdi-agent-confirm')
      const si = el('button', 'hdi-agent-btn hdi-agent-btn-primary', 'Hacerlo')
      const no = el('button', 'hdi-agent-btn', 'Cancelar')
      si.type = 'button'; no.type = 'button'
      si.onclick = () => { fila.remove(); void ejecutar() }
      no.onclick = () => { fila.remove(); decir('Cancelado.') }
      fila.append(si, no)
      registro.appendChild(fila)
      registro.scrollTop = registro.scrollHeight
      return
    }

    await ejecutar()
  }

  forma.onsubmit = async e => {
    e.preventDefault()
    const texto = entrada.value.trim()
    if (!texto) return
    entrada.value = ''
    decir(texto, 'hdi-agent-q')
    historial.push({ role: 'user', text: texto })
    enviar.disabled = true
    try { await turno(texto) } finally { enviar.disabled = false; entrada.focus() }
  }

  const abrir = () => { panel.hidden = false; entrada.focus() }
  const cerrar = () => { panel.hidden = true }
  orbe.onclick = () => (panel.hidden ? abrir() : cerrar())

  const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
  document.addEventListener('keydown', alTeclear)

  return {
    open: abrir,
    close: cerrar,
    destroy: () => {
      document.removeEventListener('keydown', alTeclear)
      raiz.remove()
    },
  }
}
