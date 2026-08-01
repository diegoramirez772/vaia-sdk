import { AGENT_CSS } from './styles.generated.js'

/**
 * Pone los estilos del agente en la página, una sola vez.
 *
 * Se inyectan desde el propio componente en vez de pedirle al que instala que
 * importe un CSS: un import que se olvida no da error, solo deja el campo
 * viéndose como una caja blanca sin explicación.
 *
 * Va en <head> y como PRIMER hijo, no al final. Así, a igualdad de
 * especificidad, gana el CSS de la app que hospeda: el SDK trae lo que
 * necesita para verse bien, pero nunca le gana un pulso de estilos a la casa.
 */
const ID = 'vaia-agent-styles'

export function asegurarEstilos(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(ID)) return

  const style = document.createElement('style')
  style.id = ID
  style.textContent = AGENT_CSS

  const head = document.head
  if (head.firstChild) head.insertBefore(style, head.firstChild)
  else head.appendChild(style)
}
