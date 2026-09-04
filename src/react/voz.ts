/**
 * Dictado por voz, con lo que el navegador ya trae.
 *
 * Se usa la API de reconocimiento del navegador y no un servicio propio: el
 * SDK no puede mandar audio a ningún sitio sin que el dueño del espacio lo
 * sepa, y montar transcripción en el servidor obligaría a Handeia a aceptar
 * audio de cualquiera. Aquí el audio no sale del dispositivo: entra texto al
 * campo y se manda como cualquier mensaje escrito.
 *
 * Donde el navegador no la trae (Firefox, y Safari según versión), el botón
 * de voz no se ofrece — mejor que ofrecerlo y que no pase nada.
 */

interface ResultadoVoz { transcript: string }
/** Una alternativa reconocida, más la marca de si ya es definitiva. */
interface TramoVoz { isFinal: boolean; item(i: number): ResultadoVoz }
interface EventoVoz {
  resultIndex: number
  results: { length: number; item(i: number): TramoVoz }
}

export interface SpeechRec {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: EventoVoz) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type ConstructorVoz = new () => SpeechRec

function constructorDeVoz(): ConstructorVoz | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: ConstructorVoz
    webkitSpeechRecognition?: ConstructorVoz
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** ¿Se puede dictar en este navegador? */
export function hayDictado(): boolean {
  return constructorDeVoz() !== null
}

/** ¿Se puede grabar audio real (MediaRecorder) en este navegador? Mucho más
 * disponible que hayDictado() — cubre Firefox y Safari, donde
 * SpeechRecognition no existe. */
export function hayGrabacion(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Arranca el dictado.
 *
 * `alTexto` recibe lo que se lleva dicho, incluida la parte provisional, para
 * que se vea aparecer mientras hablas en vez de al final de golpe.
 * Devuelve la función para pararlo, o null si el navegador no puede.
 */
export function iniciarDictado(
  alTexto: (texto: string) => void,
  alTerminar: () => void,
): SpeechRec | null {
  const Ctor = constructorDeVoz()
  if (!Ctor) return null

  const rec = new Ctor()
  // El idioma de la página, si lo declara. Dictar en el idioma equivocado da
  // resultados tan malos que parece que no funciona.
  rec.lang = document.documentElement.lang || 'es-ES'
  rec.continuous = true
  rec.interimResults = true

  // Se reconstruye COMPLETO desde el índice 0 en cada evento, en vez de
  // acumular con += arrastrando un `firme` entre eventos. Chrome, en modo
  // continuo, a veces reemite tramos que ya había marcado como finales
  // (típico tras una pausa breve) — con += eso los duplicaba cada vez que
  // volvían a aparecer ("hola" dicho una vez podía volverse "hola hola
  // hola..."). `e.results` ya trae el historial completo de la sesión, así
  // que releerlo entero es la única forma de no arrastrar duplicados.
  rec.onresult = (e) => {
    let firme = ''
    let provisional = ''
    for (let i = 0; i < e.results.length; i++) {
      const tramo = e.results.item(i)
      if (!tramo) continue
      const texto = tramo.item(0)?.transcript ?? ''
      if (tramo.isFinal) firme += texto
      else provisional += texto
    }
    alTexto((firme + provisional).trim())
  }
  rec.onerror = () => alTerminar()
  rec.onend = () => alTerminar()

  try { rec.start() } catch { return null }
  return rec
}

/**
 * Lee texto en voz alta con el sintetizador del navegador — mismo principio
 * que el dictado de arriba: nada sale del dispositivo, no hay llamada a
 * ningún servidor. `alTerminar` avisa cuando termina (o falla, o se
 * canceló) para que quien llama pueda encadenar el siguiente paso, como
 * volver a escuchar.
 */
function hablarNavegador(texto: string, alTerminar: () => void): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth || !texto.trim()) { alTerminar(); return }
  synth.cancel()
  const utter = new SpeechSynthesisUtterance(texto)
  utter.lang = document.documentElement.lang || 'es-ES'
  const voz = synth.getVoices().find(v => v.lang?.startsWith(utter.lang.slice(0, 2)))
  if (voz) utter.voice = voz
  utter.onend = alTerminar
  utter.onerror = alTerminar
  synth.speak(utter)
  synth.resume()
}

