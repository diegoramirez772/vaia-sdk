/**
 * Minimal HS256 JWT implementation using Web Crypto.
 * No third-party dependencies.
 *
 * CONTRATO DE CODIFICACIÓN (v2)
 * -----------------------------
 * El payload se serializa en UTF-8, como exige RFC 7519 §3. Esto importa
 * porque el token cruza fronteras de lenguaje: lo firma Gandia (TS), lo
 * verifica Nexus (TS) y lo reenvía a ACIPE (Python) — cualquier consumidor
 * que use una librería JWT estándar debe poder leerlo.
 *
 * Antes de v2 se usaba btoa()/atob(), que tratan cada carácter como UN byte
 * (latin1). Dos consecuencias:
 *   - Caracteres 128..255 (é, Ñ) salían mal para cualquier lector estándar.
 *     Entre piezas del propio SDK no se notaba, porque el error era simétrico.
 *   - Caracteres >255 (CJK, emoji, U+FFFD) hacían LANZAR a btoa(), tumbando
 *     la firma. Un estudiante con la Ñ corrupta en el nombre no pudo entrar a
 *     su Espacio por esto, y el error salió reportado como "servicio caído".
 *
 * MIGRACIÓN: jwtVerify lee ambos formatos. Los tokens nuevos llevan el claim
 * `v: 2`; su ausencia significa v1 (latin1) y se decodifica como tal. Así la
 * transición no invalida ningún token en vuelo — ver CHANGELOG.
 */

import { VAIAError } from './types.js'

const enc = new TextEncoder()
/** fatal:true = si los bytes no son UTF-8 válido, lanza en vez de meter U+FFFD
 *  en silencio. Es justo ese "en silencio" el que escondió el bug original. */
const utf8Strict = new TextDecoder('utf-8', { fatal: true })
const utf8Loose  = new TextDecoder('utf-8')
const latin1     = new TextDecoder('latin1')

/** Versión del formato de payload. Los tokens la llevan como claim `v`. */
export const JWT_PAYLOAD_VERSION = 2

// ── base64url ───────────────────────────────────────────────────────────────
// Se separan bytes y texto a propósito. Tener UNA función para ambos fue la
// causa de raíz: la firma (bytes crudos) y el payload (texto) necesitan
// tratamientos distintos, y compartirlos forzó latin1 sobre el texto.

function bytesToB64url(bytes: Uint8Array): string {
  // Se arma por trozos en vez de String.fromCharCode(...bytes): el spread de
  // un arreglo grande revienta la pila de llamadas.
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// El ArrayBuffer se crea explícito para que el tipo sea Uint8Array<ArrayBuffer>
// y no Uint8Array<ArrayBufferLike>: Web Crypto no acepta buffers compartidos.
function b64urlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  const bin = atob(pad ? padded + '='.repeat(4 - pad) : padded)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Texto → base64url en UTF-8. Nunca lanza, sea cual sea el carácter. */
function textToB64url(text: string): string {
  return bytesToB64url(enc.encode(text))
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

const HEADER = textToB64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

/** Creates a signed HS256 JWT. */
export async function jwtSign(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const body     = textToB64url(JSON.stringify({ ...payload, v: JWT_PAYLOAD_VERSION }))
  const unsigned = `${HEADER}.${body}`
  const key      = await importHMACKey(secret)
  const sig      = await crypto.subtle.sign('HMAC', key, enc.encode(unsigned))
  return `${unsigned}.${bytesToB64url(new Uint8Array(sig))}`
}

/**
 * Decodifica el payload aceptando ambos formatos (lector tolerante).
 *
 * Se lee primero en latin1 —que nunca lanza— solo para poder mirar el claim
 * `v` y decidir. Las llaves y la estructura del JSON son ASCII, así que
 * sobreviven a cualquiera de las dos lecturas; lo único que puede verse mal
 * en ese primer paso son los valores, y ese texto se descarta si resulta v2.
 */
function decodePayload(body: string): Record<string, unknown> {
  const bytes = b64urlToBytes(body)

  let sonda: Record<string, unknown>
  try {
    sonda = JSON.parse(latin1.decode(bytes)) as Record<string, unknown>
  } catch {
    throw new VAIAError('JWT payload inválido', 'JWT_PAYLOAD_INVALID', 401)
  }

  const version = typeof sonda['v'] === 'number' ? (sonda['v'] as number) : 1
  if (version < 2) return sonda // v1: latin1 era el formato correcto entonces

  try {
    return JSON.parse(utf8Strict.decode(bytes)) as Record<string, unknown>
  } catch {
    // Marcado como v2 pero los bytes no son UTF-8 válido: se degrada a una
    // lectura permisiva antes que rechazarle el acceso a un usuario real.
    try {
      return JSON.parse(utf8Loose.decode(bytes)) as Record<string, unknown>
    } catch {
      throw new VAIAError('JWT payload inválido', 'JWT_PAYLOAD_INVALID', 401)
    }
  }
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

  // La firma se valida SIEMPRE antes de tocar el payload: nada de lo que venga
  // dentro debe influir en cómo se decide verificarlo.
  const key = await importHMACKey(secret)
  let valid: boolean
  try {
    valid = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(unsigned))
  } catch {
    throw new VAIAError('JWT malformado', 'JWT_MALFORMED', 401)
  }

  if (!valid) {
    throw new VAIAError('Firma JWT inválida', 'JWT_SIGNATURE_INVALID', 401)
  }

  const payload = decodePayload(body) as T & { exp?: number; iat?: number }

  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
    throw new VAIAError('JWT expirado', 'JWT_EXPIRED', 401)
  }

  return payload as T
}
