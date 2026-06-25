/**
 * handeia.verify — verifies an incoming invoke call from Handeia.
 * Same HMAC protocol as gandia.verify but with Handeia-specific headers
 * and a HandeiaContext (user personal, no tenant).
 */

import { hmacVerify } from '../crypto.js'
import { VAIAError, type HandeiaContext, type Surface } from '../types.js'

const REPLAY_WINDOW_MS  = 5 * 60 * 1000
const PROBE_HEADER      = 'x-handeia-probe'

export interface HandeiaVerifyResult {
  ctx: HandeiaContext
  raw: string
}

/**
 * Call at the top of your `/api/handeia/invoke` route handler.
 * Throws VAIAError if the signature is invalid or the timestamp is stale.
 */
export async function verify(request: Request, secret: string): Promise<HandeiaVerifyResult> {
  const rawBody = await request.text()
  const headers = request.headers

  const sigHeader = headers.get('x-handeia-signature') ?? ''
  const tsHeader  = headers.get('x-handeia-timestamp') ?? ''
  const callId    = headers.get('x-handeia-call-id')   ?? ''

  if (headers.get(PROBE_HEADER) === '1') {
    return { ctx: buildProbeCtx(callId), raw: rawBody }
  }

  if (!sigHeader || !tsHeader) {
    throw new VAIAError(
      'Faltan headers de autenticación (X-Handeia-Signature, X-Handeia-Timestamp)',
      'MISSING_AUTH_HEADERS',
      401,
    )
  }

  const ts = parseInt(tsHeader, 10)
  if (isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    throw new VAIAError('Timestamp fuera de ventana (±5 min)', 'TIMESTAMP_OUT_OF_RANGE', 401)
  }

  const hexSig     = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader
  const signedData = `${tsHeader}.${rawBody}`
  const valid      = await hmacVerify(secret, signedData, hexSig)

  if (!valid) {
    throw new VAIAError('Firma HMAC inválida', 'HMAC_INVALID', 401)
  }

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

function parseContext(body: unknown, fallbackCallId: string): HandeiaContext {
  if (typeof body !== 'object' || body === null) {
    throw new VAIAError('Body inválido', 'BODY_INVALID', 400)
  }

  const b = body as Record<string, unknown>
  const user = (b['user'] ?? {}) as Record<string, unknown>
  const ctx  = (b['context'] ?? {}) as Record<string, unknown>

  return {
    capability_id: s(b['capability_id']),
    call_id:       s(b['call_id'], fallbackCallId),
    user: {
      id:    s(user['id']),
      email: sOpt(user['email']),
      name:  sOpt(user['name']),
    },
    permissions: arr(b['permissions']),
    trigger:     s(ctx['trigger'], 'haia_invoke') as HandeiaContext['trigger'],
    surface:     s(ctx['surface'], 'data') as Surface,
    query:       sOpt(ctx['query']),
  }
}

function buildProbeCtx(callId: string): HandeiaContext {
  return {
    capability_id: '__probe__',
    call_id:       callId || crypto.randomUUID(),
    user:          { id: '__probe__' },
    permissions:   [],
    trigger:       'haia_invoke',
    surface:       'data',
  }
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function sOpt(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function isProbe(request: Request): boolean {
  return request.headers.get(PROBE_HEADER) === '1'
}
