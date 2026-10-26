import { createHash } from "node:crypto"
import type { LlmAdapter, PeticionLlm, RespuestaLlm, UsoLlm } from "../llm/adapter"
import { ErrorLlm, sumarUso, USO_CERO } from "../llm/adapter"
import { costoUsd, tarifaDe, tokensTotales } from "../llm/precios"
import type { Observador } from "../observabilidad/tipos"

/** Se lanza cuando el presupuesto global de IA no permite otra llamada. */
export class ErrorPresupuesto extends Error {
  constructor(readonly motivo: string) {
    super(motivo)
    this.name = "ErrorPresupuesto"
  }
}

/** Contabilidad del turno: tokens, costo e iteraciones acumulados por todas las llamadas. */
export type Contador = { uso: UsoLlm; costoUsd: number; llamadas: number }

export function contadorNuevo(): Contador {
  return { uso: { ...USO_CERO }, costoUsd: 0, llamadas: 0 }
}

export type ContextoLlamada = {
  llm: LlmAdapter
  observador: Observador
  interaccionId: string
  contador: Contador
}

/** Estimación conservadora: entrada sin caché (~3,5 caracteres por token) + la mitad del tope de salida. */
export function estimarCosto(p: PeticionLlm): number {
  const caracteres =
    p.sistema.join("").length +
    JSON.stringify(p.mensajes).length +
    JSON.stringify(p.herramientas ?? []).length +
    JSON.stringify(p.salidaJson ?? {}).length
  const t = tarifaDe(p.modelo)
  return ((caracteres / 3.5) * t.entrada + (p.maxTokens / 2) * t.salida) / 1_000_000
}

export function hashPrompt(sistema: string[]): string {
  return createHash("sha256").update(sistema.join("\n\n")).digest("hex")
}

/**
 * Única puerta de salida hacia el modelo: verifica presupuesto, mide, calcula costo
 * y deja cada llamada (exitosa o fallida) en el observador.
 */
export async function llamarModelo(
  ctx: ContextoLlamada,
  peticion: PeticionLlm,
  variables: Record<string, unknown>,
): Promise<RespuestaLlm> {
  const permiso = ctx.observador.puedeGastar(estimarCosto(peticion))
  if (!permiso.permitido) throw new ErrorPresupuesto(permiso.motivo)
  const inicio = performance.now()
  try {
    const respuesta = await ctx.llm.enviar(peticion)
    const costo = costoUsd(peticion.modelo, respuesta.uso)
    ctx.contador.uso = sumarUso(ctx.contador.uso, respuesta.uso)
    ctx.contador.costoUsd += costo
    ctx.contador.llamadas += 1
    registrar(ctx, peticion, variables, { respuesta, costo, ms: performance.now() - inicio, error: null })
    return respuesta
  } catch (error) {
    const mensaje = error instanceof ErrorLlm ? error.message : "Error inesperado del proveedor del modelo."
    registrar(ctx, peticion, variables, { respuesta: null, costo: 0, ms: performance.now() - inicio, error: mensaje })
    throw error instanceof ErrorLlm ? error : new ErrorLlm(mensaje, true)
  }
}

type Resultado = { respuesta: RespuestaLlm | null; costo: number; ms: number; error: string | null }

function registrar(ctx: ContextoLlamada, p: PeticionLlm, variables: Record<string, unknown>, r: Resultado): void {
  const uso = r.respuesta?.uso ?? USO_CERO
  try {
    ctx.observador.registrarLlamadaLlm({
      interaccionId: ctx.interaccionId,
      agente: p.agente,
      proveedor: ctx.llm.proveedor,
      modelo: p.modelo,
      sistema: p.sistema.join("\n\n"),
      promptHash: hashPrompt(p.sistema),
      mensajes: p.mensajes,
      herramientas: (p.herramientas ?? []).map((h) => h.nombre),
      variables: { ...variables, sinHerramientas: p.sinHerramientas === true, maxTokens: p.maxTokens },
      respuesta: r.respuesta?.contenido ?? null,
      stopReason: r.respuesta?.parada ?? null,
      tokensEntrada: uso.entrada,
      tokensSalida: uso.salida,
      tokensCacheLectura: uso.cacheLectura,
      tokensCacheEscritura: uso.cacheEscritura,
      costoUsd: r.costo,
      ms: Math.round(r.ms),
      error: r.error,
    })
  } catch {
    // la observabilidad nunca debe tumbar el turno
  }
}

export function tokensDelContador(c: Contador): number {
  return tokensTotales(c.uso)
}
