/**
 * Capacidades que CORREN.
 *
 * El resto del SDK declara y valida. Esto ejecuta. Es la diferencia entre
 * darle a alguien el letrero de la puerta y darle la puerta.
 *
 * ── Las tres formas de tener una capacidad ───────────────────────────────
 *   local()  → una función tuya, gobernada
 *   http()   → un proyecto que ya tienes, sin reescribirlo
 *   mcp()    → miles que ya existen en código abierto, con reglas encima
 *
 * Las tres se ejecutan igual y las tres pasan por la misma autoridad. Ese es
 * el punto: da igual quién escribió la capacidad, el gobierno es uno solo.
 *
 * ── Cero dependencias, y cero modelo ─────────────────────────────────────
 * El SDK no trae ningún proveedor de IA. Quien lo use pasa su propia función
 * de modelo — Ollama local, Claude, lo que salga el año que viene. Atarse a un
 * proveedor sería heredar su suerte.
 */

import { checkAuthority, type Authority, type ToolDef } from './pieces.js'
import { VAIAError } from './types.js'

// ─── Lo que toda capacidad sabe hacer ────────────────────────────────────────

export interface CapabilityCall {
  /** Nombre de la operación dentro de la capacidad. */
  name: string
  args?: Record<string, unknown> | undefined
  /** Si mueve dinero, va aquí para que la autoridad lo revise de verdad. */
  amount?: number | undefined
  currency?: string | undefined
  /**
   * Un humano YA dio el visto bueno para ESTA llamada.
   *
   * Levanta la barrera solo aquí y ahora: no cambia la declaración, así que la
   * próxima vez se vuelve a preguntar. Un "sí" no es un cheque en blanco.
   * Nunca desbloquea lo prohibido — para eso está declarado prohibido y no
   * "requiere aprobación".
   */
  approved?: boolean | undefined
}

export interface CapabilityResult {
  ok: boolean
  data?: unknown
  error?: string | undefined
  /** De dónde salió lo que devuelve. Sin esto no hay nada que auditar. */
  evidence?: { source: string; label: string } | undefined
  /** true si la autoridad exige que un humano confirme antes de ejecutar. */
  needsApproval?: boolean | undefined
}

export interface Capability {
  /** Identificador dentro del ecosistema. */
  readonly id: string
  /** Qué operaciones ofrece, ya con su autoridad asignada. */
  readonly tools: ToolDef[]
  /** Ejecuta. Revisa autoridad ANTES de tocar nada. */
  run(call: CapabilityCall): Promise<CapabilityResult>
  /** Suelta recursos (procesos, sockets). Llamar al quitar del ecosistema. */
  dispose?(): Promise<void> | void
}

// ─── Puerta única de autoridad ───────────────────────────────────────────────

/**
 * Nadie ejecuta sin pasar por aquí.
 *
 * Está en un solo lugar a propósito: si cada tipo de capacidad revisara sus
 * permisos por su cuenta, tarde o temprano una se los saltaría. Una sola
 * puerta se puede auditar de un vistazo.
 */
async function conAutoridad(
  tools: ToolDef[],
  call: CapabilityCall,
  ejecutar: () => Promise<CapabilityResult>,
): Promise<CapabilityResult> {
  const tool = tools.find(t => t.name === call.name)
  if (!tool) {
    return { ok: false, error: `La operación "${call.name}" no está declarada en esta capacidad.` }
  }

  const permitido = checkAuthority(tool.authority, {
    amount: call.amount,
    currency: call.currency,
  })
  if (!permitido.ok) return { ok: false, error: permitido.reason }

  // Lo prohibido no se ejecuta nunca, ni con permiso humano de por medio.
  if (tool.authority.level === 'prohibida') {
    return { ok: false, error: `"${call.name}" está prohibida.` }
  }

  // Lo que requiere aprobación no se ejecuta aquí: se devuelve para que quien
  // llama consiga el visto bueno — el SDK no puede fingir que lo tuvo. Si ya
  // viene aprobado, pasa.
  if (tool.authority.level !== 'autonoma' && !call.approved) {
    return { ok: false, needsApproval: true, error: 'Requiere aprobación humana antes de ejecutarse.' }
  }

  try {
    return await ejecutar()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'La capacidad falló.' }
  }
}

// ─── local() ─────────────────────────────────────────────────────────────────

export interface LocalCapabilityOptions {
  id: string
  tools: ToolDef[]
  /** Tu código. Recibe el nombre y los argumentos ya validados. */
  handler: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown
}

/** Convierte una función tuya en capacidad gobernada. El caso más simple. */
export function local(opts: LocalCapabilityOptions): Capability {
  return {
    id: opts.id,
    tools: opts.tools,
    run: call =>
      conAutoridad(opts.tools, call, async () => ({
        ok: true,
        data: await opts.handler(call.name, call.args ?? {}),
        evidence: { source: 'local', label: opts.id },
      })),
  }
}

// ─── http() ──────────────────────────────────────────────────────────────────

export interface HttpCapabilityOptions {
  id: string
  /** Base de tu proyecto ya existente. */
  baseUrl: string
  tools: ToolDef[]
  /** Cabeceras propias (tu API key, por ejemplo). */
  headers?: Record<string, string> | undefined
  timeoutMs?: number | undefined
}

