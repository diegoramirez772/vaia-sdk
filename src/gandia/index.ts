/**
 * gandia — integration namespace for Gandia-7 (institutional platform).
 *
 * Quick start:
 *   import { gandia } from '@vaia/sdk'
 *
 *   export async function POST(req: Request) {
 *     try {
 *       const { ctx } = await gandia.verify(req, process.env.GANDIA_KEY_SECRET!)
 *       gandia.require(ctx, 'read:students')
 *       const data = await myDb.getStudents(ctx.tenant.id)
 *       return gandia.respond.surface(ctx.surface, {
 *         card:  () => ({ title: 'Total alumnos', value: data.length }),
 *         table: () => ({ columns: ['nombre', 'riesgo'], rows: data }),
 *         text:  () => `${data.length} alumnos en ${ctx.tenant.name}`,
 *       })
 *     } catch (err) {
 *       if (err instanceof VAIAError) return gandia.respond.error(err.message, err.status)
 *       throw err
 *     }
 *   }
 */

export { verify, isProbe, type VerifyResult } from './verify.js'
export * as jwt from './jwt.js'
export { respond, make } from './respond.js'
export { can, canAll, canAny, require, requireAll } from './permissions.js'
