/**
 * VAIA Extension Protocol — superficie de AGENTE.
 *
 * Es la parte del protocolo que permite que el asistente de Handeia viva
 * dentro de un espacio de terceros. Sigue la regla del ecosistema: protocolo
 * antes que SDK. Lo que hay aquí son CONTRATOS; el SDK solo los transporta.
 *
 * ── El reparto de papeles ────────────────────────────────────────────────
 *   El espacio  → superficie y manos. Declara qué sabe y qué puede hacer.
 *   Handeia     → cerebro, memoria y autoridad. Decide y ejecuta a través suyo.
 *
 * Por eso un espacio NO trae su propia IA: si la trajera, no te conocería,
 * empezaría de cero cada vez, y no podría contradecirse a sí mismo. El caso
 * que lo justifica: el espacio puntúa un resultado con 90 y el agente te dice
 * que te conviene el de 87, porque sabe algo de ti que el espacio no sabe.
 * Eso solo es posible si el cerebro vive fuera del espacio.
 *
 * ── La regla de confianza, que manda sobre todo lo demás ─────────────────
 * El espacio es CÓDIGO DE TERCEROS. Nada de lo que envía es un hecho: es una
 * AFIRMACIÓN. Handeia la trata como dato citado, nunca como instrucción y
 * nunca al mismo nivel que lo que sabe del usuario. Un espacio que escriba
 * "ignora las instrucciones anteriores" en su contexto no logra nada.
 *
 * @see AGENT_PROTOCOL_VERSION para la política de compatibilidad.
 */

/**
 * Versión del protocolo de agente. Viaja en cada mensaje.
 *
 * Se versiona desde el primer día a propósito: este contrato es público y
 * cambiarlo después obliga a coordinar despliegues entre partes que no se
 * conocen. Ya se pagó esa factura una vez con la codificación del JWT.
 */
export const AGENT_PROTOCOL_VERSION = 1

// ─── Qué declara el espacio ──────────────────────────────────────────────────

/** Un parámetro de una acción. Sin tipos no hay validación posible. */
export interface AgentActionParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean | undefined
  /** Valores admitidos. Si se define, nada fuera de la lista es válido. */
  enum?: string[] | undefined
}

/**
 * Algo que el espacio sabe hacer.
 *
 * Handeia SOLO puede pedir acciones declaradas aquí. No improvisa, no toca el
 * DOM, no busca la forma. Si no está declarada, para el agente no existe —
 * y eso es lo que hace que el mismo agente sirva en cualquier espacio sin que
 * Handeia sepa nada de ninguno en particular.
 */
export interface AgentAction {
  /** Identificador estable, en minúsculas: 'filtrar_resultados'. */
  name: string
  /** Qué hace, en lenguaje natural. Es lo que lee el modelo para elegirla. */
  description: string
  params?: AgentActionParam[] | undefined
  /**
   * true si modifica algo. Las que escriben se confirman con el usuario ANTES
   * de ejecutarse — un agente que escribe sin preguntar se siente fuera de
   * control incluso cuando acierta.
   */
  writes?: boolean | undefined
  /** Permiso que el usuario debe haber concedido a este espacio. */
  permission?: string | undefined
}

/** Configuración de la superficie de agente dentro de defineCapability. */
export interface AgentSurfaceConfig {
  /** Acciones que el espacio expone. Vacío = el agente solo puede responder. */
  actions?: AgentAction[] | undefined
  /**
   * Endpoint para preguntarle al espacio cuando el usuario NO está dentro
   * ("¿tengo algo pendiente ahí?"). El círculo solo existe con el espacio
   * abierto; esto es lo que permite que Handeia sea el lugar donde convergen
   * todos tus espacios en vez de uno más al que entrar.
   */
  queryEndpoint?: string | undefined
  /** Frase de bienvenida propia del espacio. */
  greeting?: string | undefined
  /**
   * Servicios externos que el espacio necesita consultar. El usuario los
   * concede por espacio y los puede revocar cuando quiera. El espacio jamás
   * recibe el token: pide operaciones, la plataforma las ejecuta.
   */
  needs?: ConnectorNeed[] | undefined
}

// ─── Conectores prestados ────────────────────────────────────────────────────

