/**
 * Las 7 piezas operativas del ecosistema VAIA.
 *
 *   Skills          → capacidades atómicas verificadas
 *   Agentes         → entidades persistentes con objetivos y autoridad
 *   Herramientas    → acciones permitidas en el mundo real
 *   Workflows       → procesos multi-paso
 *   Modalidades     → cómo entra y sale la información
 *   Personalidades  → estilos de comunicación
 *   Permisos        → quién puede qué, sobre qué, cuándo
 *
 * Este archivo NO las implementa: las declara. El motor que las ejecuta es
 * privado; lo público es la forma de describirlas y las reglas que deben
 * cumplir para poder existir.
 *
 * ── Lo que separa esto de otros SDK de agentes ───────────────────────────
 * Casi todos saben decir "el agente puede llamar a esta función". Ninguno sabe
 * decir "puede hasta $500 solo, arriba de eso pregunta, y nunca puede borrar".
 * Esa es la parte que aquí es obligatoria, no opcional: un agente sin autoridad
 * declarada ni siquiera compila.
 */

// ─── Autoridad ───────────────────────────────────────────────────────────────

/**
 * Qué tan lejos puede llegar algo por su cuenta.
 *
 * No es un booleano "puede o no puede". La autoridad se delega como a una
 * persona: por categoría, por monto y por consecuencia.
 */
export type AuthorityLevel =
  /** Lo hace solo. Reservado a lo que no tiene consecuencia irreversible. */
  | 'autonoma'
  /** Lo prepara, pero un humano aprueba antes de que ocurra. */
  | 'requiere_aprobacion'
  /** No puede, nunca, aunque el usuario lo pida. */
  | 'prohibida'

/** Qué tan grave es equivocarse aquí. Decide cuánta ceremonia merece. */
export type Consequence = 'reversible' | 'costosa' | 'irreversible'

export interface Authority {
  level: AuthorityLevel
  consequence: Consequence
  /** Tope de gasto por ejecución, si mueve dinero. */
  maxAmount?: number | undefined
  /** Moneda del tope. Obligatoria si hay tope: "500" sin moneda no significa nada. */
  currency?: string | undefined
  /** Cuántas veces por hora, como mucho. */
  maxPerHour?: number | undefined
  /** Por qué se delegó así. Se le muestra al usuario cuando concede. */
  rationale?: string | undefined
}

// ─── Evidencia ───────────────────────────────────────────────────────────────

/**
 * De dónde sale lo que el sistema afirma.
 *
 * Es obligatoria en todo lo que produzca una afirmación. Un asistente que no
 * puede decir de dónde sacó algo es un oráculo, y un oráculo no se audita ni
 * se corrige. Este es el pilar de info verificada hecho tipo.
 */
export type EvidenceKind =
  | 'fuente'      // documento, registro, archivo
  | 'calculo'     // derivado de datos, con su método
  | 'usuario'     // lo dijo el propio usuario
  | 'externo'     // vino de un servicio conectado
  | 'inferencia'  // lo dedujo el modelo — el único que NO es un hecho

export interface EvidencePolicy {
  /** Tipos admitidos para respaldar una afirmación de esta pieza. */
  accepts: EvidenceKind[]
  /**
   * Si es true, una respuesta sin evidencia se rechaza en vez de entregarse.
   * Debe estar en true en cualquier cosa que informe decisiones reales.
   */
  required: boolean
}

// ─── Las piezas ──────────────────────────────────────────────────────────────

interface PiezaBase {
  /** Estable, en minúsculas con guion bajo. */
  name: string
  /** Qué es y cuándo usarlo. Es lo que lee el modelo para decidir. */
  description: string
}

/** Capacidad atómica y verificable. El verbo del sistema. */
export interface SkillDef extends PiezaBase {
  /** Qué necesita recibir. */
  inputs?: { name: string; type: 'string' | 'number' | 'boolean'; required?: boolean | undefined }[] | undefined
  /** Cómo se comprueba que salió bien. Sin esto no es "verificada". */
  verification?: string | undefined
  evidence?: EvidencePolicy | undefined
}

