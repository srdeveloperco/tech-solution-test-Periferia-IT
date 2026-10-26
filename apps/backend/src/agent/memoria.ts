import type { Hallazgo, OrdenCompra, RutaTurno } from "@oc/contracts"
import { type MemoriaCaso, memoriaVacia, pendienteDe, type Sesion, ultimoPendiente } from "./sesiones"

type Json = Record<string, unknown>

function esObjeto(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function hallazgos(v: unknown): Hallazgo[] {
  return Array.isArray(v) ? (v as Hallazgo[]) : []
}

function caso(sesion: Sesion, id: string): MemoriaCaso {
  const actual = sesion.casos[id] ?? memoriaVacia()
  sesion.casos[id] = actual
  return actual
}

/** Actualiza la memoria compacta del caso a partir del resultado (ya parseado) de una herramienta. */
export function recordar(sesion: Sesion, herramienta: string, idCaso: string, r: Json): void {
  const m = caso(sesion, idCaso)
  const data = esObjeto(r.data) ? r.data : null
  if (herramienta === "oc_validar" && data) {
    m.resultado = "validado"
    m.apta = data.apta === true
    m.retroactiva = data.retroactiva === true
    m.bloqueos = hallazgos(data.bloqueos).map((h) => `${h.codigo}: ${h.titulo}`)
    m.confirmaciones = hallazgos(data.confirmaciones)
  }
  if (herramienta === "oc_construir_payload" && data && esObjeto(data.orden)) m.orden = data.orden as OrdenCompra
  if (herramienta === "oc_generar_evidencia" && data && typeof data.ruta_pdf === "string")
    m.evidencia_pdf = data.ruta_pdf
  if (herramienta === "oc_crear") recordarCreacion(m, r, data)
}

function recordarCreacion(m: MemoriaCaso, r: Json, data: Json | null): void {
  if (r.ok === true && data) {
    m.resultado = data.idempotente === true ? "idempotente" : "creada"
    m.numero_oc = typeof data.numero_oc === "string" ? data.numero_oc : null
    m.retroactiva = data.retroactiva === true
    return
  }
  if (r.resultado === "pendiente") {
    m.resultado = "pendiente"
    m.confirmaciones = hallazgos(r.confirmaciones)
  } else if (r.resultado === "bloqueada") {
    m.resultado = "bloqueada"
    m.bloqueos = hallazgos(r.bloqueos).map((h) => `${h.codigo}: ${h.titulo}`)
  }
}

export type ContextoOperador = {
  intencion: RutaTurno["intencion"]
  caso: string | null
  confirmacion_otorgada: boolean
  pendiente: { caso: string; confirmaciones: Array<{ codigo: string; titulo: string; detalle: string }> } | null
  /** OC ya validada del caso: permite crear tras la confirmación sin repetir los pasos. */
  orden_validada: OrdenCompra | null
  casos_de_la_sesion: Array<{ caso: string; resultado: string | null; numero_oc: string | null }>
}

/** Contexto mínimo que el orquestador entrega al operador al inicio de cada turno. */
export function contextoOperador(sesion: Sesion, ruta: RutaTurno): ContextoOperador {
  const idCaso = ruta.caso ?? ultimoPendiente(sesion)?.caso ?? null
  const pendiente = pendienteDe(sesion, idCaso) ?? ultimoPendiente(sesion)
  const memoria = idCaso ? sesion.casos[idCaso] : undefined
  const otorgada = idCaso !== null && sesion.confirmacionesOtorgadas.includes(idCaso)
  return {
    intencion: ruta.intencion,
    caso: idCaso,
    confirmacion_otorgada: otorgada,
    pendiente: pendiente
      ? {
          caso: pendiente.caso,
          confirmaciones: pendiente.confirmaciones.map((h) => ({
            codigo: h.codigo,
            titulo: h.titulo,
            detalle: h.detalle,
          })),
        }
      : null,
    orden_validada: otorgada || ruta.intencion === "confirmar" ? (memoria?.orden ?? null) : null,
    casos_de_la_sesion: Object.entries(sesion.casos).map(([c, m]) => ({
      caso: c,
      resultado: m.resultado,
      numero_oc: m.numero_oc,
    })),
  }
}

export const ETIQUETA_CONTEXTO = "contexto_orquestador"

export function bloqueContexto(ctx: ContextoOperador): string {
  return `<${ETIQUETA_CONTEXTO}>${JSON.stringify(ctx)}</${ETIQUETA_CONTEXTO}>`
}

export function leerContexto(texto: string): ContextoOperador | null {
  const m = texto.match(new RegExp(`<${ETIQUETA_CONTEXTO}>([\\s\\S]*?)</${ETIQUETA_CONTEXTO}>`))
  if (!m?.[1]) return null
  try {
    return JSON.parse(m[1]) as ContextoOperador
  } catch {
    return null
  }
}