// ─── Voz real, si el espacio la ofrece ─────────────────────────────────────
//
// El SDK sigue sin mandar audio a ningún lado por su cuenta — la regla dura
// de arriba no cambia. `sintetizar`, si se pasa (ver onSynthesizeSpeech en
// HandeiaAgentProps), es una función que el ESPACIO entrega: texto entra,
// bytes de audio salen, y a dónde va esa llamada real es decisión del
// espacio, nunca del SDK. Sin ella, `hablar()` se queda en
// hablarNavegador() de siempre.
//
// Se reproduce con Web Audio (AudioContext) y no con un <audio>: en móvil un
// <audio> creado por código nace bloqueado si no sale de un gesto del
// usuario, y la respuesta llega segundos después del toque al micrófono — el
// AudioContext se desbloquea una vez con resume() dentro del gesto (el mismo
// toque que abre el campo) y se queda desbloqueado todo el rato.

/** Corta por final de oración conservando el signo, agrupando las muy cortas
 * ("Sí.", "Claro.") con la siguiente — partir ahí solo añade un viaje de red
 * y una costura audible sin ganar nada. El primer trozo se deja lo más corto
 * posible a propósito: lo único que se percibe como "tardó en contestar" es
 * cuánto pasa hasta el primer sonido, y las frases que siguen se sintetizan
 * mientras esa ya suena. */
function partirEnFrases(texto: string, minLargo = 60): string[] {
  const crudas = texto.match(/[^.!?…\n]+[.!?…]*\s*/g) ?? [texto]
  const frases: string[] = []
  for (const cruda of crudas) {
    const frase = cruda.trim()
    if (!frase) continue
    const ultima = frases[frases.length - 1]
    if (ultima && frases.length > 1 && ultima.length < minLargo) {
      frases[frases.length - 1] = `${ultima} ${frase}`
    } else {
      frases.push(frase)
    }
  }
  const unica = frases[0]
  if (frases.length === 1 && unica !== undefined && unica.length > 90) {
    const corte = unica.indexOf(', ')
    if (corte > 20 && corte < 90) return [unica.slice(0, corte + 1), unica.slice(corte + 2)]
  }
  return frases
}

let ctxCompartido: AudioContext | null = null
let fuenteActual: AudioBufferSourceNode | null = null
// Cada reproducción lleva su propio turno. Si pararHabla() corta y arranca
// otra antes de que termine un fetch en vuelo, el resultado viejo llega tarde
// y hay que descartarlo en vez de dejar que hable encima del turno nuevo.
let turnoActual = 0

type CtorAudio = typeof AudioContext
function obtenerContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctxCompartido) {
    const w = window as unknown as { AudioContext?: CtorAudio; webkitAudioContext?: CtorAudio }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return null
    ctxCompartido = new Ctor()
  }
  // Tiene que resumirse dentro de un gesto del usuario para contar como
  // permiso — quien llama a esto lo hace desde dentro del toque al campo.
  if (ctxCompartido.state === 'suspended') ctxCompartido.resume().catch(() => {})
  return ctxCompartido
}

/**
 * Aquí está la sincronía de verdad: el texto no avanza con un cronómetro que
 * adivina el ritmo del habla — eso sería una coincidencia, no una sincronía —
 * sino como CONSECUENCIA de lo que ya sonó. El AudioBuffer sabe cuánto dura y
 * el AudioContext en qué milisegundo va, así que la proporción es exacta: es
 * imposible que el texto se adelante a la voz.
 */
function reproducir(ctx: AudioContext, buffer: AudioBuffer, alAvanzar: (p: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const fuente = ctx.createBufferSource()
    fuente.buffer = buffer
    fuente.connect(ctx.destination)
    fuenteActual = fuente
    const inicio = ctx.currentTime
    const duracion = buffer.duration || 0.001
    let raf = 0
    const seguir = () => {
      const p = Math.min(1, (ctx.currentTime - inicio) / duracion)
      alAvanzar(p)
      if (p < 1) raf = requestAnimationFrame(seguir)
    }
    raf = requestAnimationFrame(seguir)
    fuente.onended = () => { cancelAnimationFrame(raf); alAvanzar(1); resolve() }
    fuente.start()
  })
}

