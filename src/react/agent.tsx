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
import { iniciarDictado, hayDictado, hablar, pararHabla, type SpeechRec } from './voz.js'
import { LimiteDeError } from './limite-error.js'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, X } from 'lucide-react'
import { InputBar, MODELS } from './input-bar.js'
import { TextoRico } from './texto-rico.js'
import { AGENT_PROTOCOL_VERSION } from '../agent.js'
import type {
  AgentAction, AgentActionResult, AgentSpaceContext, AgentTurnResponse,
} from '../agent.js'

const CIRCLE_SIZE = 44
const FIELD_GAP = 12
const HANDEIA_POR_DEFECTO = 'https://handeia.com'
const RUTA_TURNO = '/api/agent/space'

/**
 * El color del cursor del agente.
 *
 * Fijo, no por espacio: dentro de Nexus cada espacio tenía su tinte, pero aquí
 * el cursor representa a HANDEIA actuando dentro de la app de otro — si tomara
 * el color del anfitrión se confundiría con su propia UI, que es justo lo que
 * no debe pasar. Violeta, el mismo de la identidad de voz del campo.
 *
 * Se elige un tono que aguanta fondo claro y oscuro sin cambiar: el puntero
 * lleva contorno del color del fondo (blanco/negro), y ese contraste es lo que
 * lo despega de cualquier cosa que tenga debajo.
 */
const CURSOR_COLOR = '#8b5cf6'

export interface HandeiaAgentProps {
  /** capability_id del espacio, el mismo del manifest. */
  capabilityId: string
  /** Dónde vive Handeia. Un solo endpoint; el SDK no sabe qué hay detrás. */
  handeiaUrl?: string | undefined
  /**
   * Header `Authorization` para el turno, si el espacio lo tiene. La cookie
   * de sesión de Handeia no cruza a un espacio en otro dominio (SameSite) —
   * esto es lo que prueba identidad en su lugar. Se pide en cada turno, no se
   * cachea, por si el token expira. Sin esto, el turno va solo con la cookie
   * (funciona igual cuando el espacio SÍ comparte sitio con Handeia).
   */
  getAuthHeader?: (() => Promise<string | null | undefined> | string | null | undefined) | undefined
  /** Qué está viendo el usuario AHORA. Se pregunta cada turno, no se cachea. */
  getContext?: (() => AgentSpaceContext | Promise<AgentSpaceContext>) | undefined
  /** Las mismas acciones que declara el manifest. */
  actions?: AgentAction[] | undefined
  /** Ejecuta una acción. Solo llega lo que Handeia ya validó. */
  onAction?: ((name: string, args: Record<string, unknown>) =>
    Promise<AgentActionResult> | AgentActionResult) | undefined
  /**
   * Dónde vive en el DOM la acción `name`, si el espacio quiere que el
   * cursor de Handeia camine hasta ahí antes de ejecutarla — el mismo
   * lenguaje visual que usa Handeia al activar un artefacto propio. Sin
   * esto, la acción se ejecuta directo, sin animación: degradar bien es
   * mejor que obligar a cablear algo que el espacio todavía no tiene.
   *
   * Recibe `args` además del nombre porque el nombre solo no alcanza para
   * acciones sobre un elemento entre varios — "abrir la vacante 2" necesita
   * saber CUÁL vacante, no solo que la acción es "abrir_vacante".
   */
  getActionTarget?: ((name: string, args: Record<string, unknown>) => HTMLElement | null | undefined) | undefined
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
  // Sin 'done': al terminar un turno se vuelve a 'idle'. `aiPhase` distinto de
  // 'idle' reemplaza el textarea por un estado ("Listo"), así que quedarse en
  // 'done' dejaba el campo sin poder escribir hasta cerrarlo y abrirlo otra
  // vez. Que haya respuesta en pantalla lo dice `respuesta`, no la fase.
  const [fase, setFase] = useState<'idle' | 'thinking' | 'acting'>('idle')
  const [enviado, setEnviado] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const historial = useRef<{ role: 'user' | 'agent'; text: string }[]>([])
  const campoRef = useRef<HTMLDivElement>(null)

