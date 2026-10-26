/**
 * Evaluador determinista (CA2): toda cifra relevante del texto final debe existir en las fuentes
 * del turno (resultados de herramientas, contexto y mensaje del usuario). No usa modelo.
 */

const PATRONES = [
  /\d{1,3}(?:\.\d{3})+(?:,\d+)?/g, // montos es-CO: 11.400.000
  /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, // montos en-US: 11,400,000
  /\b\d{6,}\b/g, // números largos: OC 4500000001, NIT 900555111
]

function soloDigitos(s: string): string {
  return s.replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "")
}

/** Cifras citadas en el texto (normalizadas a dígitos). Se ignoran números < 1.000 (cantidades, días, %). */
export function cifrasCitadas(texto: string): string[] {
  const encontradas = new Set<string>()
  for (const patron of PATRONES) {
    for (const m of texto.matchAll(patron)) {
      const d = soloDigitos(m[0])
      if (d.length >= 4) encontradas.add(d)
    }
  }
  return [...encontradas]
}

/** Universo de cifras conocidas: cualquier secuencia de dígitos de las fuentes, ignorando separadores. */
export function cifrasConocidas(fuentes: string[]): Set<string> {
  const conocidas = new Set<string>()
  for (const fuente of fuentes) {
    const compacto = fuente.replace(/(\d)[.,](?=\d{3}\b)/g, "$1")
    for (const m of compacto.matchAll(/\d+/g)) conocidas.add(m[0])
  }
  return conocidas
}

export type Verificacion = { ok: boolean; inventadas: string[] }

export function verificarCifras(texto: string, fuentes: string[]): Verificacion {
  const conocidas = cifrasConocidas(fuentes)
  const inventadas = cifrasCitadas(texto).filter((c) => !conocidas.has(c))
  return { ok: inventadas.length === 0, inventadas }
}

export function detalleVerificacion(v: Verificacion): string {
  return v.ok
    ? "Todas las cifras del mensaje salen de las herramientas."
    : `Cifras sin respaldo en las herramientas: ${v.inventadas.join(", ")}`
}
