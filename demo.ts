/**
 * Verificación sin modelo (PRD 6.6): procesa los 6 casos llamando directamente a las herramientas.
 * Uso: bun install && bun run demo.ts
 */
import { rm } from "node:fs/promises"
import { leerControlCsv, listarCasos } from "./apps/backend/src/tools/consultas"
import * as oc from "./apps/backend/src/tools/oc"
import { rutas } from "./apps/backend/src/tools/rutas"
import type { ToolContext } from "./apps/backend/src/tools/tipos"

type Resultado = { ok: boolean; data?: unknown; error?: string; [k: string]: unknown }
type Hallazgo = { codigo: string; titulo: string; detalle: string }
type Validacion = { apta: boolean; bloqueos: Hallazgo[]; confirmaciones: Hallazgo[]; retroactiva: boolean }

const ctx: ToolContext = { directory: import.meta.dir, sessionId: "demo" }
const leer = (s: string) => JSON.parse(s) as Resultado
const linea = (t = "") => console.log(t)
const lista = (hs: Hallazgo[]) => (hs.length ? hs.map((h) => `${h.codigo} ${h.titulo}`).join(" · ") : "ninguno")

async function crear(caso: string, payload: unknown, confirmado: boolean) {
  return leer(await oc.crear.execute({ caso, payload: payload as never, confirmado }, ctx))
}

function describirCreacion(r: Resultado): string {
  if (r.ok) {
    const d = r.data as { numero_oc: string; idempotente: boolean; retroactiva: boolean }
    return `OC ${d.numero_oc}${d.idempotente ? " (idempotente: ya existía)" : ""}${d.retroactiva ? " · RETROACTIVA" : ""}`
  }
  return `${String(r.resultado ?? "error").toUpperCase()}: ${r.error}`
}

/** Paso completo de un caso: leer → validar → construir → evidencia → crear (sin confirmar). */
async function procesar(caso: string): Promise<{ payload: unknown }> {
  linea(`\n■ ${caso}`)
  const paquete = leer(await oc.leer_paquete.execute({ caso }, ctx))
  if (!paquete.ok) {
    linea(`  paquete      error: ${paquete.error}`)
    return { payload: null }
  }
  const v = leer(await oc.validar.execute({ caso, paquete: paquete.data as never }, ctx))
  const val = v.data as Validacion
  linea(`  apta         ${val.apta}`)
  linea(`  bloqueos     ${lista(val.bloqueos)}`)
  linea(`  confirmar    ${lista(val.confirmaciones)}`)
  linea(`  retroactiva  ${val.retroactiva}`)
  let payload: unknown = null
  if (val.apta) {
    const derivados = (v.data as { derivados: Record<string, never> }).derivados
    const p = leer(await oc.construir_payload.execute({ caso, paquete: paquete.data as never, derivados }, ctx))
    payload = p.ok ? (p.data as { orden: unknown }).orden : null
    const ev = leer(await oc.generar_evidencia.execute({ caso }, ctx))
    if (ev.ok) linea(`  evidencia    ${(ev.data as { ruta_pdf: string; sha256: string }).ruta_pdf}`)
  }
  linea(`  resultado    ${describirCreacion(await crear(caso, payload, false))}`)
  return { payload }
}

async function main() {
  await rm(rutas(ctx.directory).out, { recursive: true, force: true })
  linea("Agente OC · verificación de herramientas sin modelo de lenguaje")
  const casos = (await listarCasos(ctx.directory)).map((c) => c.caso)
  const payloads = new Map<string, unknown>()
  for (const caso of casos) payloads.set(caso, (await procesar(caso)).payload)

  linea("\n── Idempotencia: sol-001 por segunda vez")
  linea(`  resultado    ${describirCreacion(await crear("sol-001", payloads.get("sol-001") ?? null, false))}`)

  linea('\n── Confirmaciones explícitas (simulan el "confirmo" de la analista)')
  for (const caso of ["sol-004", "sol-005", "sol-006"].filter((c) => casos.includes(c))) {
    linea(`  ${caso}      ${describirCreacion(await crear(caso, payloads.get(caso) ?? null, true))}`)
  }

  linea("\n── out/control.csv")
  for (const fila of (await leerControlCsv(ctx.directory)).trim().split("\n")) linea(`  ${fila.replace(/,[^,]*$/, "")}`)
}

await main()
