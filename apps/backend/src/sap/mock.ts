/** SAP simulado sobre archivos: out/sap/ordenes.jsonl, numeración secuencial desde 4500000001. */
import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { normalizarNit, type OrdenCompra, type Proveedor } from "@oc/domain"
import type { SapAdapter } from "./adapter"

const PRIMER_NUMERO = 4_500_000_001

type Registro = { numero_oc: string; fecha: string; solicitud_id: string; orden: OrdenCompra }

/** Serializa escrituras dentro del proceso para que dos llamadas no reciban el mismo número. */
let cola: Promise<unknown> = Promise.resolve()
function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const siguiente = cola.then(tarea, tarea)
  cola = siguiente.catch(() => undefined)
  return siguiente
}

export class SapMock implements SapAdapter {
  private readonly archivo: string

  constructor(
    private readonly carpeta: string,
    private readonly proveedores: Proveedor[],
  ) {
    this.archivo = join(carpeta, "ordenes.jsonl")
  }

  private async leer(): Promise<Registro[]> {
    const texto = await readFile(this.archivo, "utf8").catch(() => "")
    return texto
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Registro)
  }

  async consultarProveedor(nit: string) {
    const buscado = normalizarNit(nit)
    const p = this.proveedores.find((x) => normalizarNit(x.nit) === buscado)
    return p ? { codigo_sap: p.codigo_sap, activo: p.activo } : null
  }

  async buscarOrdenPorReferencia(solicitud_id: string) {
    const existente = (await this.leer()).find((r) => r.solicitud_id === solicitud_id)
    return existente ? { numero_oc: existente.numero_oc } : null
  }

  crearOrden(orden: OrdenCompra) {
    return enCola(async () => {
      const registros = await this.leer()
      const previo = registros.find((r) => r.solicitud_id === orden.referencia.solicitud_id)
      if (previo) return { numero_oc: previo.numero_oc, fecha: previo.fecha }
      const registro: Registro = {
        numero_oc: String(PRIMER_NUMERO + registros.length),
        fecha: new Date().toISOString(),
        solicitud_id: orden.referencia.solicitud_id,
        orden,
      }
      await mkdir(this.carpeta, { recursive: true })
      await appendFile(this.archivo, `${JSON.stringify(registro)}\n`, "utf8")
      return { numero_oc: registro.numero_oc, fecha: registro.fecha }
    })
  }

  /** Fecha de una OC existente (para respuestas idempotentes). */
  async fechaDe(numero_oc: string): Promise<string | null> {
    return (await this.leer()).find((r) => r.numero_oc === numero_oc)?.fecha ?? null
  }
}
