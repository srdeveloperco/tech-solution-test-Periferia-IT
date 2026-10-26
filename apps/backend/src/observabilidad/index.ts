/**
 * Observatorio del agente: registra cada turno, cada llamada al modelo (prompt, mensajes,
 * variables, respuesta, tokens, costo) y cada herramienta ejecutada. Controla el presupuesto global.
 */
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { rutas } from "../tools/rutas"
import { ObservadorSqlite } from "./sqlite"
import type { Observador } from "./tipos"

export { rutasObservatorio } from "./rutas"
export type { Observador, PermisoGasto } from "./tipos"

export const LIMITE_USD_POR_DEFECTO = 10

export type OpcionesObservador = {
  /** Límite global de gasto en IA (USD). Por defecto PRESUPUESTO_USD o 10. */
  limiteUsd?: number
  /** Ruta del archivo SQLite (o ":memory:"). Por defecto <out>/observatorio.db. */
  archivo?: string
}

function limiteDesdeEntorno(): number {
  const valor = Number(process.env.PRESUPUESTO_USD)
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_USD_POR_DEFECTO
}

export function crearObservador(directory: string, opciones: OpcionesObservador = {}): Observador {
  const archivo = opciones.archivo ?? join(rutas(directory).out, "observatorio.db")
  if (archivo !== ":memory:") mkdirSync(dirname(archivo), { recursive: true })
  const limite = opciones.limiteUsd !== undefined && opciones.limiteUsd > 0 ? opciones.limiteUsd : limiteDesdeEntorno()
  return new ObservadorSqlite(archivo, limite)
}
