/**
 * Stop: antes de dar por terminado un turno con cambios en apps/ o packages/,
 * corre typecheck + límites de capas + tests (si existen). Si algo falla, el agente sigue trabajando (exit 2).
 * Se ejecuta una sola vez por turno (stop_hook_active evita bucles).
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { leerEntrada, raizProyecto } from "./_comun"

const entrada = await leerEntrada()
if (entrada.stop_hook_active) process.exit(0)

const raiz = raizProyecto(entrada)
if (!existsSync(join(raiz, "node_modules"))) process.exit(0)

const cambios = Bun.spawnSync(["git", "status", "--porcelain", "--", "apps", "packages", "demo.ts", "scripts"], {
  cwd: raiz,
  stdout: "pipe",
})
if (!cambios.stdout.toString().trim()) process.exit(0)

const PASOS: { nombre: string; cmd: string[]; timeoutMs: number }[] = [
  { nombre: "typecheck", cmd: ["bun", "run", "typecheck"], timeoutMs: 120_000 },
  { nombre: "límites de capas", cmd: ["bun", "run", "boundaries"], timeoutMs: 30_000 },
  { nombre: "tests (si existen)", cmd: ["bun", "run", "test", "--bail"], timeoutMs: 120_000 },
]

const fallos: string[] = []
for (const paso of PASOS) {
  const proc = Bun.spawnSync(paso.cmd, { cwd: raiz, stdout: "pipe", stderr: "pipe", timeout: paso.timeoutMs })
  if (proc.exitCode !== 0) {
    const salida = `${proc.stdout.toString()}${proc.stderr.toString()}`.trim().split("\n").slice(-40).join("\n")
    fallos.push(`── ${paso.nombre} falló ──\n${salida}`)
  }
}

if (fallos.length === 0) process.exit(0)
console.error(
  `Verificación previa a terminar (hook Stop):\n\n${fallos.join("\n\n")}\n\nCorrige antes de cerrar el turno.`,
)
process.exit(2)
