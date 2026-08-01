import type { PiecesConfig } from './pieces.js'
import type { AgentSurfaceConfig } from './agent.js'

// ─── Core enums ───────────────────────────────────────────────────────────────

export type PublishType = 'app' | 'ia' | 'skill' | 'eco'
export type EcoTarget   = 'gandia' | 'handeia' | 'both'
export type NodeType    = 'widget' | 'artefacto' | 'espacio' | 'skill' | 'agente'
export type Risk        = 'low' | 'medium' | 'high'
export type Surface     = 'card' | 'table' | 'text' | 'widget' | 'action' | 'data'
export type OutputType  = Surface

// ─── Gandia context ───────────────────────────────────────────────────────────

export interface GandiaTenant {
  id: string
  name: string
  sector: string
}

export interface GandiaUser {
  id: string
  role: string
  email?: string | undefined
}

/** Context injected by the platform on every invoke call to your server. */
export interface GandiaContext {
  capability_id: string
  call_id: string
  tenant: GandiaTenant
  user: GandiaUser
  permissions: string[]
  trigger: 'user_query' | 'gaia_invoke' | 'event'
  /** Surface the platform wants to render — determines which respond.* to use. */
  surface: Surface
  query?: string | undefined
}

// ─── Handeia context ──────────────────────────────────────────────────────────

export interface HandeiaUser {
  id: string
  email?: string | undefined
  name?: string | undefined
}

/** Context injected by the platform on every invoke call to your server. */
export interface HandeiaContext {
  capability_id: string
  call_id: string
  user: HandeiaUser
  permissions: string[]
  trigger: 'user_action' | 'haia_invoke' | 'schedule'
  /** Surface the platform wants to render. */
  surface: Surface
  query?: string | undefined
}

// ─── JWT claims ───────────────────────────────────────────────────────────────

export interface GandiaJWTClaims {
  sub: string       // user_id
  tenant_id: string
  email?: string | undefined
  role?: string | undefined
  permissions: string[]
  iat: number
  exp: number
}

export interface HandeiaJWTClaims {
  sub: string       // user_id
  email?: string | undefined
  name?: string | undefined
  permissions: string[]
  iat: number
  exp: number
}

// ─── Response payloads ────────────────────────────────────────────────────────

export interface AuditRecord {
  data_sources?: string[] | undefined
  records_accessed?: number | undefined
  [key: string]: unknown
}

export interface RespondOpts {
  call_id?: string | undefined
  audit?: AuditRecord | undefined
}

export interface CardPayload {
  title: string
  value?: string | number | undefined
  unit?: string | undefined
  trend?: 'up' | 'down' | 'neutral' | undefined
  icon?: string | undefined
  subtitle?: string | undefined
  color?: string | undefined
  [key: string]: unknown
}

export interface TablePayload {
  columns: string[] | Array<{ key: string; label: string; type?: string | undefined }>
  rows: Array<Record<string, unknown>>
  total?: number | undefined
  page?: number | undefined
  per_page?: number | undefined
}

export interface WidgetPayload {
  url: string
  height?: number | string | undefined
  width?: number | string | undefined
  meta?: Record<string, unknown> | undefined
}

export interface ActionPayload {
  type: string
  label?: string | undefined
  params?: Record<string, unknown> | undefined
  confirm?: boolean | undefined
  destructive?: boolean | undefined
}

// ─── Typed VAIA response objects (returned by make.*) ────────────────────────

interface BaseVAIAResponse {
  ok: true
  call_id?: string | undefined
  audit?: AuditRecord | undefined
}

export type CardResponse   = BaseVAIAResponse & { output_type: 'card';   data: CardPayload }
export type TableResponse  = BaseVAIAResponse & { output_type: 'table';  data: TablePayload }
export type TextResponse   = BaseVAIAResponse & { output_type: 'text';   text: string; markdown?: boolean | undefined }
export type WidgetResponse = BaseVAIAResponse & { output_type: 'widget'; data: WidgetPayload }
export type ActionResponse = BaseVAIAResponse & { output_type: 'action'; data: ActionPayload }
export type DataResponse   = BaseVAIAResponse & { output_type: 'data';   data: Record<string, unknown> }
export type ErrorResponse  = { ok: false; error: string; code?: string | undefined }

export type VAIAResponse =
  | CardResponse
  | TableResponse
  | TextResponse
  | WidgetResponse
  | ActionResponse
  | DataResponse

// ─── Surface handler map ──────────────────────────────────────────────────────

export type SurfaceHandlers = Partial<{
  card:   () => CardPayload | Promise<CardPayload>
  table:  () => TablePayload | Promise<TablePayload>
  text:   () => string | Promise<string>
  widget: () => WidgetPayload | Promise<WidgetPayload>
  action: () => ActionPayload | Promise<ActionPayload>
  data:   () => Record<string, unknown> | Promise<Record<string, unknown>>
}>

// ─── Capability definition ────────────────────────────────────────────────────

export interface SurfaceConfig {
  endpoint: string
  description?: string | undefined
}

export interface CapabilityConfig {
  /** Unique capability ID — reverse domain: 'mx.mi-capacidad' */
  id: string
  name: string
  version: string
  /** Which VAIA platform(s) this capability targets. */
  target: EcoTarget
  type: PublishType
  level?: 'widget' | 'artefacto' | 'espacio' | undefined
  sector: string
  /** Which surfaces the capability can respond to, and their invoke endpoint. */
  surfaces: Partial<Record<Surface, SurfaceConfig>>
  /**
   * Superficie de AGENTE — el asistente de Handeia dentro de este espacio.
   * El espacio declara qué sabe hacer; Handeia razona y decide. Ver agent.ts.
   */
  agent?: AgentSurfaceConfig | undefined
  /**
   * Las 7 piezas operativas: skills, herramientas, workflows, agentes,
   * personalidades y modalidades. Con su autoridad y su evidencia. Ver pieces.ts.
   */
  pieces?: PiecesConfig | undefined
  permissions: string[]
  risk: Risk
  description?: string | undefined
  tags?: string[] | undefined
  /** Set to true if your app has its own login (triggers JWT bypass flow). */
  has_own_auth?: boolean | undefined
  stores_data?: boolean | undefined
  trains_models?: boolean | undefined
  requires_consent?: boolean | undefined
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class VAIAError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 500,
  ) {
    super(message)
    this.name = 'VAIAError'
  }
}
