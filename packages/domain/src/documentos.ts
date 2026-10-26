/** Lectura de documentos en texto (cotización, factura, aprobación). Puro, sin IO. */
import type { Paquete } from "./esquemas"
import { normalizarNit, parsearMonto, soloFecha, sumarDias } from "./normalizar"

type Cotizacion = NonNullable<Paquete["cotizacion"]>
type Factura = NonNullable<Paquete["factura"]>

function campo(texto: string, etiqueta: RegExp): string | null {
  const m = etiqueta.exec(texto)
  return m?.[1]?.trim() ?? null
}

/** Línea "TOTAL ...: COP 11.400.000" (evita "Subtotal"). */
function leerTotal(texto: string): { total: number; moneda: string | null } | null {
  const m = /^\s*TOTAL\b[^:\n]*:\s*(?:([A-Z]{3})\s*)?\$?\s*([\d.,]+)/im.exec(texto)
  if (!m?.[2]) return null
  const total = parsearMonto(m[2])
  return total === null ? null : { total, moneda: m[1] ?? null }
}

function leerValidez(texto: string, fecha: string | null): string | null {
  const explicita = campo(texto, /validez[^:\n]*:\s*(?:hasta\s*)?(\d{4}-\d{2}-\d{2})/i)
  if (explicita) return explicita
  const dias = campo(texto, /validez[^:\n]*:\s*(\d+)\s*d[ií]as/i)
  return dias && fecha ? sumarDias(fecha, Number(dias)) : null
}

export type ErrorLectura = { error: string }

export function parsearCotizacion(texto: string, monedaPorDefecto: string): Cotizacion | ErrorLectura {
  const total = leerTotal(texto)
  if (!total) return { error: "La cotización no tiene una línea TOTAL legible" }
  const fecha = soloFecha(campo(texto, /^\s*Fecha[^:\n]*:\s*(\S+)/im) ?? "")
  const monedaTexto = /\bUSD\b/.test(texto) ? "USD" : /\bCOP\b/.test(texto) ? "COP" : null
  return {
    numero: campo(texto, /COTIZACI[ÓO]N\s+(?:N[°ºo.]*\s*)?([A-Z0-9][A-Z0-9-]*)/i),
    fecha,
    proveedor: campo(texto, /^\s*Proveedor:\s*(.+)$/im) ?? "",
    nit: normalizarNit(campo(texto, /^\s*NIT:\s*([\d.\- ]+)/im)),
    total: total.total,
    moneda: total.moneda ?? monedaTexto ?? monedaPorDefecto,
    validez_hasta: leerValidez(texto, fecha),
    texto,
  }
}

export function parsearFactura(texto: string): Factura | ErrorLectura {
  const total = leerTotal(texto)
  const fecha = soloFecha(
    campo(texto, /^\s*Fecha(?:\s+de)?(?:\s+(?:emisi[óo]n|expedici[óo]n|factura))?[^:\n]*:\s*(\S+)/im) ?? "",
  )
  if (!fecha) return { error: "La factura no tiene una fecha legible" }
  const numero =
    campo(texto, /FACTURA[^\n]*?(?:N[°ºo.]*|No\.?|#)\s*:?\s*([A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*)/i) ??
    campo(texto, /FACTURA\s+(?:ELECTR[ÓO]NICA\s+(?:DE\s+VENTA\s+)?)?([A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*)/i) ??
    "sin-numero"
  return { numero, fecha, total: total?.total ?? 0 }
}

/** El cuerpo contiene "Aprobado" y no es una negación ("no aprobado", "no está aprobado"). */
export function contieneAprobacion(cuerpo: string): boolean {
  if (/\bno\s+(?:est[aá]\s+|queda\s+|ha\s+sido\s+|fue\s+)?aprobad[oa]\b/i.test(cuerpo)) return false
  return /\baprobad[oa]\b/i.test(cuerpo)
}
