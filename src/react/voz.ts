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

  let firme = ''
  rec.onresult = (e) => {
    let provisional = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
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
