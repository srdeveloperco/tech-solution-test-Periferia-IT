import type { Hallazgo, OrdenCompra, Validacion } from "@oc/contracts"

/**
 * Lectura segura de `herramienta_fin.resultado` (llega como `unknown`).
 * Paquete y Trazabilidad no se reexportan en @oc/contracts: se describen aquí solo los campos que se muestran.
 */

export type PaqueteVista = {
  correo: { id: string; de: string; asunto: string; fecha: string }
  solicitud: {
    solicitud_id: string
    solicitante: string
    proveedor_nombre: string
    proveedor_nit?: string
    descripcion: string
    centro_costo: string
    subarea: string
    cantidad: number
    valor_unitario: number
    valor_total: number
    moneda: string
    indicador_iva?: string
    condiciones_pago?: string
    fecha_solicitud: string
  }
  cotizacion: {
    numero: string | null
    fecha: string | null
    proveedor: string
    nit: string | null
    total: number
    moneda: string
    validez_hasta: string | null
  } | null
  aprobacion: { de: string; fecha: string; aprobado: boolean; texto: string } | null
  factura: { numero: string; fecha: string; total: number } | null
  faltantes: string[]
}

export type Traza = Record<string, { valor: unknown; fuente: string; detalle?: string }>

export type OrdenVista = { orden: OrdenCompra; trazabilidad: Traza; trazabilidad_ruta: string | null }

export type EvidenciaVista = { ruta: string; ruta_pdf: string | null; sha256: string }

type DatosCreada = { numero_oc: string; fecha: string; retroactiva: boolean }

export type ResultadoCrearVista =
  | ({ tipo: "creada" } & DatosCreada)
  | ({ tipo: "idempotente" } & DatosCreada)
  | { tipo: "pendiente"; error: string; confirmaciones: Hallazgo[] }
  | { tipo: "bloqueada"; error: string; bloqueos: Hallazgo[] }
  | { tipo: "error"; error: string }

type Objeto = Record<string, unknown>

export function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function texto(valor: unknown, porDefecto = ""): string {
  return typeof valor === "string" ? valor : porDefecto
}

function datos(resultado: unknown): Objeto | null {
  if (!esObjeto(resultado) || resultado.ok !== true) return null
  return esObjeto(resultado.data) ? resultado.data : null
}

export function errorDe(resultado: unknown): string | null {
  if (esObjeto(resultado) && resultado.ok === false) return texto(resultado.error, "Error sin detalle")
  return null
}

function hallazgos(valor: unknown): Hallazgo[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((h): h is Hallazgo => esObjeto(h) && typeof h.codigo === "string" && typeof h.titulo === "string")
}

export function comoPaquete(resultado: unknown): PaqueteVista | null {
  const d = datos(resultado)
  if (!d || !esObjeto(d.solicitud) || !esObjeto(d.correo)) return null
  const paquete = d as unknown as PaqueteVista
  return { ...paquete, faltantes: Array.isArray(d.faltantes) ? paquete.faltantes : [] }
}

export function comoValidacion(resultado: unknown): Validacion | null {
  const d = datos(resultado)
  if (!d || typeof d.apta !== "boolean" || !Array.isArray(d.controles)) return null
  return d as unknown as Validacion
}

export function comoOrden(resultado: unknown): OrdenVista | null {
  const d = datos(resultado)
  if (!d || !esObjeto(d.orden) || !Array.isArray(d.orden.posiciones)) return null
  return {
    orden: d.orden as unknown as OrdenCompra,
    trazabilidad: esObjeto(d.trazabilidad) ? (d.trazabilidad as Traza) : {},
    trazabilidad_ruta: typeof d.trazabilidad_ruta === "string" ? d.trazabilidad_ruta : null,
  }
}

export function comoEvidencia(resultado: unknown): EvidenciaVista | null {
  const d = datos(resultado)
  if (!d || typeof d.sha256 !== "string") return null
  return { ruta: texto(d.ruta), ruta_pdf: typeof d.ruta_pdf === "string" ? d.ruta_pdf : null, sha256: d.sha256 }
}

export function comoCrear(resultado: unknown): ResultadoCrearVista | null {
  if (!esObjeto(resultado)) return null
  if (resultado.ok === true && esObjeto(resultado.data)) {
    const d = resultado.data
    return {
      tipo: d.idempotente === true || d.resultado === "idempotente" ? "idempotente" : "creada",
      numero_oc: texto(d.numero_oc),
      fecha: texto(d.fecha),
      retroactiva: d.retroactiva === true,
    }
  }
  if (resultado.ok === false) {
    const error = texto(resultado.error, "No se pudo crear la orden")
    if (resultado.resultado === "pendiente")
      return { tipo: "pendiente", error, confirmaciones: hallazgos(resultado.confirmaciones) }
    if (resultado.resultado === "bloqueada")
      return { tipo: "bloqueada", error, bloqueos: hallazgos(resultado.bloqueos) }
    return { tipo: "error", error }
  }
  return null
}

/** Caso mencionado en los argumentos de una herramienta. */
export function casoDeArgs(args: unknown): string | null {
  return esObjeto(args) && typeof args.caso === "string" ? args.caso : null
}
