/**
 * Puerto del observador (patrón Observer propio, sin LangChain/Langfuse).
 * Implementación: SQLite (bun:sqlite) en out/observatorio.db. Todo es síncrono.
 * El ciclo del agente lo llama en cada turno, cada llamada al LLM y cada herramienta.
 */
import type {
  EjecucionHerramientaDto,
  InteraccionDetalle,
  InteraccionResumen,
  LlamadaLlmDto,
  ObservatorioResumen,
  PresupuestoDto,
  ResultadoInteraccion,
  RutaTurno,
} from "@oc/contracts"

export type PermisoGasto = { permitido: true } | { permitido: false; motivo: string }

export interface Observador {
  iniciarInteraccion(d: { sessionId: string; usuario: string | null; mensaje: string }): string
  registrarRuta(interaccionId: string, ruta: RutaTurno): void
  registrarLlamadaLlm(d: Omit<LlamadaLlmDto, "id" | "ts">): void
  registrarHerramienta(d: Omit<EjecucionHerramientaDto, "id" | "ts">): void
  cerrarInteraccion(interaccionId: string, d: { respuesta: string; resultado: ResultadoInteraccion; ms: number }): void
  /** Se consulta ANTES de cada llamada al LLM con un costo estimado conservador. */
  puedeGastar(estimadoUsd: number): PermisoGasto
  presupuesto(): PresupuestoDto
  resumen(): ObservatorioResumen
  interacciones(limite: number): InteraccionResumen[]
  interaccion(id: string): InteraccionDetalle | null
}
