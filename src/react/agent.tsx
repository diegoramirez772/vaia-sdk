'use client';

/**
 * El agente de Handeia dentro de un espacio — con EL MISMO círculo y EL MISMO
 * campo que dentro de Handeia, no una imitación.
 *
 * Se copió la mecánica tal cual del original (EspacioAgentLayer): el círculo
 * se arrastra, se acota a lo que de verdad se ve, y al soltarlo sin moverlo se
 * abre el campo hacia el lado donde hay espacio. Reescribirlo "parecido" habría
 * hecho que se desviara en cuanto alguien tocara el original — y entonces el
 * agente dejaría de sentirse Handeia, que es justo el punto de ponerlo aquí.
 *
 * El espacio declara qué sabe hacer; Handeia razona. Aquí no hay ninguna IA.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShadowRoot, useTemaDelHost } from './estilos.js'
import { iniciarDictado, hayDictado, type SpeechRec } from './voz.js'
import { LimiteDeError } from './limite-error.js'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, X } from 'lucide-react'
import { InputBar, MODELS } from './input-bar.js'
import { AGENT_PROTOCOL_VERSION } from '../agent.js'
import type {
  AgentAction, AgentActionResult, AgentSpaceContext, AgentTurnResponse,
} from '../agent.js'

const CIRCLE_SIZE = 44
const FIELD_GAP = 12
const HANDEIA_POR_DEFECTO = 'https://handeia.com'
const RUTA_TURNO = '/api/agent/space'

export interface HandeiaAgentProps {
  /** capability_id del espacio, el mismo del manifest. */
  capabilityId: string
  /** Dónde vive Handeia. Un solo endpoint; el SDK no sabe qué hay detrás. */
  handeiaUrl?: string | undefined
  /** Qué está viendo el usuario AHORA. Se pregunta cada turno, no se cachea. */
  getContext?: (() => AgentSpaceContext | Promise<AgentSpaceContext>) | undefined
  /** Las mismas acciones que declara el manifest. */
  actions?: AgentAction[] | undefined
  /** Ejecuta una acción. Solo llega lo que Handeia ya validó. */
  onAction?: ((name: string, args: Record<string, unknown>) =>
    Promise<AgentActionResult> | AgentActionResult) | undefined
  placeholder?: string | undefined
}

/**
 * Deja el círculo dentro de lo que el usuario REALMENTE ve.
 *
 * Acotarlo a la ventana no basta en móvil: las barras del navegador se comen
 * alto, y sin esto se puede arrastrar a una zona que no se ve. visualViewport
 * da el alto visible de verdad.
 */
function acotar(x: number, y: number): { x: number; y: number } {
  const M = 8
  // Sin navegador no hay ventana que acotar. El guard va aquí arriba y no en
  // cada lectura: `window?.innerWidth` NO protege de nada, porque el optional
  // chaining cubre propiedades nulas, no una global que no existe.
  if (typeof window === 'undefined') return { x, y }
  const vv = window.visualViewport
  const w = vv?.width ?? window.innerWidth
  const h = vv?.height ?? window.innerHeight
  return {
    x: Math.min(Math.max(x, M), Math.max(M, w - CIRCLE_SIZE - M)),
    y: Math.min(Math.max(y, M), Math.max(M, h - CIRCLE_SIZE - M)),
  }
}

/**
 * El agente, con su red de seguridad puesta.
 *
 * Lo que se exporta envuelve al componente real: si algo revienta aquí dentro,
 * desaparece el agente y la app que lo hospeda sigue funcionando.
 */
export function HandeiaAgent(props: HandeiaAgentProps) {
  return (
    <LimiteDeError>
      <Agente {...props} />
    </LimiteDeError>
  )
}

