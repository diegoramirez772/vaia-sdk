/**
 * gandia.jwt — JWT helpers for iframe auth bypass.
 *
 * When Gandia-7 opens a developer's app as an iframe, it appends:
 *   ?gandia_token=<signed_jwt>
 *
 * The developer verifies the token, extracts the user/tenant claims,
 * and creates a session — skipping their own login page.
 *
 * Usage (server-side):
 *   const claims = await gandia.jwt.verify(token, process.env.GANDIA_KEY_SECRET!)
 *   // → { sub, tenant_id, email, role, permissions, exp, iat }
 *
 * Usage (VAIA-side, when generating tokens for developer iframes):
 *   const token = await gandia.jwt.sign({ sub: userId, tenant_id, ... }, secret, { expiresIn: 3600 })
 */

import { jwtSign, jwtVerify } from '../jwt-utils.js'
import type { GandiaJWTClaims } from '../types.js'

export interface GandiaJWTSignInput {
  sub: string         // user_id
  tenant_id: string
  email?: string | undefined
  role?: string | undefined
  permissions?: string[] | undefined
}

export interface SignOpts {
  /** Seconds until expiry. Default: 3600 (1 hour). */
  expiresIn?: number | undefined
}

const DEFAULT_EXPIRES_IN = 3600

/** Signs a new Gandia iframe JWT. Typically called by Gandia-7, not by the developer. */
export async function sign(
  input: GandiaJWTSignInput,
  secret: string,
  opts: SignOpts = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return jwtSign(
    {
      ...input,
      permissions: input.permissions ?? [],
      iat: now,
      exp: now + (opts.expiresIn ?? DEFAULT_EXPIRES_IN),
    },
    secret,
  )
}

/** Verifies a Gandia iframe JWT and returns its claims. Throws VAIAError on failure. */
export async function verify(token: string, secret: string): Promise<GandiaJWTClaims> {
  return jwtVerify<GandiaJWTClaims>(token, secret)
}

/**
 * Extracts `gandia_token` from a URL and verifies it.
 * Convenience for iframe entry-point routes.
 *
 *   const claims = await gandia.jwt.fromUrl(request.url, secret)
 */
export async function fromUrl(url: string | URL, secret: string): Promise<GandiaJWTClaims> {
  const u     = typeof url === 'string' ? new URL(url) : url
  const token = u.searchParams.get('gandia_token')
  if (!token) {
    throw new Error('gandia_token no encontrado en la URL')
  }
  return verify(token, secret)
}
