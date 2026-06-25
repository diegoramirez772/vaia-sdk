/**
 * defineCapability — declares a VAIA capability in code.
 *
 * This is both a type-safety layer (catches config errors at compile time)
 * and the source of truth for `npx vaia manifest` (generates gandia.manifest.json).
 *
 * The Shazam engine detects `defineCapability` in your code and reads the
 * config with 100% confidence — no manual confirmation needed in the portal.
 *
 * Usage (vaia.config.ts in project root):
 *   import { defineCapability } from '@vaia/sdk'
 *
 *   export default defineCapability({
 *     id: 'mx.monitor-riesgo-academico',
 *     name: 'Monitor de Riesgo Académico',
 *     version: '1.0.0',
 *     target: 'gandia',
 *     type: 'app',
 *     level: 'artefacto',
 *     sector: 'educacion',
 *     surfaces: {
 *       card:  { endpoint: '/api/gandia/invoke' },
 *       table: { endpoint: '/api/gandia/invoke' },
 *       text:  { endpoint: '/api/gandia/invoke' },
 *     },
 *     permissions: ['read:students', 'read:grades', 'write:alerts'],
 *     risk: 'medium',
 *   })
 */

import type { CapabilityConfig, EcoTarget, Risk, Surface } from './types.js'

export type { CapabilityConfig }

export interface VAIAManifest {
  schema: '1.0'
  capability_id: string
  name: string
  version: string
  target: EcoTarget | EcoTarget[]
  type: string
  level?: string | undefined
  sector: string
  surfaces: string[]
  permissions: string[]
  risk: Risk
  has_own_auth: boolean
  stores_data: boolean
  trains_models: boolean
  requires_consent: boolean
  description?: string | undefined
  tags?: string[] | undefined
  linked: boolean
  generated_by: '@vaia/sdk'
  generated_at: string
}

/** Validates and returns the capability config. Throws if required fields are missing. */
export function defineCapability(config: CapabilityConfig): CapabilityConfig {
  const required: Array<keyof CapabilityConfig> = ['id', 'name', 'version', 'target', 'type', 'sector', 'permissions', 'risk']
  for (const key of required) {
    if (config[key] === undefined || config[key] === '') {
      throw new Error(`[@vaia/sdk] defineCapability: campo requerido faltante: '${key}'`)
    }
  }

  if (!config.id.includes('.')) {
    throw new Error(
      `[@vaia/sdk] defineCapability: 'id' debe usar formato reverse-domain (ej. 'mx.mi-capacidad'). Recibido: '${config.id}'`,
    )
  }

  if (Object.keys(config.surfaces).length === 0) {
    throw new Error(`[@vaia/sdk] defineCapability: 'surfaces' no puede estar vacío. Define al menos un surface con su endpoint.`)
  }

  return config
}

/** Converts a CapabilityConfig to a gandia.manifest.json object. */
export function toManifest(config: CapabilityConfig): VAIAManifest {
  const surfaces = Object.keys(config.surfaces) as Surface[]

  return {
    schema:           '1.0',
    capability_id:    config.id,
    name:             config.name,
    version:          config.version,
    target:           config.target === 'both' ? ['gandia', 'handeia'] : config.target,
    type:             config.type,
    level:            config.level,
    sector:           config.sector,
    surfaces,
    permissions:      config.permissions,
    risk:             config.risk,
    has_own_auth:     config.has_own_auth ?? false,
    stores_data:      config.stores_data ?? false,
    trains_models:    config.trains_models ?? false,
    requires_consent: config.requires_consent ?? false,
    description:      config.description,
    tags:             config.tags,
    linked:           config.target === 'both',
    generated_by:     '@vaia/sdk',
    generated_at:     new Date().toISOString(),
  }
}