/** Acción sobre el mundo real. Siempre lleva autoridad. */
export interface ToolDef extends PiezaBase {
  authority: Authority
  /** Permiso que el usuario debe conceder. */
  permission: string
}

/** Proceso multi-paso. La autoridad del conjunto no puede ser menor que la
 *  del paso más grave que contiene. */
export interface WorkflowDef extends PiezaBase {
  steps: { skill?: string | undefined; tool?: string | undefined; description: string }[]
  authority: Authority
}

/** Cómo entra y sale la información. */
export type ModalityDef = 'texto' | 'voz' | 'imagen' | 'documento' | 'sensor'

/** Estilo de comunicación. No es adorno: un agente reconocible es un agente
 *  con el que se sostiene una relación. */
export interface PersonalityDef {
  name: string
  tone: 'formal' | 'cercano' | 'tecnico' | 'calido' | 'directo'
  /** Rasgos que lo hacen reconocible. */
  traits?: string[] | undefined
  /** Lo que NUNCA dice o hace, aunque se lo pidan. */
  neverDoes?: string[] | undefined
}

/** Entidad persistente con objetivos, autoridad y memoria. */
export interface AgentDef extends PiezaBase {
  /** Por qué existe. Si no se puede escribir, el agente no debería existir. */
  purpose: string
  personality?: PersonalityDef | undefined
  /** Skills que conoce. */
  skills?: string[] | undefined
  /** Herramientas que puede invocar. */
  tools?: string[] | undefined
  workflows?: string[] | undefined
  modalities?: ModalityDef[] | undefined
  /** Techo de autoridad del agente. Ninguna herramienta suya puede superarlo. */
  authority: Authority
  evidence?: EvidencePolicy | undefined
}

/** Todo lo que una capacidad declara sobre sus piezas. */
export interface PiecesConfig {
  skills?: SkillDef[] | undefined
  tools?: ToolDef[] | undefined
  workflows?: WorkflowDef[] | undefined
  agents?: AgentDef[] | undefined
  personalities?: PersonalityDef[] | undefined
  modalities?: ModalityDef[] | undefined
}

// ─── Validación ──────────────────────────────────────────────────────────────

const NOMBRE = /^[a-z][a-z0-9_]{1,48}$/

const ORDEN: Record<AuthorityLevel, number> = {
  prohibida: 0,
  requiere_aprobacion: 1,
  autonoma: 2,
}

/**
 * Valida las piezas al DECLARARLAS.
 *
 * Corre en el escritorio del desarrollador, no en producción. Las reglas que
 * impone no son de estilo: cada una cierra una forma concreta de causar daño.
 */
