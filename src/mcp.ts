/**
 * Puente con MCP (Model Context Protocol), en las dos direcciones.
 *
 * MCP ganó como estándar para conectar agentes con herramientas: es lo que
 * usan Anthropic, OpenAI y Google, y hay miles de servidores ya escritos.
 * Pelearse con él sería quedarse solo; el camino es envolverlo.
 *
 * ── Por qué esto no es "adoptar MCP y ya" ────────────────────────────────
 * MCP describe QUÉ puede hacer una herramienta. No sabe decir HASTA DÓNDE:
 * no tiene forma de expresar "hasta $500 solo, arriba pregunta, y nunca
 * borrar". Esa es una carencia reconocida del protocolo, no una opinión.
 *
 * Entonces el reparto queda así:
 *   MCP  → el catálogo y el transporte. Lo que ya funciona, se reutiliza.
 *   VAIA → la autoridad, el consentimiento y la evidencia. Lo que falta.
 *
 * Una herramienta MCP importada entra SIN autoridad, y así no puede
 * ejecutarse: hay que asignársela explícitamente. Es a propósito — importar
 * algo de internet no debería dar permisos por el hecho de importarlo.
 */

import type { Authority, ToolDef } from './pieces.js'

// ─── Forma de una herramienta MCP ────────────────────────────────────────────

/** Esquema JSON de los argumentos, tal como lo publica un servidor MCP. */
export interface MCPInputSchema {
  type: 'object'
  properties?: Record<string, { type?: string; description?: string; enum?: string[] }> | undefined
  required?: string[] | undefined
}

export interface MCPTool {
  name: string
  description?: string | undefined
  inputSchema?: MCPInputSchema | undefined
  /** Pistas del servidor sobre si la herramienta destruye o no. */
  annotations?: {
    readOnlyHint?: boolean | undefined
    destructiveHint?: boolean | undefined
    idempotentHint?: boolean | undefined
  } | undefined
}

// ─── MCP → VAIA ──────────────────────────────────────────────────────────────

/**
 * Convierte una herramienta MCP en una declaración VAIA.
 *
 * La autoridad se pide aparte y es obligatoria: el servidor MCP describe lo
 * que sabe hacer, pero **quién decide hasta dónde puede llegar es el dueño de
 * la plataforma, no el servidor**. Confiar en lo que el propio servidor diga
 * de sí mismo sería dejar que quien se importa se autoconceda permisos.
 *
 * Las pistas del servidor se usan solo para AVISAR de incoherencias, nunca
 * para decidir.
 */
export function fromMCPTool(
  tool: MCPTool,
  authority: Authority,
  permission: string,
): { tool: ToolDef; warnings: string[] } {
  const warnings: string[] = []

  if (tool.annotations?.destructiveHint && authority.consequence === 'reversible') {
    warnings.push(
      `"${tool.name}": el servidor MCP la marca como destructiva, pero se declaró como reversible. Revísalo.`,
    )
  }
  if (tool.annotations?.readOnlyHint === false && authority.level === 'autonoma') {
    warnings.push(
      `"${tool.name}": escribe y se le dio autoridad autónoma. Asegúrate de que sea lo que quieres.`,
    )
  }
  if (!tool.description?.trim()) {
    warnings.push(`"${tool.name}": el servidor MCP no la describe, así que el agente no sabrá cuándo usarla.`)
  }

  return {
    tool: {
      // Prefijo para que se vea de dónde viene y no choque con lo propio.
      name: normalizarNombre(`mcp_${tool.name}`),
      description: tool.description?.trim() || `Herramienta MCP "${tool.name}" (sin descripción del servidor).`,
      authority,
      permission,
    },
    warnings,
  }
}

// ─── VAIA → MCP ──────────────────────────────────────────────────────────────

/**
 * Publica una herramienta VAIA como herramienta MCP.
 *
 * Se rellenan las pistas a partir de la autoridad declarada, para que del otro
 * lado sepan a qué atenerse. Y algo importante: **lo que requiere aprobación o
 * está prohibido no se publica**. Exponerlo por MCP sería ofrecerle a un
 * agente externo algo que ni el propio dueño puede ejecutar solo.
 */
export function toMCPTool(tool: ToolDef): MCPTool | null {
  if (tool.authority.level !== 'autonoma') return null

  return {
    name: tool.name,
    description: tool.description,
    annotations: {
      readOnlyHint: tool.authority.consequence === 'reversible',
      destructiveHint: tool.authority.consequence === 'irreversible',
      idempotentHint: false,
    },
  }
}

/** Publica un conjunto, descartando lo que no debe salir. */
export function toMCPTools(tools: ToolDef[]): { published: MCPTool[]; withheld: string[] } {
  const published: MCPTool[] = []
  const withheld: string[] = []
  for (const t of tools) {
    const m = toMCPTool(t)
    if (m) published.push(m)
    else withheld.push(t.name)
  }
  return { published, withheld }
}

function normalizarNombre(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 48)
}
