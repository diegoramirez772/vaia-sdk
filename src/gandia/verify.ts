/**
 * gandia.verify — verifies an incoming invoke call from Gandia-7.
 *
 * Checks:
 *   1. X-Gandia-Signature (HMAC-SHA256 over timestamp + "." + raw body)
 *   2. X-Gandia-Timestamp within ±5 minutes (replay attack prevention)
 *   3. Parses and types the body as GandiaContext
 *
 * Usage:
 *   const { ctx } = await verify(request, process.env.GANDIA_KEY_SECRET!)
 */

import { hmacVerify } from '../crypto.js'
import { VAIAError, type GandiaContext, type Surface } from '../types.js'

const REPLAY_WINDOW_MS = 5 * 60 * 1000   // 5 minutes
const PROBE_HEADER     = 'x-gandia-probe'

/** Raw body of the invoke call. Returned alongside ctx so you don't re-read the stream. */
export interface VerifyResult {
  ctx: GandiaContext
  raw: string
}

/**
 * Call at the top of your `/api/gandia/invoke` route handler.
 * Throws VAIAError if the signature is invalid or the timestamp is stale.
 */
export async function verify(request: Request, secret: string): Promise<VerifyResult> {
  const rawBody  = await request.text()
  const headers  = request.headers

  const sigHeader  = headers.get('x-gandia-signature')  ?? ''
  const tsHeader   = headers.get('x-gandia-timestamp')  ?? ''
  const callId     = headers.get('x-gandia-call-id')    ?? ''

  // Health probe from test-connection — no signature required
  if (headers.get(PROBE_HEADER) === '1') {
    return { ctx: buildProbeCtx(callId), raw: rawBody }
  }

  if (!sigHeader || !tsHeader) {
    throw new VAIAError(
      'Faltan headers de autenticación (X-Gandia-Signature, X-Gandia-Timestamp)',
      'MISSING_AUTH_HEADERS',
      401,
    )
  }

  // Replay attack check
  const ts = parseInt(tsHeader, 10)
  if (isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    throw new VAIAError('Timestamp fuera de ventana (±5 min)', 'TIMESTAMP_OUT_OF_RANGE', 401)
  }

  // Strip "sha256=" prefix if present
  const hexSig = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader

  // HMAC verification — constant-time via Web Crypto
  const signedData = `${tsHeader}.${rawBody}`
  const valid = await hmacVerify(secret, signedData, hexSig)
  if (!valid) {
    throw new VAIAError('Firma HMAC inválida', 'HMAC_INVALID', 401)
  }

  // Parse body
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new VAIAError('Body no es JSON válido', 'BODY_PARSE_ERROR', 400)
  }

  const ctx = parseContext(body, callId)
  return { ctx, raw: rawBody }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseContext(body: unknown, fallbackCallId: string): GandiaContext {
  if (typeof body !== 'object' || body === null) {
    throw new VAIAError('Body inválido', 'BODY_INVALID', 400)
  }

  const b = body as Record<string, unknown>

  return {
    capability_id: str(b, 'capability_id'),
    call_id:       str(b, 'call_id', fallbackCallId),
    tenant: {
      id:     nestedStr(b, 'tenant', 'id'),
      name:   nestedStr(b, 'tenant', 'name'),
      sector: nestedStr(b, 'tenant', 'sector'),
    },
    user: {
      id:    nestedStr(b, 'user', 'id'),
      role:  nestedStr(b, 'user', 'role'),
      email: nestedStrOpt(b, 'user', 'email'),
    },
    permissions: arr(b, 'permissions'),
    trigger:     str(b, 'context.trigger', 'gaia_invoke') as GandiaContext['trigger'],
    surface:     str(b, 'context.surface', 'data') as Surface,
    query:       nestedStrOpt(b, 'context', 'query'),
  }
}

function buildProbeCtx(callId: string): GandiaContext {
  return {
    capability_id: '__probe__',
    call_id:       callId || crypto.randomUUID(),
    tenant:        { id: '__probe__', name: '__probe__', sector: '__probe__' },
    user:          { id: '__probe__', role: '__probe__' },
    permissions:   [],
    trigger:       'gaia_invoke',
    surface:       'data',
  }
}

function str(obj: Record<string, unknown>, key: string, fallback = ''): string {
  // Support dot notation: 'context.trigger'
  const parts = key.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (typeof cur !== 'object' || cur === null) return fallback
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : fallback
}

function nestedStr(
  obj: Record<string, unknown>,
  parent: string,
  key: string,
  fallback = '',
): string {
  const p = obj[parent]
  if (typeof p !== 'object' || p === null) return fallback
  const v = (p as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : fallback
}

function nestedStrOpt(
  obj: Record<string, unknown>,
  parent: string,
  key: string,
): string | undefined {
  const p = obj[parent]
  if (typeof p !== 'object' || p === null) return undefined
  const v = (p as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : undefined
}

function arr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

/** Quick check — use before calling verify() if you want to short-circuit probes. */
export function isProbe(request: Request): boolean {
  return request.headers.get(PROBE_HEADER) === '1'
}