/**
 * Un proyecto que ya tienes se vuelve capacidad **sin reescribirlo**.
 *
 * Es el caso de "tengo tres proyectos que no se hablan": se declaran sus
 * operaciones, se les pone autoridad, y dejan de ser islas.
 */
export function http(opts: HttpCapabilityOptions): Capability {
  const base = opts.baseUrl.replace(/\/$/, '')
  return {
    id: opts.id,
    tools: opts.tools,
    run: call =>
      conAutoridad(opts.tools, call, async () => {
        const res = await fetch(`${base}/${call.name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...opts.headers },
          body: JSON.stringify(call.args ?? {}),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        })
        const texto = await res.text()
        if (!res.ok) return { ok: false, error: `${opts.id} respondió ${res.status}` }
        let data: unknown
        try { data = JSON.parse(texto) } catch { data = texto }
        return { ok: true, data, evidence: { source: 'http', label: `${opts.id}/${call.name}` } }
      }),
  }
}

// ─── mcp() ───────────────────────────────────────────────────────────────────

/**
 * Transporte de un servidor MCP.
 *
 * Es una interfaz y no una implementación fija para no atar el SDK a Node:
 * por HTTP funciona en cualquier runtime, y quien quiera stdio conecta su
 * propio transporte sin que el paquete cargue con `child_process`.
 */
export interface MCPTransport {
  send(mensaje: unknown): Promise<unknown>
  close?(): Promise<void> | void
}

/** Transporte HTTP, el que funciona en todos lados. */
export function httpTransport(url: string, headers?: Record<string, string>): MCPTransport {
  return {
    async send(mensaje) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify(mensaje),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new VAIAError(`Servidor MCP respondió ${res.status}`, 'MCP_HTTP_ERROR', 502)
      return res.json()
    },
  }
}

export interface MCPCapabilityOptions {
  id: string
  transport: MCPTransport
  /**
   * Autoridad por herramienta. Lo que no aparezca aquí queda PROHIBIDO.
   *
   * Es la decisión de diseño más importante de todo el archivo: conectas un
   * servidor de internet y **nada corre hasta que tú lo autorices**. Más
   * fricción, sí — y es justo lo que separa esto de "enchufa y reza".
   */
  authority: Record<string, Authority>
  /** Autoridad para lo que no esté nombrado. Por defecto, prohibida. */
  defaultAuthority?: Authority | undefined
  /** Permiso que se le asigna a las herramientas importadas. */
  permission?: string | undefined
}

const PROHIBIDA: Authority = { level: 'prohibida', consequence: 'irreversible' }

/**
 * Conecta un servidor MCP de verdad: lista sus herramientas y las llama.
 *
 * Aquí están los miles de capacidades de código abierto que ya existen —
 * filesystem, GitHub, Postgres, navegador. No hay que construirlas: hay que
 * gobernarlas.
 */
export async function mcp(opts: MCPCapabilityOptions): Promise<Capability> {
  let siguienteId = 1
  const rpc = async (method: string, params?: unknown): Promise<Record<string, unknown>> => {
    const r = (await opts.transport.send({
      jsonrpc: '2.0', id: siguienteId++, method, ...(params ? { params } : {}),
    })) as Record<string, unknown>
    if (r?.['error']) {
      const e = r['error'] as { message?: string }
      throw new VAIAError(e?.message ?? 'Error del servidor MCP', 'MCP_ERROR', 502)
    }
    return (r?.['result'] ?? {}) as Record<string, unknown>
  }

  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: '@vaia-lab/sdk', version: '0.3.0' },
  })

  const listadas = ((await rpc('tools/list'))['tools'] ?? []) as { name: string; description?: string }[]

  // Cada herramienta importada nace prohibida salvo que se le haya asignado
  // autoridad explícita. Importar de internet no concede permisos.
  const tools: ToolDef[] = listadas.map(t => ({
    name: normalizar(t.name),
    description: t.description?.trim() || `Herramienta MCP "${t.name}".`,
    authority: opts.authority[t.name] ?? opts.defaultAuthority ?? PROHIBIDA,
    permission: opts.permission ?? `mcp:${opts.id}`,
  }))

  // Para poder llamar con el nombre original aunque se exponga normalizado.
  const original = new Map(listadas.map(t => [normalizar(t.name), t.name]))

  return {
    id: opts.id,
    tools,
    run: call =>
      conAutoridad(tools, call, async () => {
        const nombreReal = original.get(call.name) ?? call.name
        const r = await rpc('tools/call', { name: nombreReal, arguments: call.args ?? {} })
        return {
          ok: !r['isError'],
          data: r['content'] ?? r,
          error: r['isError'] ? 'La herramienta MCP devolvió un error.' : undefined,
          evidence: { source: 'mcp', label: `${opts.id}/${nombreReal}` },
        }
      }),
    dispose: () => opts.transport.close?.(),
  }
}

function normalizar(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 48)
}

/** Todo junto, para importarlo de un jalón. */
export const capabilities = { local, http, mcp, httpTransport }
