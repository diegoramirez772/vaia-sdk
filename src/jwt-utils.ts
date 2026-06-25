/**
 * Minimal HS256 JWT implementation using Web Crypto.
 * No third-party dependencies.
 */

import { VAIAError } from './types.js'

const enc = new TextEncoder()

function b64urlEncode(data: ArrayBuffer | string): string {
  const str =
    typeof data === 'string'
      ? data
      : String.fromCharCode(...new Uint8Array(data))
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  return atob(pad ? padded + '='.repeat(4 - pad) : padded)
}

async function importHMACKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

const HEADER = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

/** Creates a signed HS256 JWT. */
export async function jwtSign(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const body    = b64urlEncode(JSON.stringify(payload))
  const unsigned = `${HEADER}.${body}`
  const key     = await importHMACKey(secret)
  const sig     = await crypto.subtle.sign('HMAC', key, enc.encode(unsigned))
  return `${unsigned}.${b64urlEncode(sig)}`
}

/** Verifies an HS256 JWT and returns its payload. Throws VAIAError on failure. */
export async function jwtVerify<T extends object>(
  token: string,
  secret: string,
): Promise<T> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new VAIAError('JWT malformado', 'JWT_MALFORMED', 401)
  }

  const [header, body, sig] = parts as [string, string, string]
  const unsigned = `${header}.${body}`

  const key = await importHMACKey(secret)
  const sigBytes = Uint8Array.from(b64urlDecode(sig), c => c.charCodeAt(0))
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(unsigned))

  if (!valid) {
    throw new VAIAError('Firma JWT inválida', 'JWT_SIGNATURE_INVALID', 401)
  }

  let payload: T & { exp?: number; iat?: number }
  try {
    payload = JSON.parse(b64urlDecode(body)) as T & { exp?: number; iat?: number }
  } catch {
    throw new VAIAError('JWT payload inválido', 'JWT_PAYLOAD_INVALID', 401)
  }

  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
    throw new VAIAError('JWT expirado', 'JWT_EXPIRED', 401)
  }

  return payload as T
}
