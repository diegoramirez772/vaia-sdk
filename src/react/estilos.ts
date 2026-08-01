import { useEffect, useState } from 'react'
import { AGENT_CSS } from './styles.generated.js'

/**
 * El agente vive dentro de un Shadow DOM.
 *
 * Historia corta de por qué, porque cuesta caro reaprenderla:
 *
 *  1. Sin CSS propio, el campo salía desnudo: Tailwind no escanea node_modules,
 *     así que la app que hospeda nunca compila las clases del SDK.
 *  2. Con CSS propio inyectado en <head>, el SDK le reordenó las capas a la app
 *     y dejó Nexus entero cuadrado en producción.
 *  3. Arreglado el orden, las variantes `dark:` del SDK empataban en
 *     especificidad con las utilidades de la app y perdían por ir antes: la
 *     tarjeta del campo salía blanca incluso en modo oscuro.
 *
 * Los tres son la misma enfermedad: dos hojas de estilo compartiendo un
 * documento. El Shadow DOM la corta de raíz. Lo de dentro no sale y lo de
 * fuera no entra, así que el agente se ve idéntico en cualquier proyecto —
 * use Tailwind, use otra cosa, o no use nada— y la app que lo hospeda no
 * cambia ni un píxel.
 */

/** Marca el contenedor para poder encontrarlo desde fuera si hiciera falta. */
export const HOST_ATTR = 'data-vaia-agent'

/**
 * Crea el contenedor y su shadow root.
 *
 * El host va sin transform, sin filter y sin contain, a propósito: cualquiera
 * de los tres lo convertiría en el bloque contenedor de `position: fixed`, y el
 * campo dejaría de anclarse a la ventana para anclarse a un div de altura cero.
 */
export function useShadowRoot(): ShadowRoot | null {
  const [root, setRoot] = useState<ShadowRoot | null>(null)

  useEffect(() => {
    const host = document.createElement('div')
    host.setAttribute(HOST_ATTR, '')
    const shadow = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = AGENT_CSS
    shadow.appendChild(style)

    document.body.appendChild(host)
    setRoot(shadow)
    return () => { host.remove() }
  }, [])

  return root
}

/**
 * El tema que usa la app que hospeda, para reproducirlo dentro del shadow.
 *
 * Hace falta porque los selectores no cruzan la frontera del shadow: un
 * `[data-theme="dark"]` en el <html> no alcanza a nada de aquí dentro. Así que
 * se lee por JavaScript y se vuelve a marcar dentro.
 *
 * Se entienden las dos convenciones porque cada proyecto usa la suya: Handeia
 * marca con la clase `.dark`, Nexus con `data-theme`. Y si no hay ninguna, se
 * respeta la preferencia del sistema.
 */
export function useTemaDelHost(): 'light' | 'dark' {
  const [tema, setTema] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const leer = () => {
      const raiz = document.documentElement
      const claro = raiz.classList.contains('light') || raiz.getAttribute('data-theme') === 'light'
      const oscuro = raiz.classList.contains('dark') || raiz.getAttribute('data-theme') === 'dark'
      setTema(oscuro || (!claro && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light')
    }
    leer()

    const obs = new MutationObserver(leer)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', leer)
    return () => { obs.disconnect(); mq.removeEventListener('change', leer) }
  }, [])

  return tema
}
