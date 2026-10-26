/** Utilidades compartidas por los hooks de Claude Code (leen JSON por stdin). */
import { isAbsolute, relative, resolve, sep } from "node:path"

export type EntradaHook = {
  hook_event_name?: string
  tool_name?: string
  tool_input?: { file_path?: string; notebook_path?: string; command?: string }
  stop_hook_active?: boolean
  cwd?: string
}

export async function leerEntrada(): Promise<EntradaHook> {
  const texto = await Bun.stdin.text()
  if (!texto.trim()) return {}
  try {
    return JSON.parse(texto) as EntradaHook
  } catch {
    return {}
  }
}

export function raizProyecto(entrada: EntradaHook): string {
  return process.env.CLAUDE_PROJECT_DIR ?? entrada.cwd ?? process.cwd()
}

/** Ruta relativa al repo con separador "/", o null si queda fuera del repo. */
export function rutaRelativa(raiz: string, ruta: string): string | null {
  const absoluta = isAbsolute(ruta) ? ruta : resolve(raiz, ruta)
  const rel = relative(raiz, absoluta)
  if (rel.startsWith("..") || isAbsolute(rel)) return null
  return rel.split(sep).join("/")
}

/** Bloquea la acción: Claude recibe el motivo por stderr (exit 2). */
export function bloquear(motivo: string): never {
  console.error(motivo)
  process.exit(2)
}