function Agente(props: HandeiaAgentProps) {
  const base = (props.handeiaUrl ?? HANDEIA_POR_DEFECTO).replace(/\/$/, '')

  // Todo el agente vive dentro de este shadow root: sus estilos no salen y los
  // de la app no entran. Ver estilos.ts para el porqué, que costó caro.
  const shadow = useShadowRoot()
  const tema = useTemaDelHost()

  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [fieldOpen, setFieldOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number; openLeft: boolean; openAbove: boolean } | null>(null)
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  const [texto, setTexto] = useState('')
  const [model, setModel] = useState(MODELS[0]?.id ?? '')
  const [fase, setFase] = useState<'idle' | 'thinking' | 'done'>('idle')
  const [enviado, setEnviado] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const historial = useRef<{ role: 'user' | 'agent'; text: string }[]>([])

  // Voz. `voiceMode` enciende el lienzo animado del campo (el de Handeia);
  // `grabando` es el dictado en marcha.
  const [voiceMode, setVoiceMode] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const dictado = useRef<SpeechRec | null>(null)
  const [pendiente, setPendiente] = useState<{ name: string; args: Record<string, unknown> } | null>(null)

  // ── Arrastre del círculo, igual que en Handeia ─────────────────────────────
  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = {
      startX: e.clientX, startY: e.clientY,
      origX: pos?.x ?? r.left, origY: pos?.y ?? r.top,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    // Umbral: sin esto, un clic con temblor de dedo contaría como arrastre y
    // el campo nunca se abriría.
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    const { x, y } = acotar(d.origX + dx, d.origY + dy)
    const vv = window.visualViewport
    setPos({
      x, y,
      openLeft: x > (vv?.width ?? window.innerWidth) / 2,
      openAbove: y > (vv?.height ?? window.innerHeight) / 2,
    })
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) setFieldOpen(v => !v)   // fue clic, no arrastre
  }

  // Las barras del navegador aparecen y desaparecen, y el teclado de móvil se
  // come media pantalla: una posición válida deja de serlo sola. Se guarda el
  // alto VISIBLE (visualViewport), no innerHeight, que en móvil incluye lo que
  // tapan las barras — medir con él deja el campo debajo de lo que se ve.
  useEffect(() => {
    const medir = () => {
      const vv = window.visualViewport
      setVp({ w: vv?.width ?? window.innerWidth, h: vv?.height ?? window.innerHeight })
      setPos(p => (p ? { ...p, ...acotar(p.x, p.y) } : p))
    }
    medir()
    window.addEventListener('resize', medir)
    window.visualViewport?.addEventListener('resize', medir)
    window.visualViewport?.addEventListener('scroll', medir)
    return () => {
      window.removeEventListener('resize', medir)
      window.visualViewport?.removeEventListener('resize', medir)
      window.visualViewport?.removeEventListener('scroll', medir)
    }
  }, [])

  // ── Dictado ────────────────────────────────────────────────────────────────
  const pararDictado = useCallback(() => {
    dictado.current?.stop()
    dictado.current = null
    setGrabando(false)
    setRecSecs(0)
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null }
  }, [])

  const empezarDictado = useCallback(() => {
    // El texto ya escrito se conserva: lo dictado se añade, no lo pisa.
    const previo = texto ? texto + ' ' : ''
    const rec = iniciarDictado(
      dicho => setTexto(previo + dicho),
      () => pararDictado(),
    )
    if (!rec) return
    dictado.current = rec
    setGrabando(true)
    setRecSecs(0)
    recTimer.current = setInterval(() => setRecSecs(s => s + 1), 1000)
  }, [texto, pararDictado])

  // Si el componente se va con el micrófono abierto, se cierra. Dejarlo
  // escuchando sería lo peor que puede hacer un SDK.
  useEffect(() => () => { dictado.current?.abort(); if (recTimer.current) clearInterval(recTimer.current) }, [])

  // ── Un turno contra Handeia ────────────────────────────────────────────────
  const turno = useCallback(async (mensaje: string, actionResult?: AgentActionResult) => {
    let context: AgentSpaceContext | undefined
    try { context = await props.getContext?.() } catch { context = undefined }

    let data: AgentTurnResponse & { ok?: boolean; error?: string }
    try {
      const res = await fetch(`${base}${RUTA_TURNO}`, {
        method: 'POST',
        // La identidad va en la cookie de sesión de Handeia. El espacio nunca
        // ve ni toca el token del usuario.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          protocol: AGENT_PROTOCOL_VERSION,
          capId: props.capabilityId,
          message: mensaje,
          context,
          actions: props.actions ?? [],
          history: historial.current.slice(-12),
          actionResult,
        }),
      })
      data = await res.json()
      if (!res.ok || data.ok === false) {
        setRespuesta(
          data.error === 'no_autenticado' ? 'Inicia sesión en Handeia para usar el asistente.'
          : data.error === 'espacio_no_instalado' ? 'Este espacio no está instalado en tu Handeia.'
          : data.error === 'cupo_agotado' ? 'Se agotó el uso del asistente por hoy en este espacio.'
          : 'Handeia no pudo responder ahora mismo.',
        )
        setFase('done')
        return
      }
    } catch {
      setRespuesta('No pude comunicarme con Handeia.')
      setFase('done')
      return
    }

    if (data.text) {
      setRespuesta(data.text)
      historial.current.push({ role: 'agent', text: data.text })
    }
    setFase('done')

    if (!data.action) return
    if (!props.onAction) {
      setRespuesta('Esto requiere una acción que este espacio todavía no sabe ejecutar.')
      return
    }

    // Lo que escribe se confirma. Un agente que escribe sin preguntar se siente
    // fuera de control incluso cuando acierta.
    if (data.confirm) {
      setPendiente({ name: data.action.name, args: data.action.args ?? {} })
      return
    }
    await ejecutar(data.action.name, data.action.args ?? {}, mensaje)
  }, [base, props])

  const ejecutar = useCallback(async (name: string, args: Record<string, unknown>, mensaje: string) => {
    let r: AgentActionResult
    try {
      r = await props.onAction!(name, args)
    } catch (e) {
      r = { action: name, ok: false, error: e instanceof Error ? e.message : 'falló' }
    }
    setFase('thinking')
    await turno(mensaje, r)
  }, [props, turno])

  const enviar = useCallback(() => {
    const t = texto.trim()
    if (!t || fase === 'thinking') return
    setTexto(''); setEnviado(t); setRespuesta(''); setPendiente(null); setFase('thinking')
    historial.current.push({ role: 'user', text: t })
    void turno(t)
  }, [texto, fase, turno])

  // El shadow root se crea en un efecto, o sea solo en el navegador. Eso hace
  // de guardia para el render de servidor: Next renderiza los componentes de
  // cliente también en el servidor en la primera carga, y aquí se lee `window`
  // por todas partes. Sin esta salida, el árbol entero revienta con "window is
  // not defined" y el espacio se queda sin agente.
  if (!shadow) return null

  // ── Dónde cabe el campo ────────────────────────────────────────────────────
  //
  // Se calcula la caja REAL en píxeles y se acota a lo que se ve. Antes se
  // elegía lado (izquierda/derecha del círculo) y se confiaba en que cupiera,
  // con un `transform: translate(...)` para descolgarlo. Dos fallos:
  //
  //  1. framer-motion escribe `transform` para animar, así que pisaba el
  //     translate del style. Con `left: 50%` y el `-50%` perdido, el campo
  //     salía media pantalla a la derecha. Por eso se salía nada más abrirlo.
  //  2. En móvil el campo mide casi el ancho entero, así que desplazarlo por
  //     el círculo lo sacaba igual, hubiera translate o no.
  //
  // Ahora la posición son números y el transform queda libre para la animación.
  const M = 8
  const ancho = Math.min(560, Math.max(240, vp.w - M * 2))
  const ALTO_MIN = 64   // lo que ocupa el campo cerrado; nunca se acota por debajo

  let left: number
  let top: number | undefined
  let bottom: number | undefined

  if (!pos) {
    // Sin arrastrar: centrado abajo, justo encima del círculo de la esquina.
    left = Math.round((vp.w - ancho) / 2)
    bottom = 20
  } else {
    left = pos.openLeft ? pos.x - FIELD_GAP - ancho : pos.x + CIRCLE_SIZE + FIELD_GAP
    left = Math.min(Math.max(left, M), Math.max(M, vp.w - ancho - M))

    if (pos.openAbove) {
      // Anclado por abajo: crece hacia arriba sin despegarse del círculo.
      bottom = Math.min(Math.max(vp.h - pos.y + FIELD_GAP, M), Math.max(M, vp.h - ALTO_MIN - M))
    } else {
      top = Math.min(Math.max(pos.y + CIRCLE_SIZE + FIELD_GAP, M), Math.max(M, vp.h - ALTO_MIN - M))
    }
  }

  // Una respuesta larga no puede empujar el campo fuera de la pantalla.
  const maxAlto = Math.max(ALTO_MIN, vp.h - (top ?? bottom ?? 0) - M)

  // El árbol se marca con el tema del host: los selectores no cruzan la
  // frontera del shadow, así que un `data-theme` en el <html> no llega aquí.
  // Reproducirlo dentro es lo que hace que `dark:` funcione — y ahora gana
  // siempre, porque aquí dentro no compite con las utilidades de nadie.
  // El fondo se desenfoca mientras Handeia piensa y mientras muestra la
  // respuesta. Es lo que hace Handeia dentro de un espacio: la pantalla se
  // transforma en vez de abrirse un chat encima.
  //
  // Dos capas, igual que el original: el desenfoque y, sobre él, un lavado
  // hacia blanco o negro. Sin el lavado, una respuesta cae sobre lo que haya
  // detrás —un vídeo oscuro, una foto— y el texto queda ilegible; el lavado
  // le da contraste sin tener que meter el texto en una tarjeta.
  const conBlur = fase === 'thinking' || (fase === 'done' && !!respuesta)

  return createPortal(
    <div className={tema === 'dark' ? 'dark' : undefined}>
      <AnimatePresence>
        {conBlur && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            // Un punto por debajo del campo: desenfoca la página, no el campo.
            style={{ position: 'fixed', inset: 0, zIndex: 2147482999, pointerEvents: 'none' }}
          >
            <div className="absolute inset-0 backdrop-blur-[22px]" />
            <div className="absolute inset-0 bg-white/60 dark:bg-black/55" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fieldOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left,
              ...(top !== undefined ? { top } : { bottom }),
              width: ancho,
              maxHeight: maxAlto,
              zIndex: 2147483000,
            }}
          >
            <div className="relative flex flex-col justify-end" style={{ maxHeight: maxAlto }}>
              <button
                onClick={() => { setFieldOpen(false); setEnviado(''); setRespuesta(''); setFase('idle') }}
                aria-label="Cerrar"
                className="absolute -top-2.5 -right-2.5 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white dark:text-black bg-black dark:bg-white shadow-[0_4px_14px_-2px_rgba(0,0,0,0.4)] transition-transform hover:scale-110 active:scale-95"
              >
                <X className="w-3 h-3" strokeWidth={2.4} />
              </button>

              {/* La respuesta va ARRIBA del campo, centrada y sin tarjeta —
                  el mismo tratamiento que en Handeia: la pantalla se
                  transforma, no se abre un chat. */}
              <AnimatePresence>
                {fase === 'done' && respuesta && (
                  <motion.div
                    key={enviado}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="mb-4 flex flex-col items-center gap-2 text-center px-2 min-h-0 overflow-y-auto"
                  >
                    <p className="text-[11px] uppercase tracking-[0.15em] text-black/30 dark:text-white/55 truncate max-w-full">{enviado}</p>
                    <p className="text-[17px] text-black/85 dark:text-white/92 tracking-[-0.02em] leading-relaxed">{respuesta}</p>

                    {pendiente && (
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          onClick={() => { const p = pendiente; setPendiente(null); void ejecutar(p.name, p.args, enviado) }}
                          className="h-8 px-4 rounded-full bg-black dark:bg-white text-white dark:text-black text-[12px] tracking-[-0.01em]"
                        >
                          Hacerlo
                        </button>
                        <button
                          onClick={() => { setPendiente(null); setRespuesta('Cancelado.') }}
                          className="h-8 px-4 rounded-full border border-black/[0.12] dark:border-white/[0.18] text-black/70 dark:text-white/85 text-[12px]"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <InputBar
                value={texto}
                onChange={setTexto}
                onSend={enviar}
                aiPhase={fase}
                sentText={enviado}
                placeholder={props.placeholder ?? 'Pregúntale a Handeia…'}
                model={model}
                onModelChange={setModel}
                // Voz: el lienzo animado del campo y el dictado. Solo se
                // ofrece si el navegador sabe dictar — un botón que no hace
                // nada es peor que no tenerlo.
                {...(hayDictado() ? {
                  voiceMode,
                  onVoiceModeToggle: () => {
                    setVoiceMode(v => {
                      if (v) pararDictado()
                      return !v
                    })
                  },
                  recording: grabando,
                  recordSecs: recSecs,
                  onStartRecording: empezarDictado,
                  onCancelRecording: () => { pararDictado(); setTexto('') },
                  // Se para el dictado y se manda lo dictado, que ya está en
                  // el campo: es el mismo camino que un mensaje escrito.
                  onSendRecording: () => { pararDictado(); if (texto.trim()) enviar() },
                } : {})}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* El círculo se va mientras el campo está abierto: ya hay una X para
          cerrar, y dejarlo puesto solo tapa la pantalla y confunde sobre
          cuál de los dos manda. Es lo que hace Handeia. */}
      {!fieldOpen && (
      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        aria-label="Asistente de Handeia"
        style={{
          position: 'fixed',
          zIndex: 2147483000,
          ...(pos ? { left: pos.x, top: pos.y } : { bottom: 20, right: 20 }),
        }}
        className="w-11 h-11 rounded-full flex items-center justify-center text-white bg-black dark:bg-white dark:text-black shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 active:scale-95 touch-none cursor-grab active:cursor-grabbing"
      >
        <Sparkles className="w-4 h-4" strokeWidth={1.9} />
      </button>
      )}
    </div>,
    shadow,
  )
}
