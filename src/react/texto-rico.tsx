'use client';

/**
 * El texto del modelo, con formato.
 *
 * El modelo escribe en Markdown: negritas, listas, separadores. Pintarlo como
 * un solo párrafo dejaba los asteriscos y los guiones a la vista, todo pegado
 * y sin respiro — se leía como un volcado, no como una respuesta.
 *
 * Se construyen elementos de React, NUNCA `dangerouslySetInnerHTML`: esto vive
 * dentro de la app de otro y renderiza texto que viene de un modelo. Inyectar
 * HTML ahí sería abrirle una puerta a cualquiera que logre influir en la
 * respuesta.
 *
 * Es un subconjunto a propósito —lo que un asistente usa de verdad— en vez de
 * meter una librería de Markdown entera en un paquete que quien lo instala no
 * pidió.
 */

import type { ReactNode } from 'react'

/** Negritas, cursivas y código dentro de una línea. */
const EN_LINEA = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g

function inline(texto: string, clave: string): ReactNode[] {
  return texto.split(EN_LINEA).filter(Boolean).map((t, i) => {
    const k = `${clave}-${i}`
    if ((t.startsWith('**') && t.endsWith('**')) || (t.startsWith('__') && t.endsWith('__'))) {
      return <strong key={k} className="font-semibold">{t.slice(2, -2)}</strong>
    }
    if (t.startsWith('`') && t.endsWith('`')) {
      return (
        <code key={k} className="px-1 py-0.5 rounded text-[0.9em] bg-black/[0.06] dark:bg-white/[0.10]">
          {t.slice(1, -1)}
        </code>
      )
    }
    if ((t.startsWith('*') && t.endsWith('*')) || (t.startsWith('_') && t.endsWith('_'))) {
      return <em key={k}>{t.slice(1, -1)}</em>
    }
    return <span key={k}>{t}</span>
  })
}

const VINETA = /^\s*[-*•]\s+/
const NUMERADA = /^\s*\d+[.)]\s+/
const SEPARADOR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const TITULO = /^\s*(#{1,6})\s+(.*)$/

export function TextoRico({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  const bloques: ReactNode[] = []

  // Las listas se acumulan y se cierran de golpe: si cada viñeta fuera su
  // propio bloque, el espaciado entre ellas sería el de párrafos y la lista
  // dejaría de leerse como una lista.
  let lista: { orden: boolean; items: string[] } | null = null
  let parrafo: string[] = []

  const cerrarParrafo = () => {
    if (!parrafo.length) return
    const t = parrafo.join(' ')
    bloques.push(<p key={`p${bloques.length}`}>{inline(t, `p${bloques.length}`)}</p>)
    parrafo = []
  }

  const cerrarLista = () => {
    if (!lista) return
    const { orden, items } = lista
    const Etiqueta = orden ? 'ol' : 'ul'
    bloques.push(
      <Etiqueta
        key={`l${bloques.length}`}
        className={`text-left inline-block ${orden ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}
      >
        {items.map((it, i) => <li key={i}>{inline(it, `l${bloques.length}-${i}`)}</li>)}
      </Etiqueta>,
    )
    lista = null
  }

  const cerrarTodo = () => { cerrarParrafo(); cerrarLista() }

  for (const linea of lineas) {
    if (!linea.trim()) { cerrarTodo(); continue }

    if (SEPARADOR.test(linea)) {
      cerrarTodo()
      bloques.push(<hr key={`h${bloques.length}`} className="my-1 border-black/10 dark:border-white/15" />)
      continue
    }

    const titulo = TITULO.exec(linea)
    if (titulo) {
      cerrarTodo()
      bloques.push(
        <p key={`t${bloques.length}`} className="font-semibold">
          {inline(titulo[2] ?? '', `t${bloques.length}`)}
        </p>,
      )
      continue
    }

    if (VINETA.test(linea) || NUMERADA.test(linea)) {
      const orden = NUMERADA.test(linea)
      cerrarParrafo()
      if (lista && lista.orden !== orden) cerrarLista()
      if (!lista) lista = { orden, items: [] }
      lista.items.push(linea.replace(orden ? NUMERADA : VINETA, ''))
      continue
    }

    cerrarLista()
    parrafo.push(linea.trim())
  }
  cerrarTodo()

  return <div className="flex flex-col gap-3">{bloques}</div>
}