  // Dónde empieza el campo AHORA MISMO (borde superior real, medido, no
  // calculado) — la respuesta usa esto para saber cuánto espacio tiene libre
  // arriba del campo. Se remide con ResizeObserver porque el campo cambia de
  // alto solo (el textarea crece al escribir, el estado cambia entre
  // idle/pensando/grabando) — un valor calculado una sola vez se desactualiza
  // apenas el usuario escribe una segunda línea.
  const [campoTop, setCampoTop] = useState<number | null>(null)

  // Solo mientras se arrastra de verdad. Puesto siempre, `touch-none` mataría
  // el desplazamiento del textarea en móvil; puesto solo aquí, para cuando se
  // activa el dedo ya lleva quieto la espera completa y el navegador no ha
  // empezado a desplazar nada.
  const [arrastrando, setArrastrando] = useState(false)

  // Cursor caminando hasta la acción — mismo lenguaje que Handeia usa para
  // activar sus propios artefactos. `key` fuerza un remount por caminata:
  // así `initial`→`animate` de framer-motion siempre anima desde el punto de
  // partida real, en vez de quedarse pegado en el destino de la vez anterior.
  const [cursor, setCursor] = useState<{ x0: number; y0: number; x1: number; y1: number; key: number } | null>(null)
  const [accionLabel, setAccionLabel] = useState('')

