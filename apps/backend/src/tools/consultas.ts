/** Consultas de solo lectura para la API (lista de casos, control.csv, evidencias). */
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ResultadoCrear } from "@oc/domain"
import { leerControl } from "./control"
import { casosDisponibles } from "./fuentes"
import { casoValido, rutas } from "./rutas"

export type CasoListado = {
  caso: string
  solicitud_id: string | null
  descripcion: string | null
  proveedor: string | null
  valor_total: number | null
  moneda: string | null
  estado: ResultadoCrear | null
  numero_oc: string | null
}

const RESULTADOS: ResultadoCrear[] = ["creada", "idempotente", "bloqueada", "pendiente"]

function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

/** Último resultado y último número de OC por solicitud, según control.csv. */
function estadosPorSolicitud(csv: string): Map<string, { estado: ResultadoCrear; numero_oc: string | null }> {
  const mapa = new Map<string, { estado: ResultadoCrear; numero_oc: string | null }>()
  for (const linea of csv.split("\n").slice(1)) {
    const [id, resultado, numero] = linea.split(",")
    if (!id || !resultado || !RESULTADOS.includes(resultado as ResultadoCrear)) continue
    const previo = mapa.get(id)
    mapa.set(id, { estado: resultado as ResultadoCrear, numero_oc: numero || previo?.numero_oc || null })
  }
  return mapa
}

export async function listarCasos(directory: string): Promise<CasoListado[]> {
  const estados = estadosPorSolicitud(await leerControl(directory))
  const casos = await casosDisponibles(directory)
  return Promise.all(
    casos.map(async (caso) => {
      let s: Record<string, unknown> = {}
      try {
        s = JSON.parse(await readFile(join(rutas(directory).caso(caso), "solicitud.json"), "utf8")) as Record<
          string,
          unknown
        >
      } catch {
        s = {}
      }
      const id = texto(s.solicitud_id)
      const estado = id ? estados.get(id) : undefined
      return {
        caso,
        solicitud_id: id,
        descripcion: texto(s.descripcion),
        proveedor: texto(s.proveedor_nombre),
        valor_total: typeof s.valor_total === "number" ? s.valor_total : null,
        moneda: texto(s.moneda),
        estado: estado?.estado ?? null,
        numero_oc: estado?.numero_oc ?? null,
      }
    }),
  )
}

export async function leerControlCsv(directory: string): Promise<string> {
  return leerControl(directory)
}

/** Ruta absoluta de la evidencia generada, o null si aún no existe. */
export async function rutaEvidencia(directory: string, caso: string, formato: "pdf" | "txt"): Promise<string | null> {
  if (!casoValido(caso)) return null
  const ruta = join(rutas(directory).outCaso(caso), `aprobacion.${formato}`)
  return access(ruta).then(
    () => ruta,
    () => null,
  )
}
