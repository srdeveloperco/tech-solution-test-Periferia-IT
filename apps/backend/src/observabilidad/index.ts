/**
 * Observatorio del agente: registra cada turno, cada llamada al modelo (prompt, mensajes,
 * variables, respuesta, tokens, costo) y cada herramienta ejecutada. Controla el presupuesto global.
 */
import type { Database } from "bun:sqlite"
import { abrirBaseDatos } from "../persistencia/base"
import { ObservadorSqlite } from "./sqlite"
import type { Observador } from "./tipos"

export { rutasObservatorio } from "./rutas"
export type { Observador, PermisoGasto } from "./tipos"

export const LIMITE_USD_POR_DEFECTO = 10

export type OpcionesObservador = {
  /** Límite global de gasto en IA (USD). Por defecto PRESUPUESTO_USD o 10. */
  limiteUsd?: number
  /** Ruta del archivo SQLite (o ":memory:"). Por defecto <out>/oc.db. Se ignora si llega `db`. */
  archivo?: string
  /** Conexión compartida (la misma que usa el repositorio de sesiones). */
  db?: Database
}

function limiteDesdeEntorno(): number {
  const valor = Number(process.env.PRESUPUESTO_USD)
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_USD_POR_DEFECTO
}

export function crearObservador(directory: string, opciones: OpcionesObservador = {}): Observador {
  const db = opciones.db ?? abrirBaseDatos(directory, opciones.archivo)
  const limite = opciones.limiteUsd !== undefined && opciones.limiteUsd > 0 ? opciones.limiteUsd : limiteDesdeEntorno()
  return new ObservadorSqlite(db, limite)
}
