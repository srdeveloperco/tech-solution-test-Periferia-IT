import { z } from "zod"

type Json = Record<string, unknown>

/** JSON Schema limpio para el proveedor: sin `$schema` y con objetos cerrados (requisito de salidas estructuradas). */
export function esquemaJson(esquema: z.ZodType): Json {
  const bruto = z.toJSONSchema(esquema) as Json
  delete bruto.$schema
  return cerrarObjetos(bruto) as Json
}

function cerrarObjetos(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(cerrarObjetos)
  if (typeof nodo !== "object" || nodo === null) return nodo
  const salida: Json = {}
  for (const [k, v] of Object.entries(nodo)) salida[k] = cerrarObjetos(v)
  if (salida.type === "object" && salida.properties && salida.additionalProperties === undefined) {
    salida.additionalProperties = false
  }
  return salida
}
