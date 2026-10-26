// STUB: consultas de solo lectura para la API (implementación en curso).
export type CasoListado = {
  caso: string
  solicitud_id: string | null
  descripcion: string | null
  proveedor: string | null
  valor_total: number | null
  moneda: string | null
  estado: "creada" | "idempotente" | "bloqueada" | "pendiente" | null
  numero_oc: string | null
}
export async function listarCasos(_directory: string): Promise<CasoListado[]> {
  return []
}
export async function leerControlCsv(_directory: string): Promise<string> {
  return ""
}
/** Ruta absoluta de la evidencia generada, o null si aún no existe. */
export async function rutaEvidencia(_directory: string, _caso: string, _formato: "pdf" | "txt"): Promise<string | null> {
  return null
}
