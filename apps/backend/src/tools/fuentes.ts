/** Lectura de fixtures (solo lectura) y normalización del paquete (HU-1, HU-6). */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  AprobacionCruda,
  CentroCosto,
  CondicionPago,
  CorreoCrudo,
  contieneAprobacion,
  IndicadorIva,
  type Maestros,
  type Paquete,
  Proveedor,
  parsearCotizacion,
  parsearFactura,
  Solicitud,
} from "@oc/domain"
import { z } from "zod"
import { casoValido, rutas } from "./rutas"

type Lectura<T> = { ok: true; data: T } | { ok: false; error: string }

async function leerTexto(ruta: string): Promise<string | null> {
  return readFile(ruta, "utf8").catch(() => null)
}

/** Lee y valida un JSON. `null` si el archivo no existe; error legible si está malformado. */
async function leerJson<T>(ruta: string, nombre: string, esquema: z.ZodType<T>): Promise<Lectura<T | null>> {
  const texto = await leerTexto(ruta)
  if (texto === null) return { ok: true, data: null }
  let crudo: unknown
  try {
    crudo = JSON.parse(texto)
  } catch (e) {
    return {
      ok: false,
      error: `${nombre} no es un JSON válido (${e instanceof Error ? e.message : "error de sintaxis"}).`,
    }
  }
  const parsed = esquema.safeParse(crudo)
  if (!parsed.success) return { ok: false, error: `${nombre} tiene datos inválidos: ${z.prettifyError(parsed.error)}` }
  return { ok: true, data: parsed.data }
}

const cacheMaestros = new Map<string, Maestros>()

export async function leerMaestros(directory: string): Promise<Lectura<Maestros>> {
  const enCache = cacheMaestros.get(directory)
  if (enCache) return { ok: true, data: enCache }
  const dir = rutas(directory).maestros
  const [prov, cc, iva, pago] = await Promise.all([
    leerJson(join(dir, "proveedores.json"), "proveedores.json", z.array(Proveedor)),
    leerJson(join(dir, "centros-costo.json"), "centros-costo.json", z.array(CentroCosto)),
    leerJson(join(dir, "indicadores-iva.json"), "indicadores-iva.json", z.array(IndicadorIva)),
    leerJson(join(dir, "condiciones-pago.json"), "condiciones-pago.json", z.array(CondicionPago)),
  ])
  for (const r of [prov, cc, iva, pago]) if (!r.ok) return r
  if (!prov.ok || !cc.ok || !iva.ok || !pago.ok || !prov.data || !cc.data || !iva.data || !pago.data) {
    return { ok: false, error: "Faltan archivos de maestros en fixtures/reto-03/maestros/." }
  }
  const maestros: Maestros = {
    proveedores: prov.data,
    centrosCosto: cc.data,
    indicadoresIva: iva.data,
    condicionesPago: pago.data,
  }
  cacheMaestros.set(directory, maestros)
  return { ok: true, data: maestros }
}

export async function casosDisponibles(directory: string): Promise<string[]> {
  const entradas = await readdir(rutas(directory).solicitudes, { withFileTypes: true }).catch(() => [])
  return entradas
    .filter((e) => e.isDirectory() && casoValido(e.name))
    .map((e) => e.name)
    .sort()
}

async function validarCaso(directory: string, caso: string): Promise<string | null> {
  if (!casoValido(caso)) return `"${caso}" no es un nombre de caso válido (ej. sol-001).`
  const disponibles = await casosDisponibles(directory)
  if (!disponibles.includes(caso)) return `No existe el caso "${caso}". Casos disponibles: ${disponibles.join(", ")}.`
  return null
}

export async function leerAprobacionCruda(directory: string, caso: string): Promise<Lectura<AprobacionCruda | null>> {
  return leerJson(join(rutas(directory).caso(caso), "aprobacion.json"), "aprobacion.json", AprobacionCruda)
}

/** Paquete normalizado (PRD 7.2). Adjuntos ausentes → null + nombre en `faltantes`. Nunca lanza. */
export async function leerPaquete(directory: string, caso: string): Promise<Lectura<Paquete>> {
  const invalido = await validarCaso(directory, caso)
  if (invalido) return { ok: false, error: invalido }
  const dir = rutas(directory).caso(caso)

  const correo = await leerJson(join(dir, "correo.json"), "correo.json", CorreoCrudo)
  if (!correo.ok) return correo
  const solicitud = await leerJson(join(dir, "solicitud.json"), "solicitud.json (Excel de solicitud)", Solicitud)
  if (!solicitud.ok) return solicitud
  if (!solicitud.data) {
    return {
      ok: false,
      error:
        "Paquete incompleto: falta la solicitud (solicitud.xlsx). Pide al solicitante que la adjunte para poder procesar.",
    }
  }
  const aprobacion = await leerAprobacionCruda(directory, caso)
  if (!aprobacion.ok) return aprobacion

  const faltantes: string[] = []
  if (!correo.data) faltantes.push("correo.json (correo de entrada)")
  if (!aprobacion.data) faltantes.push("aprobacion.eml (correo de aprobación del líder)")

  const textoCot = await leerTexto(join(dir, "cotizacion.txt"))
  let cotizacion: Paquete["cotizacion"] = null
  if (textoCot === null) faltantes.push("cotizacion.pdf (cotización del proveedor)")
  else {
    const cot = parsearCotizacion(textoCot, solicitud.data.moneda)
    if ("error" in cot) faltantes.push(`cotizacion.pdf (ilegible: ${cot.error})`)
    else cotizacion = cot
  }

  const textoFac = await leerTexto(join(dir, "factura.txt"))
  let factura: Paquete["factura"] = null
  if (textoFac !== null) {
    const fac = parsearFactura(textoFac)
    if ("error" in fac) faltantes.push(`factura.pdf (ilegible: ${fac.error})`)
    else factura = fac
  } else if (correo.data?.adjuntos.some((a) => a.toLowerCase().startsWith("factura"))) {
    faltantes.push("factura.pdf (mencionada en el correo pero no adjunta)")
  }

  const c = correo.data
  return {
    ok: true,
    data: {
      correo: c
        ? { id: c.id, de: c.de, asunto: c.asunto, fecha: c.fecha }
        : { id: `${caso}-sin-correo`, de: "", asunto: "", fecha: "" },
      solicitud: solicitud.data,
      cotizacion,
      aprobacion: aprobacion.data
        ? {
            de: aprobacion.data.de,
            fecha: aprobacion.data.fecha,
            aprobado: contieneAprobacion(aprobacion.data.cuerpo),
            texto: aprobacion.data.cuerpo,
          }
        : null,
      factura,
      faltantes,
    },
  }
}
