/**
 * Interfaz propia del proveedor de modelo (PRD 6.1): `enviar(peticion) → respuesta`.
 * El ciclo del agente solo conoce estos tipos; cambiar de proveedor no lo toca.
 */

export type AgenteLlm = "router" | "operador" | "asesor" | "conversador"

export type BloqueContenido =
  | { tipo: "texto"; texto: string }
  | { tipo: "uso_herramienta"; id: string; nombre: string; entrada: unknown }
  | { tipo: "resultado_herramienta"; idUso: string; contenido: string; esError: boolean }
  /** Bloque opaco del proveedor (ej. thinking) que se devuelve intacto para no editar el historial. */
  | { tipo: "crudo"; proveedor: string; dato: unknown }

export type MensajeLlm = { rol: "usuario" | "asistente"; contenido: BloqueContenido[] }

export type HerramientaLlm = {
  nombre: string
  descripcion: string
  /** JSON Schema del objeto de argumentos. */
  esquema: Record<string, unknown>
}

export type PeticionLlm = {
  agente: AgenteLlm
  modelo: string
  /** Bloques de sistema estables (se cachean). */
  sistema: string[]
  mensajes: MensajeLlm[]
  herramientas?: HerramientaLlm[]
  /** Mantiene las herramientas declaradas pero obliga a responder con texto. */
  sinHerramientas?: boolean
  /** Salida estructurada: la respuesta es un JSON que cumple este esquema. */
  salidaJson?: Record<string, unknown>
  maxTokens: number
  esfuerzo?: "low" | "medium" | "high"
  onTexto?: (delta: string) => void
}

export type UsoLlm = { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }

export type RespuestaLlm = {
  contenido: BloqueContenido[]
  parada: "fin" | "herramientas" | "limite_tokens" | "rechazo" | "otro"
  uso: UsoLlm
  modelo: string
}

export interface LlmAdapter {
  readonly proveedor: string
  enviar(peticion: PeticionLlm): Promise<RespuestaLlm>
}

/** Error del proveedor con un mensaje apto para mostrar en el chat. */
export class ErrorLlm extends Error {
  constructor(
    mensaje: string,
    readonly reintentable: boolean,
  ) {
    super(mensaje)
    this.name = "ErrorLlm"
  }
}

export const USO_CERO: UsoLlm = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 }

export function sumarUso(a: UsoLlm, b: UsoLlm): UsoLlm {
  return {
    entrada: a.entrada + b.entrada,
    salida: a.salida + b.salida,
    cacheLectura: a.cacheLectura + b.cacheLectura,
    cacheEscritura: a.cacheEscritura + b.cacheEscritura,
  }
}

export function textoDe(contenido: BloqueContenido[]): string {
  return contenido
    .filter((b): b is Extract<BloqueContenido, { tipo: "texto" }> => b.tipo === "texto")
    .map((b) => b.texto)
    .join("")
    .trim()
}

export function usosDe(contenido: BloqueContenido[]): Extract<BloqueContenido, { tipo: "uso_herramienta" }>[] {
  return contenido.filter(
    (b): b is Extract<BloqueContenido, { tipo: "uso_herramienta" }> => b.tipo === "uso_herramienta",
  )
}
