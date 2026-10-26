/**
 * commit-msg: exige Conventional Commits (en español), ej. "feat(tools): valida tope del aprobador".
 * Uso: bun scripts/harness/commit-msg.ts <ruta-del-mensaje>
 */
const TIPOS = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]
const PATRON = new RegExp(`^(${TIPOS.join("|")})(\\([a-z0-9._/-]+\\))?!?: .{3,}`)

const ruta = process.argv[2]
if (!ruta) {
  console.error("commit-msg: falta la ruta del mensaje")
  process.exit(1)
}

const primera = (await Bun.file(ruta).text()).split("\n")[0]?.trim() ?? ""
if (primera.startsWith("Merge ") || primera.startsWith("Revert ") || primera.startsWith("fixup! ")) process.exit(0)

if (!PATRON.test(primera)) {
  console.error(
    [
      `Mensaje de commit inválido: "${primera}"`,
      "Formato: <tipo>(<alcance opcional>): <descripción>",
      `Tipos: ${TIPOS.join(", ")}`,
      "Ejemplo: feat(tools): bloquea OC cuando el aprobador supera su tope",
    ].join("\n"),
  )
  process.exit(1)
}
if (primera.length > 100) {
  console.error(`La primera línea tiene ${primera.length} caracteres (máximo 100).`)
  process.exit(1)
}
