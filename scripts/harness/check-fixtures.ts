/**
 * pre-commit: fixtures/ es de solo lectura. Se permite AGREGAR casos nuevos entregados por Periferia,
 * pero no modificar, renombrar ni borrar los existentes.
 */
const proc = Bun.spawnSync(["git", "diff", "--cached", "--name-status", "--", "fixtures"], { stdout: "pipe" })
const cambios = proc.stdout
  .toString()
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("A"))

if (cambios.length > 0) {
  console.error(`fixtures/ son insumos de Periferia y no se modifican:\n  ${cambios.join("\n  ")}`)
  process.exit(1)
}
