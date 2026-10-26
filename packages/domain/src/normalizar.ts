/** Utilidades puras de normalización. Sin IO. */

/** "900.555.111-2" → "900555111" (sin puntos ni dígito de verificación). */
export function normalizarNit(nit: string | null | undefined): string | null {
  if (!nit) return null
  const base = nit.split("-")[0] ?? ""
  const digitos = base.replace(/\D/g, "")
  return digitos.length > 0 ? digitos : null
}

const SUFIJOS_LEGALES = new Set(["sas", "sa", "ltda", "limitada", "sca", "scs", "eu", "y", "cia"])

/** Nombre comparable: sin tildes, sin puntuación, sin sufijos societarios. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SUFIJOS_LEGALES.has(t))
    .join(" ")
}

/** Comparación de textos cortos (subáreas, emails) sin tildes ni mayúsculas. */
export function mismoTexto(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
  return n(a) === n(b)
}

/**
 * Monto en texto → número. Acepta formato colombiano ("COP 11.400.000", "1.234,50")
 * y anglosajón ("USD 1,234.50"). Devuelve null si no hay un número legible.
 */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,]/g, "")
  if (!/\d/.test(limpio)) return null
  const anglo = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(limpio) || /^\d+\.\d{1,2}$/.test(limpio)
  const normal = anglo ? limpio.replace(/,/g, "") : limpio.replace(/\./g, "").replace(",", ".")
  const valor = Number(normal)
  return Number.isFinite(valor) ? valor : null
}

/** Fecha ISO (con o sin hora/zona) → "YYYY-MM-DD" en la hora local del documento. */
export function soloFecha(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim())
  return m?.[1] ?? null
}

export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** "$11.400.000" para mensajes legibles. */
export function formatoMoneda(valor: number, moneda = "COP"): string {
  const n = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(valor)
  return moneda === "COP" ? `$${n}` : `${moneda} ${n}`
}

/** Recorta en límite de palabra sin superar `max` caracteres. */
export function recortarPalabras(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  if (limpio.length <= max) return limpio
  const corte = limpio.slice(0, max + 1)
  const ultimoEspacio = corte.lastIndexOf(" ")
  const base = ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : limpio.slice(0, max)
  return base.replace(/[\s,;:.-]+$/, "")
}