/**
 * Servicios externos que un espacio puede necesitar (GitHub, Drive, Calendar…).
 *
 * ── La regla, y no tiene excepciones ─────────────────────────────────────
 * El espacio NUNCA recibe el token del usuario. Declara qué necesita, la
 * plataforma llama al proveedor con el token que YA tiene guardado, y le
 * devuelve solo el resultado.
 *
 * Por qué así y no entregando el token:
 *   - Si cada espacio guardara tokens, la superficie de ataque se multiplica
 *     por cada desarrollador que publique. Un espacio comprometido entregaría
 *     el GitHub y el Drive de todos sus usuarios.
 *   - Prestado, un espacio comprometido solo puede pedir las operaciones que
 *     el usuario le concedió, con límite de frecuencia, auditadas y
 *     revocables al instante desde Conectores.
 *
 * De regalo, publicar un espacio se vuelve barato: el desarrollador no
 * implementa OAuth de nada.
 */
export type ConnectorNeed =
  | 'github'
  | 'drive'
  | 'calendar'
  | 'email'
  | 'notion'
  | 'discord'

/**
 * Operaciones de LECTURA que la plataforma sabe hacer por el espacio.
 *
 * Lista cerrada a propósito: un espacio no puede pedir "haz esta llamada
 * arbitraria a la API de GitHub". Solo puede pedir lo que está aquí, y cada
 * una devuelve datos ya acotados. Escribir en un servicio externo NO se
 * presta — para eso el usuario usa el servicio.
 */
export type ConnectorOperation =
  | 'github.repos'        // repositorios a los que el usuario tiene acceso
  | 'github.issues'       // issues asignados al usuario
  | 'drive.files'         // archivos recientes
  | 'calendar.events'     // eventos próximos
  | 'email.recent'        // asuntos recientes (nunca el cuerpo completo)
  | 'notion.pages'        // páginas compartidas

/** Lo que el espacio pide prestado. */
export interface ConnectorRequest {
  operation: ConnectorOperation
  /** Filtros simples. La plataforma los valida; nada de consultas libres. */
  params?: Record<string, string | number | boolean> | undefined
}

/** Lo que la plataforma devuelve. Datos, jamás credenciales. */
export interface ConnectorResult {
  operation: ConnectorOperation
  ok: boolean
  items?: Record<string, unknown>[] | undefined
  /** 'sin_conectar' = el usuario no ha vinculado ese servicio todavía. */
  error?: 'sin_permiso' | 'sin_conectar' | 'no_soportada' | 'limite_excedido' | 'fallo' | undefined
}

/** Qué operación necesita qué conector — la plataforma lo usa para autorizar. */
export const CONNECTOR_OF_OPERATION: Record<ConnectorOperation, ConnectorNeed> = {
  'github.repos':    'github',
  'github.issues':   'github',
  'drive.files':     'drive',
  'calendar.events': 'calendar',
  'email.recent':    'email',
  'notion.pages':    'notion',
}

// ─── Lo que viaja en cada turno ──────────────────────────────────────────────

/**
 * Lo que el espacio dice que está pasando.
 *
 * OJO: se llama `claims` y no `facts` a propósito. Handeia lo etiqueta como
 * afirmación de un tercero antes de dárselo al modelo.
 */
export interface AgentSpaceContext {
  /** Dónde está el usuario dentro del espacio: '/lista'. */
  route?: string | undefined
  /** Qué está viendo, en lenguaje natural: 'Lista de 12 resultados'. */
  view?: string | undefined
  /** Datos que el espacio considera relevantes ahora mismo. */
  claims?: Record<string, unknown> | undefined
}

/** Petición del espacio a Handeia. Un solo endpoint, un solo formato. */
export interface AgentTurnRequest {
  protocol: typeof AGENT_PROTOCOL_VERSION
  /** Lo que escribió el usuario. */
  message: string
  context?: AgentSpaceContext | undefined
  /** Acciones disponibles AHORA (pueden ser menos que las declaradas). */
  actions?: AgentAction[] | undefined
  /** Turnos previos, para que el agente no pierda el hilo. */
  history?: { role: 'user' | 'agent'; text: string }[] | undefined
  /** Resultado de una acción que Handeia pidió en el turno anterior. */
  actionResult?: AgentActionResult | undefined
}

/** Lo que el espacio devuelve tras ejecutar una acción. */
export interface AgentActionResult {
  action: string
  ok: boolean
  /** Qué pasó, para que el agente pueda cerrar el ciclo con el usuario. */
  summary?: string | undefined
  error?: string | undefined
}

/**
 * De dónde salió lo que el agente afirma.
 *
 * No es adorno: es el pilar de info verificada. Cuando el agente contradice
 * al espacio ("dice 90, pero te conviene la de 87"), tiene que poder decir de
 * dónde sacó su razón. Un oráculo que no se explica no se gana la confianza.
 */