export function validatePieces(cfg: PiecesConfig): string[] {
  const errores: string[] = []
  const vistos = new Set<string>()

  const revisarNombre = (pieza: string, name: string) => {
    if (!NOMBRE.test(name)) errores.push(`${pieza} "${name}": el nombre debe ser minúsculas, números o guion bajo.`)
    if (vistos.has(name)) errores.push(`"${name}": hay dos piezas con el mismo nombre.`)
    vistos.add(name)
  }

  const revisarAutoridad = (pieza: string, a: Authority) => {
    // Lo irreversible NUNCA es autónomo. Es la regla que evita el titular de
    // "la IA borró la base de datos": no depende de que el modelo se porte
    // bien, depende de que no se pueda declarar.
    if (a.consequence === 'irreversible' && a.level === 'autonoma') {
      errores.push(`${pieza}: una acción irreversible no puede ser autónoma — como mínimo requiere aprobación.`)
    }
    if (a.maxAmount !== undefined) {
      if (a.maxAmount <= 0) errores.push(`${pieza}: el tope de gasto debe ser mayor que cero.`)
      // "500" sin moneda no significa nada, y adivinar la moneda es como se
      // pierde dinero de verdad.
      if (!a.currency) errores.push(`${pieza}: hay tope de gasto pero no se declaró la moneda.`)
    }
    if (a.consequence === 'costosa' && a.level === 'autonoma' && a.maxAmount === undefined) {
      errores.push(`${pieza}: es autónoma y cuesta dinero, así que necesita un tope declarado.`)
    }
  }

  for (const s of cfg.skills ?? []) {
    revisarNombre('Skill', s.name)
    if (!s.description?.trim()) errores.push(`Skill "${s.name}": falta la descripción, que es lo que el modelo lee para elegirla.`)
    if (s.evidence?.required && (s.evidence.accepts?.length ?? 0) === 0) {
      errores.push(`Skill "${s.name}": exige evidencia pero no declara qué tipos acepta.`)
    }
  }

  for (const t of cfg.tools ?? []) {
    revisarNombre('Herramienta', t.name)
    if (!t.description?.trim()) errores.push(`Herramienta "${t.name}": falta la descripción.`)
    // Una herramienta toca el mundo real. Sin permiso declarado no hay a quién
    // pedirle consentimiento ni a quién revocárselo.
    if (!t.permission?.trim()) errores.push(`Herramienta "${t.name}": toca el mundo real, así que necesita un permiso declarado.`)
    revisarAutoridad(`Herramienta "${t.name}"`, t.authority)
  }

  for (const w of cfg.workflows ?? []) {
    revisarNombre('Workflow', w.name)
    if ((w.steps?.length ?? 0) === 0) errores.push(`Workflow "${w.name}": no tiene pasos.`)
    revisarAutoridad(`Workflow "${w.name}"`, w.authority)
  }

  const porNombre = new Map((cfg.tools ?? []).map(t => [t.name, t]))

  for (const a of cfg.agents ?? []) {
    revisarNombre('Agente', a.name)
    if (!a.purpose?.trim()) {
      // Si no se puede escribir para qué existe, no debería existir.
      errores.push(`Agente "${a.name}": falta el propósito — para qué existe.`)
    }
    revisarAutoridad(`Agente "${a.name}"`, a.authority)

    for (const nombreTool of a.tools ?? []) {
      const tool = porNombre.get(nombreTool)
      if (!tool) {
        errores.push(`Agente "${a.name}": usa la herramienta "${nombreTool}", que no está declarada.`)
        continue
      }
      // El agente es el techo. Sin esto, se podría declarar un agente
      // limitado y colarle una herramienta que hace lo que él no puede.
      if (ORDEN[tool.authority.level] > ORDEN[a.authority.level]) {
        errores.push(
          `Agente "${a.name}": su herramienta "${nombreTool}" tiene más autoridad que él. ` +
          `Ninguna pieza puede superar el techo de su agente.`,
        )
      }
    }
  }

  return errores
}

/** ¿Puede esta pieza actuar sola, o hay que preguntarle al humano? */
export function requiresApproval(a: Authority): boolean {
  return a.level !== 'autonoma'
}

/**
 * ¿Alcanza la autoridad para ESTA ejecución concreta?
 *
 * La declaración dice el techo; esto revisa el caso puntual, que es donde
 * de verdad se decide.
 */
export function checkAuthority(
  a: Authority,
  intento: { amount?: number | undefined; currency?: string | undefined } = {},
): { ok: true } | { ok: false; reason: string } {
  if (a.level === 'prohibida') return { ok: false, reason: 'Esta acción está prohibida para esta pieza.' }

  if (intento.amount !== undefined) {
    if (a.maxAmount === undefined) return { ok: false, reason: 'Mueve dinero pero no hay tope declarado.' }
    if (intento.currency && a.currency && intento.currency !== a.currency) {
      // Comparar montos de monedas distintas es como se autoriza 100 veces
      // más de lo que se creía.
      return { ok: false, reason: `Moneda distinta a la declarada (${a.currency}).` }
    }
    if (intento.amount > a.maxAmount) {
      return { ok: false, reason: `Excede el tope declarado (${a.maxAmount} ${a.currency ?? ''}).`.trim() }
    }
  }

  return { ok: true }
}
