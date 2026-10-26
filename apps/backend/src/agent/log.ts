import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

/** CA4: cada llamada a herramienta queda en out/log.jsonl. Nunca se registran claves ni payloads completos. */
export function registrarEnLog(ruta: string, entrada: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(ruta), { recursive: true })
    appendFileSync(ruta, `${JSON.stringify({ ts: new Date().toISOString(), ...entrada })}\n`)
  } catch {
    // el log es best-effort: no debe interrumpir el turno
  }
}
