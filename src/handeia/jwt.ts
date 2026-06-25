/**
 * handeia.jwt — JWT helpers for Handeia iframe auth bypass.
 * Same pattern as gandia.jwt but for personal context (no tenant).
 */

import { jwtSign, jwtVerify } from '../jwt-utils.js'
import type { HandeiaJWTClaims } from '../types.js'

export interface HandeiaJWTSignInput {
  sub: string         // user_id
  email?: string | undefined
  name?: string | undefined
  permissions?: string[] | undefined
}

export interface SignOpts {
  expiresIn?: number | undefined
}

const DEFAULT_EXPIRES_IN = 3600

export async function sign(
  input: HandeiaJWTSignInput,
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

export async function verify(token: string, secret: string): Promise<HandeiaJWTClaims> {
  return jwtVerify<HandeiaJWTClaims>(token, secret)
}

/** Extracts and verifies `handeia_token` from a URL. */
export async function fromUrl(url: string | URL, secret: string): Promise<HandeiaJWTClaims> {
  const u     = typeof url === 'string' ? new URL(url) : url
  const token = u.searchParams.get('handeia_token')
  if (!token) throw new Error('handeia_token no encontrado en la URL')
  return verify(token, secret)
}
