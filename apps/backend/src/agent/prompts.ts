import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Comportamiento (agent/*.md) y conocimiento (src/knowledge/*.md) viven en Markdown, fuera del código.
 * Se leen una vez y se componen por especialista; el orden es estable para aprovechar el caché del proveedor.
 */
const DIR_AGENTE = join(import.meta.dir, "..", "..", "agent")
const DIR_CONOCIMIENTO = join(import.meta.dir, "..", "knowledge")

function leer(ruta: string): string {
  return readFileSync(ruta, "utf8").trim()
}

export type Prompts = {
  router: string[]
  operador: string[]
  asesor: string[]
  conversador: string[]
}

export function cargarPrompts(maestros: string): Prompts {
  const voz = leer(join(DIR_AGENTE, "voz.md"))
  const conocimiento = leer(join(DIR_CONOCIMIENTO, "ordenes-compra.md"))
  const conocimientoConMaestros = `${conocimiento}\n\n## Maestros vigentes (solo lectura)\n\n${maestros}`
  return {
    router: [leer(join(DIR_AGENTE, "router.md"))],
    operador: [leer(join(DIR_AGENTE, "prompt.md")), voz, conocimiento],
    asesor: [leer(join(DIR_AGENTE, "asesor.md")), voz, conocimientoConMaestros],
    conversador: [leer(join(DIR_AGENTE, "conversador.md")), voz],
  }
}
