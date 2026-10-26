/** Log de control para contabilidad/auditoría (HU-5): out/control.csv, una fila por intento. */
import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { ResultadoCrear } from "@oc/domain"
import { rutas } from "./rutas"

export const ENCABEZADO_CONTROL = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts"

export type FilaControl = {
  solicitud_id: string
  resultado: ResultadoCrear
  numero_oc: string | null
  retroactiva: boolean
  bloqueos: string[]
  confirmaciones: string[]
}

function celda(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

export async function registrarControl(directory: string, fila: FilaControl): Promise<void> {
  const archivo = rutas(directory).control
  await mkdir(dirname(archivo), { recursive: true })
  const existe = await readFile(archivo, "utf8").catch(() => null)
  const linea = [
    fila.solicitud_id,
    fila.resultado,
    fila.numero_oc ?? "",
    String(fila.retroactiva),
    fila.bloqueos.join("|"),
    fila.confirmaciones.join("|"),
    new Date().toISOString(),
  ]
    .map(celda)
    .join(",")
  await appendFile(archivo, `${existe ? "" : `${ENCABEZADO_CONTROL}\n`}${linea}\n`, "utf8")
}

export async function leerControl(directory: string): Promise<string> {
  return readFile(rutas(directory).control, "utf8").catch(() => `${ENCABEZADO_CONTROL}\n`)
}
