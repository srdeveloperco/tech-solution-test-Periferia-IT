import { z } from "zod"
import * as oc from "./oc"
import type { ToolContext, ToolDef } from "./tipos"

export * from "./consultas"
export * as oc from "./oc"
export { casoValido, rutas } from "./rutas"
export type { ToolContext, ToolDef, ToolResult } from "./tipos"

function esToolDef(valor: unknown): valor is ToolDef {
  if (typeof valor !== "object" || valor === null) return false
  const v = valor as Record<string, unknown>
  return typeof v.description === "string" && typeof v.execute === "function" && typeof v.args === "object"
}

/** Registra módulos de herramientas: cada export `x` de `archivo.ts` queda como `archivo_x`. */
export function registrar(modulos: Record<string, Record<string, unknown>>): Record<string, ToolDef> {
  const registro: Record<string, ToolDef> = {}
  for (const [archivo, exports] of Object.entries(modulos)) {
    for (const [nombre, def] of Object.entries(exports)) {
      if (esToolDef(def)) registro[`${archivo}_${nombre}`] = def
    }
  }
  return registro
}

/** Todas las herramientas que ve el modelo: oc_leer_paquete, oc_validar, ... */
export const herramientas = registrar({ oc })

/** Valida argumentos con zod y ejecuta. Nunca lanza: devuelve el JSON de la herramienta o un error legible. */
export async function ejecutar(nombre: string, args: unknown, ctx: ToolContext): Promise<string> {
  const def = herramientas[nombre]
  if (!def) return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${nombre}` })
  const parsed = z.object(def.args).safeParse(args)
  if (!parsed.success) {
    return JSON.stringify({ ok: false, error: `Argumentos inválidos para ${nombre}: ${z.prettifyError(parsed.error)}` })
  }
  try {
    return await def.execute(parsed.data, ctx)
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: `Error inesperado en ${nombre}: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
