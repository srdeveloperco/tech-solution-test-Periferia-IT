/** Redacción de secretos y serialización segura antes de persistir en el observatorio. */

const PATRONES: Array<[RegExp, string]> = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-***"],
  [/sk-[A-Za-z0-9]{20,}/g, "sk-***"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "<jwt-redactado>"],
  [/AKIA[0-9A-Z]{16}/g, "AKIA***"],
  [/("(?:clave|password|contrasena|secret|secreto|api_?key|token)"\s*:\s*)"[^"]*"/gi, '$1"***"'],
]

/** Tamaño máximo por campo para no inflar la base (los resultados de herramientas pueden ser grandes). */
const MAX_CARACTERES = 200_000

export function redactar(texto: string): string {
  let salida = texto
  for (const [patron, reemplazo] of PATRONES) salida = salida.replace(patron, reemplazo)
  return salida
}

function recortar(texto: string): string {
  if (texto.length <= MAX_CARACTERES) return texto
  return `${texto.slice(0, MAX_CARACTERES)}…[recortado: ${texto.length - MAX_CARACTERES} caracteres]`
}

/** JSON redactado y acotado; nunca lanza (valores no serializables quedan como texto). */
export function aJson(valor: unknown): string {
  let json: string
  try {
    json = JSON.stringify(valor ?? null) ?? "null"
  } catch {
    json = JSON.stringify(String(valor))
  }
  return recortar(redactar(json))
}

export function deJson(texto: string | null): unknown {
  if (texto === null) return null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

export function textoSeguro(texto: string): string {
  return recortar(redactar(texto))
}
