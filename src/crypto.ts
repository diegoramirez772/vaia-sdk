/**
 * HMAC-SHA256 utilities using the Web Crypto API.
 * Zero dependencies — works in Node 18+, Edge, Bun, Deno, browsers.
 */

const enc = new TextEncoder()

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
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

/** Signs `data` with HMAC-SHA256, returns lowercase hex. */
export async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await importHMACKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time HMAC-SHA256 verification.
 * Uses Web Crypto `verify` to avoid timing attacks.
 */
export async function hmacVerify(secret: string, data: string, hexSignature: string): Promise<boolean> {
  try {
    const key = await importHMACKey(secret)
    const sigBytes = hexToBytes(hexSignature)
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data))
  } catch {
    return false
  }
}
