/**
 * gandia.respond — typed response builders.
 *
 * Each method returns a Web API Response with the correct VAIA envelope.
 * HAIA reads `output_type` to decide how to render the result.
 *
 * For non-Response frameworks (Express, Fastify), use gandia.make.* instead.
 *
 * Usage:
 *   // Returns Web API Response
 *   return gandia.respond.card({ title: 'Riesgo', value: 72, unit: '%' })
 *
 *   // Multi-surface: GAIA tells you which surface it wants via ctx.surface
 *   return gandia.respond.surface(ctx.surface, {
 *     card:  () => ({ title: 'Riesgo', value: 72 }),
 *     table: () => ({ columns: ['alumno', 'score'], rows }),
 *     text:  () => `El riesgo del grupo es ${risk}%`,
 *   })
 */

import type {
  CardPayload,
  TablePayload,
  WidgetPayload,
  ActionPayload,
  RespondOpts,
  Surface,
  SurfaceHandlers,
  VAIAResponse,
  CardResponse,
  TableResponse,
  TextResponse,
  WidgetResponse,
  ActionResponse,
  DataResponse,
} from '../types.js'
import { VAIAError } from '../types.js'

// ─── JSON helpers ─────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function toResponse(body: VAIAResponse | { ok: false; error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

// ─── make.* — plain objects (framework-agnostic) ─────────────────────────────

export const make = {
  card(payload: CardPayload, opts: RespondOpts = {}): CardResponse {
    return { ok: true, output_type: 'card', data: payload, ...opts }
  },

  table(payload: TablePayload, opts: RespondOpts = {}): TableResponse {
    return { ok: true, output_type: 'table', data: payload, ...opts }
  },

  text(content: string, opts: RespondOpts & { markdown?: boolean } = {}): TextResponse {
    const { markdown, ...rest } = opts
    return { ok: true, output_type: 'text', text: content, markdown, ...rest }
  },

  widget(payload: WidgetPayload, opts: RespondOpts = {}): WidgetResponse {
    return { ok: true, output_type: 'widget', data: payload, ...opts }
  },

  action(payload: ActionPayload, opts: RespondOpts = {}): ActionResponse {
    return { ok: true, output_type: 'action', data: payload, ...opts }
  },

  data(payload: Record<string, unknown>, opts: RespondOpts = {}): DataResponse {
    return { ok: true, output_type: 'data', data: payload, ...opts }
  },
} as const

// ─── respond.* — Web API Response ────────────────────────────────────────────

export const respond = {
  /** A compact card: title, value, unit, trend, etc. */
  card(payload: CardPayload, opts: RespondOpts = {}): Response {
    return toResponse(make.card(payload, opts))
  },

  /** Tabular data with columns + rows. */
  table(payload: TablePayload, opts: RespondOpts = {}): Response {
    return toResponse(make.table(payload, opts))
  },

  /** Plain text or markdown — shown in chat or narrative views. */
  text(content: string, opts: RespondOpts & { markdown?: boolean } = {}): Response {
    return toResponse(make.text(content, opts))
  },

  /** An iframe pointing to the developer's own UI. */
  widget(payload: WidgetPayload, opts: RespondOpts = {}): Response {
    return toResponse(make.widget(payload, opts))
  },

  /** Trigger an action (mutation, navigation, confirm dialog). */
  action(payload: ActionPayload, opts: RespondOpts = {}): Response {
    return toResponse(make.action(payload, opts))
  },

  /** Arbitrary JSON — HAIA decides how to render based on shape. */
  data(payload: Record<string, unknown>, opts: RespondOpts = {}): Response {
    return toResponse(make.data(payload, opts))
  },

  /** Simple 200 OK — useful for probe responses. */
  ok(opts: RespondOpts = {}): Response {
    return toResponse(make.data({ status: 'ok' }, opts))
  },

  /** Returns a 4xx/5xx error response. */
  error(message: string, status = 500, code?: string): Response {
    return toResponse({ ok: false, error: message, ...(code ? { code } : {}) }, status)
  },

  /**
   * Multi-surface responder.
   * GAIA sends `ctx.surface` telling you what to render.
   * Map each surface to its handler and this picks the right one.
   *
   *   return gandia.respond.surface(ctx.surface, {
   *     card:  () => ({ title: 'Riesgo', value: 72, unit: '%' }),
   *     table: () => ({ columns: [...], rows: [...] }),
   *     text:  () => `El riesgo es 72%`,
   *   }, opts)
   */
  async surface(
    surface: Surface,
    handlers: SurfaceHandlers,
    opts: RespondOpts = {},
  ): Promise<Response> {
    const handler = handlers[surface]

    if (!handler) {
      // Fallback cascade: data > text > first available handler
      const fallback =
        handlers.data ?? handlers.text ?? Object.values(handlers).find(Boolean)
      if (!fallback) {
        throw new VAIAError(
          `Surface '${surface}' no soportada por esta capacidad`,
          'SURFACE_NOT_SUPPORTED',
          422,
        )
      }
      return respond.surface(
        handlers.data ? 'data' : handlers.text ? 'text' : (Object.keys(handlers)[0] as Surface),
        handlers,
        opts,
      )
    }

    switch (surface) {
      case 'card':   return respond.card(await (handlers.card!)(), opts)
      case 'table':  return respond.table(await (handlers.table!)(), opts)
      case 'text':   return respond.text(await (handlers.text!)(), opts)
      case 'widget': return respond.widget(await (handlers.widget!)(), opts)
      case 'action': return respond.action(await (handlers.action!)(), opts)
      case 'data':   return respond.data(await (handlers.data!)(), opts)
      default:       return respond.data(await (handlers.data ?? handlers.text ?? (() => ({})))(), opts)
    }
  },
} as const
