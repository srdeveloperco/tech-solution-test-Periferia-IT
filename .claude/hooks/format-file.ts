/**
 * PostToolUse (Edit|Write|MultiEdit): formatea y aplica fixes seguros de Biome al archivo editado.
 * Si quedan errores de lint, los devuelve al agente (exit 2) para que los corrija en el siguiente paso.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { leerEntrada, raizProyecto, rutaRelativa } from "./_comun"

const SOPORTADOS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|css)$/

const entrada = await leerEntrada()
const ruta = entrada.tool_input?.file_path
if (!ruta || !SOPORTADOS.test(ruta)) process.exit(0)

const raiz = raizProyecto(entrada)
const rel = rutaRelativa(raiz, ruta)
const biome = join(raiz, "node_modules", ".bin", "biome")
if (rel === null || !existsSync(biome)) process.exit(0)

const proc = Bun.spawnSync(
  [biome, "check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true", "--colors=off", rel],
  { cwd: raiz, stdout: "pipe", stderr: "pipe" },
)
if (proc.exitCode === 0) process.exit(0)

const salida = `${proc.stdout.toString()}${proc.stderr.toString()}`.trim().split("\n").slice(0, 60).join("\n")
console.error(`Biome encontró problemas en ${rel} que no pudo corregir solo:\n${salida}`)
process.exit(2)