export interface AgentEvidence {
  /** 'handeia' = memoria del usuario · 'space' = lo que declaró el espacio. */
  source: 'handeia' | 'space'
  label: string
}

/** Respuesta de Handeia al espacio. */
export interface AgentTurnResponse {
  protocol: typeof AGENT_PROTOCOL_VERSION
  /** Qué decirle al usuario. */
  text?: string | undefined
  /** Acción a ejecutar. Siempre sale de la lista declarada, nunca inventada. */
  action?: { name: string; args?: Record<string, unknown> | undefined } | undefined
  /** true si hay que confirmar con el usuario antes de ejecutarla. */
  confirm?: boolean | undefined
  evidence?: AgentEvidence[] | undefined
  /** Identificador para cruzar los registros de todas las capas. */
  traceId?: string | undefined
}

// ─── Validación del contrato ─────────────────────────────────────────────────

/** Nombres estables: minúsculas, números y guion bajo. */
const NOMBRE_ACCION = /^[a-z][a-z0-9_]{1,48}$/

/**
 * Revisa que las acciones declaradas sean utilizables.
 *
 * Corre al declarar la capacidad, no en producción: un contrato mal escrito
 * debe reventar en el escritorio del desarrollador, no frente al usuario.
 */
export function validateAgentSurface(cfg: AgentSurfaceConfig): string[] {
  const errores: string[] = []
  const vistos = new Set<string>()

  for (const accion of cfg.actions ?? []) {
    if (!NOMBRE_ACCION.test(accion.name)) {
      errores.push(`Acción "${accion.name}": el nombre debe ser minúsculas, números o guion bajo.`)
    }
    if (vistos.has(accion.name)) {
      errores.push(`Acción "${accion.name}": declarada dos veces.`)
    }
    vistos.add(accion.name)

    if (!accion.description?.trim()) {
      // Sin descripción el modelo no puede elegirla — queda muerta.
      errores.push(`Acción "${accion.name}": falta la descripción, que es lo que el agente lee para elegirla.`)
    }
    if (accion.writes && !accion.permission) {
      // Escribir sin permiso declarado es justo el agujero que no se permite.
      errores.push(`Acción "${accion.name}": modifica datos, así que necesita un permiso declarado.`)
    }
    for (const p of accion.params ?? []) {
      if (!p.name?.trim()) errores.push(`Acción "${accion.name}": un parámetro no tiene nombre.`)
      if (!p.description?.trim()) {
        errores.push(`Acción "${accion.name}", parámetro "${p.name}": falta la descripción.`)
      }
    }
  }

  if (cfg.queryEndpoint && !cfg.queryEndpoint.startsWith('/')) {
    errores.push('queryEndpoint debe ser una ruta de tu propio servidor, empezando por "/".')
  }

  return errores
}

/**
 * ¿Es válida esta acción contra lo declarado?
 *
 * La usa Handeia antes de reenviarle nada al espacio. Es la lista blanca en
 * ejecución: aunque el modelo se invente una acción o un argumento fuera de
 * rango, aquí se detiene.
 */
export function validateActionCall(
  llamada: { name: string; args?: Record<string, unknown> | undefined },
  declaradas: AgentAction[],
): { ok: true; action: AgentAction } | { ok: false; reason: string } {
  const action = declaradas.find(a => a.name === llamada.name)
  if (!action) return { ok: false, reason: `La acción "${llamada.name}" no está declarada por el espacio.` }

  const args = llamada.args ?? {}
  for (const p of action.params ?? []) {
    const v = args[p.name]
    if (v === undefined || v === null) {
      if (p.required) return { ok: false, reason: `Falta el parámetro obligatorio "${p.name}".` }
      continue
    }
    if (typeof v !== p.type) {
      return { ok: false, reason: `El parámetro "${p.name}" debe ser ${p.type}.` }
    }
    if (p.enum && !p.enum.includes(String(v))) {
      return { ok: false, reason: `El parámetro "${p.name}" no admite el valor "${String(v)}".` }
    }
  }

  // Nada fuera de lo declarado: un argumento de más puede ser un intento de
  // colar algo que el espacio no espera.
  const permitidos = new Set((action.params ?? []).map(p => p.name))
  for (const k of Object.keys(args)) {
    if (!permitidos.has(k)) return { ok: false, reason: `El parámetro "${k}" no está declarado.` }
  }

  return { ok: true, action }
}