  // Voz. `voiceMode` enciende el lienzo animado del campo (el de Handeia);
  // `grabando` es el dictado en marcha. `voiceModeRef` sigue a `voiceMode`
  // en vivo — lo necesita el callback de `hablar()` (que llega después de
  // que React ya re-renderizó, a veces varios turnos después) para saber si
  // debe volver a escuchar sin depender de una closure vieja.
  const [voiceMode, setVoiceMode] = useState(false)
  const voiceModeRef = useRef(false)
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
    // Fue clic, no arrastre. Al cerrar se limpia todo (voz incluida), no solo
    // se oculta — ver cerrarCampo.
    if (d && !d.moved) {
      if (fieldOpen) cerrarCampo()
      else setFieldOpen(true)
    }
  }

  // ── Arrastrar el campo abierto ─────────────────────────────────────────────
  //
  // Antes solo se arrastraba el círculo: para mover el campo había que
  // cerrarlo, arrastrar y volver a abrirlo. Se mueve la MISMA posición
  // (`pos`), así que campo y círculo siguen siendo una sola cosa y el acotado
  // que ya impedía salirse de pantalla sigue aplicando igual.
  //
  // Se mueve dejándolo PRESIONADO, en cualquier parte del campo — sin
  // tirador ni zona secreta. La espera es lo que evita el choque con todo lo
  // demás: escribir, seleccionar texto o desplazar son gestos que empiezan
  // de inmediato, así que si el dedo (o el cursor) se queda quieto un
  // momento, la intención es mover.
  //
  // Sobre botones y enlaces no arranca: ahí el gesto es pulsar, y un botón
  // que hay que soltar rápido para que funcione se siente roto.
  const ESPERA_MS = 350
  const tempArrastre = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelarEspera = () => {
    if (tempArrastre.current) { clearTimeout(tempArrastre.current); tempArrastre.current = null }
  }

  const onFieldDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement | null
    if (el?.closest?.('button, a, [role="button"]')) return

    const vv = window.visualViewport
    const w = vv?.width ?? window.innerWidth
    const h = vv?.height ?? window.innerHeight
    const inicio = {
      startX: e.clientX, startY: e.clientY,
      // Sin arrastrar todavía, el círculo vive en su esquina por CSS: se
      // convierte a coordenadas para que el primer arrastre no dé un salto.
      origX: pos?.x ?? w - CIRCLE_SIZE - 20,
      origY: pos?.y ?? h - CIRCLE_SIZE - 20,
      moved: false,
    }
    const id = e.pointerId
    const nodo = e.currentTarget

    cancelarEspera()
    tempArrastre.current = setTimeout(() => {
      drag.current = inicio
      setArrastrando(true)
      // Se captura al cumplirse la espera, no antes: capturar de entrada le
      // robaría al textarea el foco y la selección en gestos que no eran
      // para mover.
      try { nodo.setPointerCapture(id) } catch { /* el puntero ya se fue */ }
    }, ESPERA_MS)
  }

  const onFieldMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) {
      // Todavía en la espera: si se mueve antes de tiempo, no era para
      // mover — era desplazar o seleccionar. Se cancela y se deja en paz.
      if (tempArrastre.current) cancelarEspera()
      return
    }
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    d.moved = true
    const { x, y } = acotar(d.origX + dx, d.origY + dy)
    const vv = window.visualViewport
    setPos({
      x, y,
      openLeft: x > (vv?.width ?? window.innerWidth) / 2,
      openAbove: y > (vv?.height ?? window.innerHeight) / 2,
    })
  }

  // Soltar no abre ni cierra nada: el campo ya está abierto y tocar su fondo
  // no debería hacerle nada.
  const onFieldUp = () => {
    cancelarEspera()
    drag.current = null
    setArrastrando(false)
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

  /**
   * Cerrar el campo deja TODO como estaba al abrirlo por primera vez.
   *
   * Antes solo se ocultaba: el modo voz seguía encendido, así que al volver a
   * abrir el círculo el lienzo animado aparecía solo, como si se hubiera
   * activado por su cuenta. Y peor, el dictado seguía en marcha con el
   * micrófono abierto detrás de un campo cerrado — lo último que debe hacer
   * un SDK dentro de la app de otro.
   */
  const cerrarCampo = useCallback(() => {
    pararDictado()
    voiceModeRef.current = false
    pararHabla()
    setVoiceMode(false)
    setFieldOpen(false)
    setEnviado('')
    setRespuesta('')
    setPendiente(null)
    setFase('idle')
  }, [pararDictado])

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

  // Mide el borde superior real del campo — cada vez que cambia de tamaño
  // (textarea creciendo, cambio de fase, teclado de móvil abriéndose) y cada
  // vez que se abre. Sin esto la respuesta usaría un cálculo viejo y podría
  // terminar tapando el campo, o al revés, dejando un hueco de más.
  useEffect(() => {
    if (!fieldOpen) { setCampoTop(null); return }
    const el = campoRef.current
    if (!el) return
    const medir = () => setCampoTop(el.getBoundingClientRect().top)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    window.visualViewport?.addEventListener('resize', medir)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
      window.visualViewport?.removeEventListener('resize', medir)
    }
  }, [fieldOpen])

  // ── El cursor caminando hasta la acción ─────────────────────────────────────
  //
  // Nunca con blur (ver `conBlur` más abajo): si el agente va a actuar sobre
  // la UI del espacio, el fondo se queda nítido a propósito, para que lo único
  // que se vea pasar sea el cursor caminando — igual que cuando Handeia activa
  // uno de sus propios artefactos.
  //
  // `getActionTarget` es opcional: un espacio que todavía no lo implementa
  // simplemente no ve caminar el cursor, la acción se ejecuta directo. Nunca
  // es un error no tenerlo.
  const caminarHastaAccion = useCallback((name: string, args: Record<string, unknown>, label: string): Promise<void> => {
    return new Promise((resolve) => {
      // getActionTarget es código de terceros: si truena (un selector mal
      // escrito, lo que sea), la acción no se detiene por eso — se ejecuta
      // directo, igual que si el espacio nunca hubiera declarado un target.
      let el: HTMLElement | null | undefined
      try {
        el = props.getActionTarget?.(name, args)
      } catch {
        el = null
      }
      if (!el) { resolve(); return }
      const destino = el.getBoundingClientRect()
      const origen = campoRef.current?.getBoundingClientRect()
      setAccionLabel(label)
      setFase('acting')
      setCursor({
        x0: origen ? origen.left + origen.width / 2 : destino.left + destino.width / 2,
        y0: origen ? origen.top + origen.height / 2 : destino.top + destino.height / 2,
        x1: destino.left + destino.width / 2,
        y1: destino.top + destino.height / 2,
        key: Date.now(),
      })
      // Mismo tiempo que la transición del cursor (abajo) más una pausa breve
      // ya llegado, para que "activar" se sienta como un paso propio y no
      // como un corte a medio camino.
      setTimeout(() => { setCursor(null); resolve() }, 750)
    })
  }, [props])

  // Modo voz de verdad: lee la respuesta y, si el modo sigue activo cuando
  // termina de hablar, vuelve a escuchar sola — así se sostiene una
  // conversación completa por voz con un solo botón, en vez de un lector que
  // no lleva a ningún lado. No se dispara si el modo está apagado (el botón
  // de dictado sigue siendo independiente para quien solo quiere dictar).
  const decirYQuizasEscuchar = useCallback((texto: string, reescuchar = true) => {
    if (!voiceModeRef.current) return
    hablar(texto, () => {
      // Una confirmación pendiente (¿hago esto: X?) se lee, pero no vuelve a
      // escuchar sola — un "sí" dictado caería en el campo de texto, no en
      // los botones de confirmar/cancelar, así que reabrir el mic ahí
      // prometería algo que el SDK todavía no sabe cumplir.
      if (reescuchar && voiceModeRef.current) empezarDictado()
    })
  }, [empezarDictado])

  // ── Un turno contra Handeia ────────────────────────────────────────────────
  const turno = useCallback(async (mensaje: string, actionResult?: AgentActionResult) => {
    let context: AgentSpaceContext | undefined
    try { context = await props.getContext?.() } catch { context = undefined }

    // Espacio de terceros: si esto truena, el turno sigue solo con la cookie
    // (el caso normal cuando SÍ comparte sitio con Handeia) en vez de romperse.
    let authHeader: string | null = null
    try { authHeader = (await props.getAuthHeader?.()) ?? null } catch { authHeader = null }

    let data: AgentTurnResponse & { ok?: boolean; error?: string }
    try {
      const res = await fetch(`${base}${RUTA_TURNO}`, {
        method: 'POST',
        // La cookie de sesión de Handeia viaja igual cuando el espacio
        // comparte sitio con Handeia. Para cuando no (dominio distinto,
        // la cookie no cruza por SameSite), authHeader prueba identidad.
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
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
        const texto =
          data.error === 'no_autenticado' ? 'Inicia sesión en Handeia para usar el asistente.'
          : data.error === 'espacio_no_instalado' ? 'Este espacio no está instalado en tu Handeia.'
          : data.error === 'cupo_agotado' ? 'Se agotó el uso del asistente por hoy en este espacio.'
          : 'Handeia no pudo responder ahora mismo.'
        setRespuesta(texto)
        decirYQuizasEscuchar(texto)
        setFase('idle')
        return
      }
    } catch {
      const texto = 'No pude comunicarme con Handeia.'
      setRespuesta(texto)
      decirYQuizasEscuchar(texto)
      setFase('idle')
      return
    }

    // El texto queda en el historial aunque no se muestre en pantalla — el
    // agente sí debe recordar haberlo dicho, aunque venga pegado a una acción
    // que se ejecuta sola.
    if (data.text) historial.current.push({ role: 'agent', text: data.text })

    if (data.action) {
      if (!props.onAction) {
        // Esto SÍ es algo que el usuario debe leer: el espacio no sabe hacer
        // lo que se le pidió.
        const texto = 'Esto requiere una acción que este espacio todavía no sabe ejecutar.'
        setRespuesta(texto)
        decirYQuizasEscuchar(texto)
        setFase('idle')
        return
      }
      // Lo que escribe se confirma, y ahí sí hay algo que leer antes de
      // decidir — el mismo tratamiento que una respuesta de texto normal.
      if (data.confirm) {
        // Con texto vacío no se pinta la capa de respuesta — y los botones de
        // confirmar viven dentro de ella. Sin este respaldo, una acción que
        // pide permiso se quedaría esperando una respuesta invisible.
        const texto = data.text || `¿Hago esto: ${data.action.name}?`
        setRespuesta(texto)
        decirYQuizasEscuchar(texto, false)
        setFase('idle')
        setPendiente({ name: data.action.name, args: data.action.args ?? {} })
        return
      }
      // "Llévame a X" no es una pregunta de texto: no hay nada que el usuario
      // deba leer, así que la pantalla no se desenfoca ni se abre nada — se
      // ejecuta directo, sin pasar por poner respuesta. Cuando sí se ponía,
      // esa transición alcanzaba a pintarse un instante aunque el turno
      // terminara en acción, y la pantalla se desenfocaba de la nada.
      await ejecutar(data.action.name, data.action.args ?? {}, mensaje)
      return
    }

    // Sin acción: es una pregunta de texto normal, con su blur de siempre.
    setRespuesta(data.text ?? '')
    decirYQuizasEscuchar(data.text ?? '')
    setFase('idle')
  }, [base, props, decirYQuizasEscuchar])

  const ejecutar = useCallback(async (name: string, args: Record<string, unknown>, mensaje: string) => {
    const declarada = props.actions?.find(a => a.name === name)
    await caminarHastaAccion(name, args, declarada?.description ?? name)

    let r: AgentActionResult
    try {
      r = await props.onAction!(name, args)
    } catch (e) {
      r = { action: name, ok: false, error: e instanceof Error ? e.message : 'falló' }
    }
    setFase('thinking')
    await turno(mensaje, r)
  }, [props, turno, caminarHastaAccion])

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
  // Lo que de verdad puede llegar a medir el campo: fila de contenido + barra
  // de acciones + borde, con el textarea estirado a su máximo (max-h-[160px]
  // en AutoTextarea). 64px alcanzaba para el campo cerrado de un renglón,
  // pero no para eso — y entonces el campo se salía por abajo justo cuando
  // más se necesitaba verlo (escribiendo un mensaje largo). Nunca se acota
  // por debajo de esto.
  const ALTO_MIN = 240

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
  // Depende de que HAYA respuesta, no de una fase "done": el campo vuelve a
  // `idle` en cuanto termina el turno (para poder escribir otra vez) y la
  // respuesta se queda en pantalla hasta que se cierre o se pregunte de nuevo.
  const conBlur = fase === 'thinking' || !!respuesta

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

      {/* El cursor de Handeia caminando hasta la acción — puntero estilo
          Figma (flecha + avatar), mismas coordenadas reales del elemento que
          declaró el espacio vía getActionTarget. Nunca con blur detrás: acá
          lo único que debe verse pasar es el cursor. */}
      {cursor && (
        <motion.div
          key={cursor.key}
          initial={{ left: cursor.x0, top: cursor.y0, opacity: 0 }}
          animate={{ left: cursor.x1, top: cursor.y1, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'fixed', zIndex: 2147483001, pointerEvents: 'none' }}
        >
          {/* Avatar de la IA, como en Handeia: un puntero de color con
              "alguien" encima se lee como una presencia moviéndose, no como
              una flecha decorativa. El violeta es el mismo de la identidad de
              voz del campo, así el agente se ve como una sola cosa. */}
          <span
            className="absolute bottom-full left-2 mb-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white ring-2 ring-white dark:ring-[#171717]"
            style={{ backgroundColor: CURSOR_COLOR, boxShadow: `0 2px 8px -1px ${CURSOR_COLOR}99` }}
          >
            <Sparkles className="w-2.5 h-2.5" strokeWidth={2.4} />
          </span>
          <svg width="22" height="26" viewBox="0 0 22 26" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))' }}>
            <path
              d="M2 1.5L2 20.5L7 16.3L10 24L13.3 22.6L10.3 15.2L18 15.2L2 1.5Z"
              fill={CURSOR_COLOR}
              className="stroke-white dark:stroke-[#171717]"
              strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"
            />
          </svg>
        </motion.div>
      )}

      {/* La respuesta — en su PROPIA capa, no adentro del contenedor del
          campo. Lee la pantalla desde arriba hasta justo encima de donde
          esté el campo AHORA MISMO (campoTop, medido de verdad, no
          calculado): el espacio del campo nunca cuenta como disponible.
          Texto corto se ve centrado en lo que sobra arriba; texto largo usa
          casi toda esa altura; si no alcanza ni así, esta capa desliza con
          su propio scroll — pero el campo jamás se comprime ni se tapa,
          porque su alto sale de medir el DOM real, no de una cuenta que
          pueda quedar corta (eso es justo lo que fallaba antes: un cálculo
          en vez de una medición, y el scroll de la respuesta terminaba
          empujando o tapando el campo). */}
      <AnimatePresence>
        {respuesta && campoTop !== null && (
          <motion.div
            key={enviado}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              width: '100%',
              height: Math.max(0, campoTop - FIELD_GAP),
              zIndex: 2147483000,
            }}
            className="flex items-center justify-center px-10 pointer-events-none"
          >
            <div className="w-full max-w-[640px] max-h-full overflow-y-auto pointer-events-auto flex flex-col items-center gap-2 text-center px-2 py-4">
              <p className="text-[11px] uppercase tracking-[0.15em] text-black/30 dark:text-white/55 truncate max-w-full">{enviado}</p>
              <div className="text-[17px] text-black/85 dark:text-white/92 tracking-[-0.02em] leading-relaxed w-full">
                <TextoRico texto={respuesta} />
              </div>

              {pendiente && (
                <div className="mt-1 flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { const p = pendiente; setPendiente(null); void ejecutar(p.name, p.args, enviado) }}
                    className="h-8 px-4 rounded-full bg-black dark:bg-white text-white dark:text-black text-[12px] tracking-[-0.01em]"
                  >
                    Hacerlo
                  </button>
                  <button
                    onClick={() => { setPendiente(null); setRespuesta('Cancelado.'); decirYQuizasEscuchar('Cancelado.') }}
                    className="h-8 px-4 rounded-full border border-black/[0.12] dark:border-white/[0.18] text-black/70 dark:text-white/85 text-[12px]"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
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
            <div
              ref={campoRef}
              onPointerDown={onFieldDown}
              onPointerMove={onFieldMove}
              onPointerUp={onFieldUp}
              onPointerCancel={onFieldUp}
              className={`relative flex flex-col justify-end ${arrastrando ? 'touch-none select-none cursor-grabbing' : ''}`}
              style={{ maxHeight: maxAlto }}
            >
              <button
                onClick={cerrarCampo}
                aria-label="Cerrar"
                className="absolute -top-2.5 -right-2.5 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white dark:text-black bg-black dark:bg-white shadow-[0_4px_14px_-2px_rgba(0,0,0,0.4)] transition-transform hover:scale-110 active:scale-95"
              >
                <X className="w-3 h-3" strokeWidth={2.4} />
              </button>

              {/* Nunca se encoge — la respuesta (afuera, en su propia capa,
                  ver más abajo) es la única que cede espacio. Sin esto, un
                  campo con poco margen arriba (circulo arrastrado cerca del
                  borde) podría terminar comprimido por flexbox junto con la
                  respuesta, en vez de quedar siempre intacto. */}
              <div className="shrink-0">
                <InputBar
                  value={texto}
                  onChange={setTexto}
                  onSend={enviar}
                  aiPhase={fase}
                  aiStatus={fase === 'acting' ? `Activando "${accionLabel}"…` : ''}
                  sentText={enviado}
                  placeholder={props.placeholder ?? 'Pregúntale a Handeia…'}
                  model={model}
                  onModelChange={setModel}
                  // "Nube de Handeia" y "Conectores" son de Handeia, no del
                  // espacio: se abren allá, en pestaña nueva, para no sacar al
                  // usuario de lo que está haciendo aquí. rel noopener porque
                  // esto corre dentro de la app de un tercero.
                  onCloudOpen={() => window.open(`${base}/sistema?nav=archivos`, '_blank', 'noopener,noreferrer')}
                  onNavigateConnectors={() => window.open(`${base}/sistema?nav=conectores`, '_blank', 'noopener,noreferrer')}
                  // Voz: el lienzo animado del campo y el dictado. Solo se
                  // ofrece si el navegador sabe dictar — un botón que no hace
                  // nada es peor que no tenerlo.
                  {...(hayDictado() ? {
                    voiceMode,
                    // Los dos botones son cosas distintas y no se disparan
                    // entre sí: el micrófono dicta, la onda enciende el
                    // lienzo de voz. Atarlos hacía que abrir el modo voz se
                    // pusiera a grabar solo, sin que nadie lo pidiera.
                    // Apagarlo sí corta un dictado en curso — dejar el
                    // micrófono abierto sin su lienzo sería peor. Y ahora
                    // también corta la síntesis en curso: un mic cerrado con
                    // Handeia todavía hablando sería la misma inconsistencia.
                    onVoiceModeToggle: () => {
                      setVoiceMode(v => {
                        const next = !v
                        voiceModeRef.current = next
                        if (v) {
                          pararDictado()
                          pararHabla()
                        } else if (respuesta) {
                          // Ya hay algo en pantalla al prender el modo — se
                          // lee de una vez, aprovechando el gesto del click
                          // (que es lo que el navegador exige para la
                          // primera síntesis). No arranca a grabar sola: eso
                          // sigue siendo solo del botón de dictado. Si lo que
                          // hay en pantalla es una confirmación pendiente,
                          // tampoco reescucha sola (mismo motivo que arriba).
                          decirYQuizasEscuchar(respuesta, !pendiente)
                        }
                        return next
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
