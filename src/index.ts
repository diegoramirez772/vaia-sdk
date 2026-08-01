/**
 * @vaia/sdk — VAIA Platform Integration SDK
 *
 * Provides two namespaces:
 *   gandia   → Gandia-7 (institutional platform)
 *   handeia  → Handeia (personal platform)
 *
 * Quick start:
 *   import { gandia, handeia, defineCapability, VAIAError } from '@vaia/sdk'
 */

// ─── Platform namespaces ──────────────────────────────────────────────────────

import * as _gandia  from './gandia/index.js'
import * as _handeia from './handeia/index.js'

export const gandia  = _gandia
export const handeia = _handeia

// ─── defineCapability + manifest ─────────────────────────────────────────────

export { defineCapability, toManifest } from './define.js'

// ─── Protocolo de agente ─────────────────────────────────────────────────────
// La superficie que permite que el asistente de Handeia viva dentro de un
// espacio de terceros. El espacio declara qué sabe hacer; Handeia razona.
export {
  AGENT_PROTOCOL_VERSION,
  validateAgentSurface,
  validateActionCall,
  CONNECTOR_OF_OPERATION,
} from './agent.js'
// El círculo, para montar dentro de un espacio. Montaje neutral: no depende
// de React ni de ningún framework, porque el SDK presume de cero dependencias
// y un espacio en Vue o HTML puro tiene el mismo derecho al agente.
export { mountAgent } from './agent-mount.js'

// ─── Las 7 piezas operativas ─────────────────────────────────────────────────
export { validatePieces, requiresApproval, checkAuthority } from './pieces.js'
export type {
  Authority, AuthorityLevel, Consequence,
  EvidenceKind, EvidencePolicy,
  SkillDef, ToolDef, WorkflowDef, AgentDef, PersonalityDef, ModalityDef,
  PiecesConfig,
} from './pieces.js'

// ─── Capacidades que CORREN ──────────────────────────────────────────────────
// El resto del SDK declara y valida; esto ejecuta. Las tres formas de tener una
// capacidad —tuya, de un proyecto existente, o de código abierto vía MCP— se
// ejecutan igual y pasan por la misma puerta de autoridad.
export { capabilities, local, http, mcp, httpTransport } from './capabilities.js'
export type {
  Capability, CapabilityCall, CapabilityResult,
  LocalCapabilityOptions, HttpCapabilityOptions, MCPCapabilityOptions, MCPTransport,
} from './capabilities.js'

// ─── Ecosistemas y bucle del agente ──────────────────────────────────────────
// Que las piezas sueltas dejen de ser islas. El bucle corre con el modelo que
// ponga el desarrollador: el SDK no trae ninguno.
export { defineEcosystem, agentLoop } from './ecosystem.js'
export type {
  Ecosystem, EcosystemConfig, ModelFn, AgentLoopOptions, AgentTurn,
} from './ecosystem.js'

// ─── Puente MCP ──────────────────────────────────────────────────────────────
// MCP aporta catálogo y transporte; VAIA aporta la autoridad que MCP no sabe
// expresar. Importar algo de internet nunca concede permisos por sí solo.
export { fromMCPTool, toMCPTool, toMCPTools } from './mcp.js'
export type { MCPTool, MCPInputSchema } from './mcp.js'
export type { MountAgentOptions, AgentHandle } from './agent-mount.js'

export type {
  ConnectorNeed,
  ConnectorOperation,
  ConnectorRequest,
  ConnectorResult,
  AgentAction,
  AgentActionParam,
  AgentActionResult,
  AgentEvidence,
  AgentSpaceContext,
  AgentSurfaceConfig,
  AgentTurnRequest,
  AgentTurnResponse,
} from './agent.js'
export type { CapabilityConfig, VAIAManifest } from './define.js'

// ─── Shared error class ───────────────────────────────────────────────────────

export { VAIAError } from './types.js'

// ─── All types (re-exported for consumer convenience) ─────────────────────────

export type {
  // Core enums
  PublishType,
  EcoTarget,
  NodeType,
  Risk,
  Surface,
  OutputType,

  // Contexts
  GandiaContext,
  GandiaTenant,
  GandiaUser,
  HandeiaContext,
  HandeiaUser,

  // JWT claims
  GandiaJWTClaims,
  HandeiaJWTClaims,

  // Response payloads
  CardPayload,
  TablePayload,
  WidgetPayload,
  ActionPayload,
  AuditRecord,
  RespondOpts,
  SurfaceHandlers,

  // Response types
  VAIAResponse,
  CardResponse,
  TableResponse,
  TextResponse,
  WidgetResponse,
  ActionResponse,
  DataResponse,
  ErrorResponse,
} from './types.js'
