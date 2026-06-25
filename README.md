# @vaia/sdk

VAIA Platform Integration SDK — connect your app, agent, or skill to [Gandia-7](https://gandia7.com) and [Handeia](https://handeia.com).

Zero runtime dependencies · Works in Node 18+, Edge, Bun, Deno · TypeScript-first

---

## Install

```bash
npm install @vaia/sdk
```

---

## Quick start (Next.js — Gandia-7)

```ts
// app/api/gandia/invoke/route.ts
import { gandia, VAIAError } from '@vaia/sdk'

export const runtime = 'edge'

export async function POST(req: Request) {
  try {
    const { ctx } = await gandia.verify(req, process.env.GANDIA_KEY_SECRET!)
    gandia.require(ctx, 'read:students')

    const data = await myDb.getStudents(ctx.tenant.id)

    return gandia.respond.surface(ctx.surface, {
      card:  () => ({ title: 'Alumnos', value: data.length }),
      table: () => ({ columns: ['nombre', 'riesgo'], rows: data }),
      text:  () => `${data.length} alumnos en ${ctx.tenant.name}`,
    })
  } catch (err) {
    if (err instanceof VAIAError) return gandia.respond.error(err.message, err.status)
    throw err
  }
}
```

---

## API Reference

### `gandia.verify(request, secret)`

Verifies the HMAC-SHA256 signature on an incoming invoke call from Gandia-7.

- Checks `X-Gandia-Signature`, `X-Gandia-Timestamp` (replay window ±5 min)
- Returns `{ ctx: GandiaContext, raw: string }`
- Throws `VAIAError` (status 401) if invalid

```ts
const { ctx } = await gandia.verify(req, process.env.GANDIA_KEY_SECRET!)
// ctx.tenant.id, ctx.tenant.name, ctx.tenant.sector
// ctx.user.id, ctx.user.role
// ctx.permissions  → ['read:students', 'read:grades']
// ctx.surface      → 'card' | 'table' | 'text' | 'widget' | 'action' | 'data'
// ctx.query        → user's original question (if trigger = 'user_query')
```

### `gandia.require(ctx, permission)`

Throws `VAIAError` (403) if the context doesn't have the required permission.

```ts
gandia.require(ctx, 'write:alerts')           // single
gandia.requireAll(ctx, 'read:students', 'read:grades')  // all
const ok = gandia.can(ctx, 'read:health')     // boolean check
```

### `gandia.respond.surface(surface, handlers, opts?)`

Multi-surface responder — GAIA tells you which surface it wants via `ctx.surface`.

```ts
return gandia.respond.surface(ctx.surface, {
  card:  () => ({ title: 'Riesgo', value: 72, unit: '%', trend: 'up' }),
  table: () => ({ columns: ['alumno', 'score'], rows }),
  text:  () => `El riesgo promedio es 72%`,
}, { audit: { data_sources: ['supabase:students'], records_accessed: 120 } })
```

Available surfaces: `card` · `table` · `text` · `widget` · `action` · `data`

### `gandia.respond.*` — individual builders

```ts
gandia.respond.card({ title, value, unit, trend, subtitle, color })
gandia.respond.table({ columns, rows, total })
gandia.respond.text(content, { markdown: true })
gandia.respond.widget({ url, height, width })
gandia.respond.action({ type, label, params, confirm })
gandia.respond.data(payload)
gandia.respond.ok()
gandia.respond.error(message, status, code?)
```

All return a `Response` (Web API standard). For Express/Fastify use `gandia.make.*` instead (returns plain JSON object).

### `gandia.jwt.verify(token, secret)`

Verifies a Gandia-7 iframe JWT (`gandia_token` URL param). Use in iframe entry routes to skip your own login.

```ts
// In your iframe entry route:
const claims = await gandia.jwt.fromUrl(request.url, process.env.GANDIA_KEY_SECRET!)
// claims.sub         → user_id
// claims.tenant_id   → institution id
// claims.email       → user email (if available)
// claims.permissions → what the user can do
```

---

### `handeia.*`

Same API as `gandia.*` but for Handeia (personal platform). No tenant — just the user.

```ts
const { ctx } = await handeia.verify(req, process.env.HANDEIA_KEY_SECRET!)
// ctx.user.id, ctx.user.email
// ctx.permissions, ctx.surface, ctx.query
```

---

### `defineCapability(config)`

Declares your capability metadata in code. The Shazam engine reads this with 100% confidence — no manual confirmation needed in the Developer Portal.

```ts
// vaia.config.ts
import { defineCapability } from '@vaia/sdk'

export default defineCapability({
  id: 'mx.monitor-riesgo-academico',  // reverse-domain
  name: 'Monitor de Riesgo Académico',
  version: '1.0.0',
  target: 'gandia',           // 'gandia' | 'handeia' | 'both'
  type: 'app',                // 'app' | 'ia' | 'skill' | 'eco'
  level: 'artefacto',         // 'widget' | 'artefacto' | 'espacio'
  sector: 'educacion',
  surfaces: {
    card:  { endpoint: '/api/gandia/invoke' },
    table: { endpoint: '/api/gandia/invoke' },
    text:  { endpoint: '/api/gandia/invoke' },
  },
  permissions: ['read:students', 'read:grades', 'write:alerts'],
  risk: 'medium',
})
```

Generate `gandia.manifest.json`:

```bash
# Compile vaia.config.ts first, then:
npx vaia manifest

# Validate existing manifest:
npx vaia manifest --validate
```

---

## Error handling

All verification functions throw `VAIAError` on failure:

```ts
import { VAIAError } from '@vaia/sdk'

try {
  const { ctx } = await gandia.verify(req, secret)
  // ...
} catch (err) {
  if (err instanceof VAIAError) {
    // err.message → human-readable message (Spanish)
    // err.code    → machine-readable: 'HMAC_INVALID', 'JWT_EXPIRED', 'PERMISSION_DENIED', etc.
    // err.status  → HTTP status: 401, 403, 400, 422
    return gandia.respond.error(err.message, err.status, err.code)
  }
  throw err
}
```

### Error codes

| Code | Status | When |
|---|---|---|
| `MISSING_AUTH_HEADERS` | 401 | X-Gandia-Signature or X-Gandia-Timestamp missing |
| `TIMESTAMP_OUT_OF_RANGE` | 401 | Timestamp outside ±5 min window |
| `HMAC_INVALID` | 401 | Signature doesn't match |
| `BODY_PARSE_ERROR` | 400 | Body is not valid JSON |
| `JWT_MALFORMED` | 401 | JWT doesn't have 3 parts |
| `JWT_SIGNATURE_INVALID` | 401 | JWT signature check failed |
| `JWT_EXPIRED` | 401 | JWT exp claim is in the past |
| `PERMISSION_DENIED` | 403 | Missing required permission |
| `SURFACE_NOT_SUPPORTED` | 422 | No handler for requested surface |

---

## CLI

```bash
npx vaia manifest            # generate gandia.manifest.json
npx vaia manifest --validate # validate existing manifest
npx vaia sign payload.json   # sign a payload (needs GANDIA_KEY_SECRET)
npx vaia version             # SDK version
```

---

## Publishing

Publication to npm is done manually by the VAIA team via `npm login` + `npm publish`.

---

## License

MIT — VAIA
