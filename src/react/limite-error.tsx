'use client';

import { Component, type ReactNode } from 'react'

/**
 * Red de seguridad: un fallo del agente no puede tumbar la app que lo hospeda.
 *
 * Sin esto, cualquier excepción dentro del agente sube por el árbol de React y
 * desmonta lo que encuentre. Pasó de verdad: activar el modo voz en una página
 * servida por http lanzaba un TypeError —`navigator.mediaDevices` no existe
 * fuera de contexto seguro— y el agente entero desaparecía de la pantalla.
 *
 * Ese error concreto ya está corregido en su sitio. Esto es para el siguiente:
 * un SDK que se monta dentro del producto de otra persona no tiene derecho a
 * romperlo. Si el agente falla, el agente desaparece y la app sigue.
 */
export class LimiteDeError extends Component<
  { children: ReactNode },
  { rompio: boolean }
> {
  override state = { rompio: false }

  static getDerivedStateFromError() {
    return { rompio: true }
  }

  override componentDidCatch(error: unknown) {
    // Se avisa por consola —quien integra el SDK necesita poder verlo— pero no
    // se manda a ningún sitio: el SDK no llama a casa.
    console.error('[vaia-lab/sdk] el agente falló y se retiró para no arrastrar la app:', error)
  }

  override render() {
    if (this.state.rompio) return null
    return this.props.children
  }
}
