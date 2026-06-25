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
