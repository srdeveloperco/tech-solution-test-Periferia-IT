/**
 * Verificación determinista de límites entre capas (bun run boundaries).
 * Lee los imports de cada archivo y falla si una capa depende de otra que no debe.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

type Regla = {
  capa: string
  /** Carpeta raíz de la capa, relativa al repo. */
  raiz: string
  /** Patrones prohibidos sobre el especificador del import. */
  prohibidos: { patron: RegExp; motivo: string }[]
  /** Si es true, todo import de @oc/* debe ser `import type`. */
  soloTiposDe?: RegExp
}

const RAIZ = join(import.meta.dir, "..")

const REGLAS: Regla[] = [
  {
    capa: "packages/domain (reglas puras, sin IO)",
    raiz: "packages/domain/src",
    prohibidos: [
      { patron: /^(node:)?(fs|path|child_process|net|http|https)(\/|$)/, motivo: "el dominio no hace IO" },
      { patron: /^hono(\/|$)/, motivo: "el dominio no conoce HTTP" },
      { patron: /^@anthropic-ai\//, motivo: "el dominio no conoce al proveedor LLM" },
      { patron: /^@oc\/(backend|web)/, motivo: "el dominio no depende de apps" },
      { patron: /apps\//, motivo: "el dominio no depende de apps" },
    ],
  },
  {
    capa: "apps/backend/src/tools (ejecución)",
    raiz: "apps/backend/src/tools",
    prohibidos: [
      {
        patron: /^\.\.\/(agent|server|llm)(\/|$)/,
        motivo: "las herramientas no conocen el ciclo, el servidor ni el LLM",
      },
      { patron: /^hono(\/|$)/, motivo: "las herramientas son importables sin servidor HTTP" },
      { patron: /^@anthropic-ai\//, motivo: "las herramientas no dependen del proveedor LLM" },
    ],
  },
  {
    capa: "apps/backend/src/sap (adaptador SAP)",
    raiz: "apps/backend/src/sap",
    prohibidos: [
      {
        patron: /^\.\.\/(agent|server|llm)(\/|$)/,
        motivo: "el adaptador SAP no conoce el ciclo, el servidor ni el LLM",
      },
      { patron: /^hono(\/|$)/, motivo: "el adaptador SAP no depende del servidor HTTP" },
      { patron: /^@anthropic-ai\//, motivo: "el adaptador SAP no depende del proveedor LLM" },
    ],
  },
  {
    capa: "apps/backend/src/llm (adaptador de proveedor)",
    raiz: "apps/backend/src/llm",
    prohibidos: [
      {
        patron: /^\.\.\/(tools|agent|server)(\/|$)/,
        motivo: "el adaptador LLM no conoce herramientas, ciclo ni servidor",
      },
      { patron: /^hono(\/|$)/, motivo: "el adaptador LLM no depende del servidor HTTP" },
    ],
  },
  {
    capa: "apps/backend/src/agent (orquestación)",
    raiz: "apps/backend/src/agent",
    prohibidos: [
      { patron: /^hono(\/|$)/, motivo: "el ciclo del agente es independiente del transporte HTTP" },
      { patron: /^\.\.\/server(\/|$)/, motivo: "el ciclo del agente no depende del servidor" },
    ],
  },
  {
    capa: "apps/web (front)",
    raiz: "apps/web/src",
    prohibidos: [
      { patron: /^@oc\/(domain|backend)/, motivo: "el front solo conoce @oc/contracts" },
      { patron: /apps\/backend|packages\/domain/, motivo: "el front no importa código de servidor" },
      { patron: /^@anthropic-ai\//, motivo: "el front nunca habla con el proveedor LLM" },
    ],
    soloTiposDe: /^@oc\/contracts/,
  },
]

const EXTENSIONES = /\.(ts|tsx|mts|cts)$/
// import ... from "x" | export ... from "x" | import("x") | import "x"
const IMPORT_RE =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g

function archivos(dir: string): string[] {
  let entradas: string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return []
  }
  return entradas.flatMap((nombre) => {
    if (nombre === "node_modules" || nombre === "dist") return []
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return EXTENSIONES.test(nombre) && !nombre.endsWith(".d.ts") ? [ruta] : []
  })
}

type Violacion = { archivo: string; especificador: string; motivo: string }

function revisar(regla: Regla): Violacion[] {
  const violaciones: Violacion[] = []
  for (const archivo of archivos(join(RAIZ, regla.raiz))) {
    const codigo = readFileSync(archivo, "utf8")
    for (const m of codigo.matchAll(IMPORT_RE)) {
      const esTipo = Boolean(m[2])
      const especificador = m[3] ?? m[4]
      if (!especificador) continue
      const rel = relative(RAIZ, archivo).split(sep).join("/")
      for (const { patron, motivo } of regla.prohibidos) {
        if (patron.test(especificador)) violaciones.push({ archivo: rel, especificador, motivo })
      }
      if (regla.soloTiposDe?.test(especificador) && !esTipo && m[1] === "import") {
        violaciones.push({ archivo: rel, especificador, motivo: "usa `import type`: el contrato es solo de tipos" })
      }
    }
  }
  return violaciones
}

const todas = REGLAS.flatMap((regla) => revisar(regla).map((v) => ({ ...v, capa: regla.capa })))

if (todas.length === 0) {
  console.log(`✓ Límites de capas OK (${REGLAS.length} capas revisadas)`)
  process.exit(0)
}

console.error(`✗ ${todas.length} violación(es) de límites de capas:\n`)
for (const v of todas) {
  console.error(`  ${v.archivo}\n    import "${v.especificador}" → ${v.motivo}  [${v.capa}]`)
}
console.error("\nRevisa la dirección de dependencias en AGENTS.md (sección Arquitectura).")
process.exit(1)
