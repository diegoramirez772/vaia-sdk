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
export function hablar(texto: string, alTerminar: () => void): void {
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

/**
 * Corta lo que se esté leyendo, si acaso. Según el navegador, esto puede
 * disparar el `alTerminar` del `hablar()` en curso (Chrome lo hace vía
 * `onerror`) — quien llame a esto debe apagar su propia bandera de "sigo en
 * modo voz" ANTES de invocarlo, así ese callback no intenta seguir la
 * conversación con algo que el usuario acaba de cortar.
 */
export function pararHabla(): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth) return
  synth.cancel()
}
