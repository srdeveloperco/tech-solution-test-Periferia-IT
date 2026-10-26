/**
 * PreToolUse (Edit|Write|MultiEdit|NotebookEdit): protege rutas que el agente no debe tocar.
 * fixtures/ son insumos de Periferia (inmutables), out/ lo genera la app, .env guarda claves,
 * bun.lock solo cambia vía `bun install`.
 */
import { bloquear, leerEntrada, raizProyecto, rutaRelativa } from "./_comun"

const PROTEGIDAS: { patron: RegExp; motivo: string }[] = [
  { patron: /^fixtures\//, motivo: "fixtures/ son insumos entregados por Periferia y no se modifican (PRD 6.5)." },
  { patron: /^out\//, motivo: "out/ lo genera la aplicación en ejecución; no se edita a mano." },
  { patron: /(^|\/)\.env(?!\.example$)(\..*)?$/, motivo: "Los .env guardan secretos; edítalos tú fuera del agente." },
  { patron: /(^|\/)bun\.lock$/, motivo: "bun.lock solo cambia ejecutando `bun install`/`bun add`." },
]

const entrada = await leerEntrada()
const ruta = entrada.tool_input?.file_path ?? entrada.tool_input?.notebook_path
if (!ruta) process.exit(0)

const rel = rutaRelativa(raizProyecto(entrada), ruta)
if (rel === null) process.exit(0)

for (const { patron, motivo } of PROTEGIDAS) {
  if (patron.test(rel)) bloquear(`Bloqueado por guard-paths: ${rel}\n${motivo}`)
}
process.exit(0)
