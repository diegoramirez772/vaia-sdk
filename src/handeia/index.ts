/**
 * handeia — integration namespace for Handeia (personal platform).
 *
 * Quick start:
 *   import { handeia } from '@vaia/sdk'
 *
 *   export async function POST(req: Request) {
 *     try {
 *       const { ctx } = await handeia.verify(req, process.env.HANDEIA_KEY_SECRET!)
 *       const profile = await myDb.getProfile(ctx.user.id)
 *       return handeia.respond.surface(ctx.surface, {
 *         card: () => ({ title: profile.name, subtitle: profile.role }),
 *         text: () => `Hola ${profile.name}`,
 *       })
 *     } catch (err) {
 *       if (err instanceof VAIAError) return handeia.respond.error(err.message, err.status)
 *       throw err
 *     }
 *   }
 */

export { verify, isProbe, type HandeiaVerifyResult } from './verify.js'
export * as jwt from './jwt.js'

// handeia shares the same respond/make API as gandia
export { respond, make } from '../gandia/respond.js'

// Permission helpers (work the same — ctx.permissions is always a string[])
export { can, canAll, canAny, require, requireAll } from '../gandia/permissions.js'
