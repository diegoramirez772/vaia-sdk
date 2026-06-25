/**
 * Ejemplo completo: Next.js App Router (Edge-compatible)
 *
 * Archivo: app/api/gandia/invoke/route.ts
 *
 * Este es el endpoint que Gandia-7 llama cuando GAIA invoca tu capacidad.
 * Maneja:
 *   1. Verificación HMAC (autenticidad de la llamada)
 *   2. Permisos (el developer decide qué requiere)
 *   3. Respuesta tipada según el surface que GAIA pide (card/table/text)
 *   4. JWT bypass para el iframe (cuando el usuario abre tu app)
 */

import { gandia, VAIAError } from '@vaia/sdk'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'  // funciona también con 'nodejs'

// ─── /api/gandia/invoke — GAIA invoca la capacidad ───────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Verificar firma HMAC y extraer contexto
    const { ctx } = await gandia.verify(req, process.env['GANDIA_KEY_SECRET']!)

    // 2. Verificar permisos requeridos (lanza 403 si no los tiene)
    gandia.require(ctx, 'read:students')

    // 3. Tu lógica de negocio
    const students = await fetchStudentRisk(ctx.tenant.id, ctx.permissions)

    // 4. Responder según el surface que pide GAIA
    //    si pide una card → devuelve una card
    //    si pide una tabla → devuelve una tabla
    //    si pide texto → devuelve texto
    return gandia.respond.surface(ctx.surface, {
      card: () => ({
        title: `Riesgo académico — ${ctx.tenant.name}`,
        value: students.avgRisk,
        unit: '%',
        trend: students.avgRisk > 60 ? 'up' : 'down',
        subtitle: `${students.atRisk} alumnos en zona crítica`,
      }),

      table: () => ({
        columns: [
          { key: 'name',      label: 'Alumno' },
          { key: 'risk',      label: 'Riesgo %', type: 'number' },
          { key: 'absences',  label: 'Faltas',   type: 'number' },
          { key: 'status',    label: 'Estado' },
        ],
        rows: students.list,
        total: students.list.length,
      }),

      text: () =>
        `${ctx.tenant.name} — riesgo promedio ${students.avgRisk}%. ` +
        `${students.atRisk} alumnos en zona crítica.`,
    }, {
      audit: {
        data_sources: ['supabase:students', 'supabase:grades'],
        records_accessed: students.list.length,
      },
    })

  } catch (err) {
    if (err instanceof VAIAError) {
      return gandia.respond.error(err.message, err.status, err.code)
    }
    console.error('[gandia/invoke]', err)
    return gandia.respond.error('Error interno', 500)
  }
}

// ─── /api/gandia/invoke — health probe (GET) ─────────────────────────────────

export async function GET() {
  return gandia.respond.ok()
}

// ─── Ejemplo de endpoint para el iframe (JWT bypass) ─────────────────────────
//
// archivo: app/gandia/widget/page.tsx (Server Component)
//
// export default async function GandiaWidget({ searchParams }: { searchParams: { gandia_token?: string } }) {
//   const token = searchParams.gandia_token
//   if (!token) return <div>No autorizado</div>
//
//   try {
//     const claims = await gandia.jwt.fromUrl(
//       `https://dummy?gandia_token=${token}`,
//       process.env.GANDIA_KEY_SECRET!,
//     )
//     // claims.sub        → user_id
//     // claims.tenant_id  → institución
//     // claims.permissions → qué puede hacer
//     return <MyDashboard userId={claims.sub} tenantId={claims.tenant_id} />
//   } catch {
//     return <div>Token inválido o expirado</div>
//   }
// }

// ─── Ejemplo vaia.config.ts ───────────────────────────────────────────────────
//
// import { defineCapability } from '@vaia/sdk'
//
// export default defineCapability({
//   id: 'mx.monitor-riesgo-academico',
//   name: 'Monitor de Riesgo Académico',
//   version: '1.0.0',
//   target: 'gandia',
//   type: 'app',
//   level: 'artefacto',
//   sector: 'educacion',
//   surfaces: {
//     card:  { endpoint: '/api/gandia/invoke' },
//     table: { endpoint: '/api/gandia/invoke' },
//     text:  { endpoint: '/api/gandia/invoke' },
//   },
//   permissions: ['read:students', 'read:grades'],
//   risk: 'medium',
//   has_own_auth: false,
//   stores_data: false,
// })

// ─── Mock — reemplaza con tu lógica real ─────────────────────────────────────

async function fetchStudentRisk(_tenantId: string, _permissions: string[]) {
  return {
    avgRisk: 67,
    atRisk: 8,
    list: [
      { name: 'Ana García',    risk: 82, absences: 6, status: 'crítico' },
      { name: 'Luis Martínez', risk: 71, absences: 4, status: 'alto'    },
      { name: 'María López',   risk: 45, absences: 2, status: 'normal'  },
    ],
  }
}
