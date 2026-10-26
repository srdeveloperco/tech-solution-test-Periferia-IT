/**
 * Genera modulo/ (bonus PRD 9.4) desde las MISMAS fuentes que usa la aplicación:
 *  - modulo/agent.md          ← apps/backend/agent/voz.md + prompt.md (system prompt del operador)
 *  - modulo/tools/oc.ts       ← reexporta apps/backend/src/tools/oc.ts (no es una copia)
 *  - modulo/skill/ordenes-compra/SKILL.md ← apps/backend/src/knowledge/ordenes-compra.md
 * Uso: bun scripts/modulo.ts          (escribe)
 *      bun scripts/modulo.ts --check  (falla si modulo/ no está sincronizado; lo corre la CI)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const raiz = join(import.meta.dir, "..")
const leer = (ruta: string) => readFile(join(raiz, ruta), "utf8").catch(() => "")

async function generar(): Promise<Record<string, string>> {
  const voz = await leer("apps/backend/agent/voz.md")
  const prompt = await leer("apps/backend/agent/prompt.md")
  const conocimiento = await leer("apps/backend/src/knowledge/ordenes-compra.md")
  const aviso = "<!-- Generado por scripts/modulo.ts desde apps/backend. No editar a mano. -->"
  const agente = [
    "---",
    "description: Prepara, valida y crea órdenes de compra en SAP a partir del paquete de correo (solicitud, cotización y aprobación), con controles RC1–RC10 y confirmación humana.",
    "mode: primary",
    "permission:",
    "  edit: deny",
    "  bash: deny",
    "---",
    aviso,
    "",
    [voz.trim(), prompt.trim()].filter(Boolean).join("\n\n"),
    "",
  ].join("\n")
  const skill = [
    "---",
    "name: ordenes-compra",
    "description: Conocimiento del proceso de órdenes de compra de Periferia en SAP (controles RC1–RC10, qué hacer ante cada bloqueo, glosario SAP y política de OC retroactivas). Úsalo al preparar o revisar una OC.",
    "---",
    aviso,
    "",
    conocimiento.trim(),
    "",
  ].join("\n")
  const herramientas = [
    "/**",
    " * Herramientas del agente de órdenes de compra, importables sin el servidor HTTP.",
    " * Son exactamente las de la aplicación (reexport, no copia): oc_leer_paquete, oc_validar,",
    " * oc_construir_payload, oc_generar_evidencia y oc_crear. Contrato: execute(args, { directory, sessionId }).",
    " */",
    'export * from "../../apps/backend/src/tools/oc"',
    'export type { ToolContext, ToolDef } from "../../apps/backend/src/tools/tipos"',
    "",
  ].join("\n")
  return {
    "modulo/agent.md": agente,
    "modulo/skill/ordenes-compra/SKILL.md": skill,
    "modulo/tools/oc.ts": herramientas,
  }
}

const archivos = await generar()
const verificar = process.argv.includes("--check")
const desfasados: string[] = []
for (const [ruta, contenido] of Object.entries(archivos)) {
  if (verificar) {
    if ((await leer(ruta)) !== contenido) desfasados.push(ruta)
    continue
  }
  await mkdir(dirname(join(raiz, ruta)), { recursive: true })
  await writeFile(join(raiz, ruta), contenido, "utf8")
}
if (verificar && desfasados.length > 0) {
  console.error(`modulo/ no está sincronizado con apps/backend: ${desfasados.join(", ")}. Corre: bun run modulo:build`)
  process.exit(1)
}
console.log(verificar ? "modulo/ sincronizado ✓" : `modulo/ generado: ${Object.keys(archivos).join(", ")}`)
