import type { z } from "zod"

/** Contexto que el backend (o demo.ts) entrega a cada herramienta. */
export type ToolContext = {
  /** Raíz del proyecto. Las rutas se resuelven desde aquí, nunca absolutas. */
  directory: string
  sessionId: string
}

/**
 * Contrato de herramienta del PRD (6.2). `execute` devuelve JSON serializado
 * `{ ok: true, data }` o `{ ok: false, error }` y nunca lanza.
 */
export type ToolDef<A extends z.ZodRawShape = z.ZodRawShape> = {
  description: string
  args: A
  execute(args: z.infer<z.ZodObject<A>>, ctx: ToolContext): Promise<string>
}

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string; [extra: string]: unknown }