async function hablarConAudio(
  texto: string,
  alTerminar: () => void,
  sintetizar: (texto: string) => Promise<ArrayBuffer | Blob>,
  alHablado?: (parcial: string) => void,
): Promise<void> {
  const ctx = obtenerContexto()
  if (!ctx) { hablarNavegador(texto, alTerminar); return }

  const turno = ++turnoActual
  const frases = partirEnFrases(texto.trim())
  if (frases.length === 0) { alTerminar(); return }

  // Se adelantan 2 frases en paralelo con lo que ya está sonando — sintetizar
  // dura menos que hablar, así que con una adelantada siempre hay audio listo
  // cuando termina la anterior y la respuesta suena continua.
  const PREFETCH = 2
  const pedir = async (frase: string): Promise<AudioBuffer | null> => {
    try {
      const bytes = await sintetizar(frase)
      const buf = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes
      return await ctx.decodeAudioData(buf)
    } catch {
      return null
    }
  }

  const cola: Promise<AudioBuffer | null>[] = frases.slice(0, PREFETCH).map(pedir)
  let proxima = PREFETCH
  let dicho = ''

  for (let i = 0; i < frases.length; i++) {
    const frase = frases[i]
    if (frase === undefined) continue
    if (turnoActual !== turno) return
    const buffer = await cola[i]
    if (turnoActual !== turno) return
    if (proxima < frases.length) {
      const siguiente = frases[proxima++]
      if (siguiente !== undefined) cola.push(pedir(siguiente))
    }

    const previo = dicho
    if (buffer) {
      // El progreso llega a 60fps pero el texto solo cambia cuando se revela
      // otra letra — sin este filtro se avisaría varias veces por cada
      // cambio real, repintando de más para nada.
      let ultimo = ''
      await reproducir(ctx, buffer, (p) => {
        const hasta = Math.floor(frase.length * p)
        const parcial = (previo ? `${previo} ` : '') + frase.slice(0, hasta)
        if (parcial === ultimo) return
        ultimo = parcial
        alHablado?.(parcial)
      })
      if (turnoActual !== turno) return
    } else if (i === 0) {
      // Ni la primera frase salió: el espacio no está dando voz ahora mismo.
      // Se cae al sintetizador del navegador con el texto entero — suena
      // peor, pero mudo no se queda.
      hablarNavegador(texto, alTerminar)
      return
    } else {
      // Solo falló una frase intermedia: se enseña esa entera (no hay audio
      // al que sincronizarla) y se sigue con las siguientes.
      alHablado?.((previo ? `${previo} ` : '') + frase)
    }
    dicho = (previo ? `${previo} ` : '') + frase
  }

  if (turnoActual !== turno) return
  alTerminar()
}

/**
 * Lee texto en voz alta. Sin `sintetizar`, es exactamente el
 * `hablarNavegador` de siempre. Con ella (ver onSynthesizeSpeech), se
 * reproduce el audio real por Web Audio y `alHablado` recibe el texto ya
 * pronunciado, acumulado, para que quien llama lo pinte en sincronía —
 * `alTerminar` avisa cuando termina (o falla, o se canceló) para que quien
 * llama pueda encadenar el siguiente paso, como volver a escuchar.
 */
export function hablar(
  texto: string,
  alTerminar: () => void,
  sintetizar?: (texto: string) => Promise<ArrayBuffer | Blob>,
  alHablado?: (parcial: string) => void,
): void {
  if (!texto.trim()) { alTerminar(); return }
  if (!sintetizar) { hablarNavegador(texto, alTerminar); return }
  void hablarConAudio(texto, alTerminar, sintetizar, alHablado)
}

/**
 * Corta lo que se esté leyendo, si acaso — tanto el audio real (Web Audio)
 * como el sintetizador del navegador. Según el navegador, cancelar
 * speechSynthesis puede disparar el `alTerminar` del `hablar()` en curso
 * (Chrome lo hace vía `onerror`) — quien llame a esto debe apagar su propia
 * bandera de "sigo en modo voz" ANTES de invocarlo, así ese callback no
 * intenta seguir la conversación con algo que el usuario acaba de cortar.
 */
export function pararHabla(): void {
  turnoActual++
  if (fuenteActual) {
    try { fuenteActual.stop() } catch { /* ya terminó sola */ }
    fuenteActual = null
  }
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  synth?.cancel()
}
