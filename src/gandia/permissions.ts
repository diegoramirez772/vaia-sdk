/**
 * gandia.can / gandia.require — permission helpers.
 *
 * Usage:
 *   if (!gandia.can(ctx, 'read:students')) return gandia.respond.error('Forbidden', 403)
 *   gandia.require(ctx, 'write:alerts')   // throws VAIAError 403 if missing
 *
 * Supports wildcard scopes:
 *   'read:*'    — matches all read permissions
 *   'read:students' — exact match
 */

import { VAIAError, type GandiaContext } from '../types.js'

function matches(permission: string, granted: string[]): boolean {
  if (granted.includes(permission)) return true
  // wildcard: 'read:*' grants 'read:students'
  const [action] = permission.split(':')
  return granted.includes(`${action}:*`)
}

/** Returns true if the context has the given permission. */
export function can(ctx: Pick<GandiaContext, 'permissions'>, permission: string): boolean {
  return matches(permission, ctx.permissions)
}

/** Returns true if the context has ALL listed permissions. */
export function canAll(ctx: Pick<GandiaContext, 'permissions'>, ...permissions: string[]): boolean {
  return permissions.every(p => matches(p, ctx.permissions))
}

/** Returns true if the context has ANY of the listed permissions. */
export function canAny(ctx: Pick<GandiaContext, 'permissions'>, ...permissions: string[]): boolean {
  return permissions.some(p => matches(p, ctx.permissions))
}

/** Throws VAIAError 403 if the context does NOT have the given permission. */
export function require(ctx: Pick<GandiaContext, 'permissions'>, permission: string): void {
  if (!matches(permission, ctx.permissions)) {
    throw new VAIAError(
      `Permiso requerido: ${permission}`,
      'PERMISSION_DENIED',
      403,
    )
  }
}

/** Throws VAIAError 403 if the context does NOT have ALL listed permissions. */
export function requireAll(ctx: Pick<GandiaContext, 'permissions'>, ...permissions: string[]): void {
  const missing = permissions.filter(p => !matches(p, ctx.permissions))
  if (missing.length > 0) {
    throw new VAIAError(
      `Permisos requeridos: ${missing.join(', ')}`,
      'PERMISSION_DENIED',
      403,
    )
  }
}
