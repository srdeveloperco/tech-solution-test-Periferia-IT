import type { LlmAdapter } from "../llm/adapter"
import { AdaptadorAnthropic } from "../llm/anthropic"
import type { ConfigAgente } from "./config"
import { AdaptadorGuion } from "./guion"

/** Fábrica del proveedor. Sin clave, cae al guion determinista (sin costo) y lo avisa. */
export function crearProveedor(config: ConfigAgente, env: Record<string, string | undefined>): LlmAdapter {
  if (config.proveedor === "anthropic" && env.ANTHROPIC_API_KEY) {
    return new AdaptadorAnthropic({ apiKey: env.ANTHROPIC_API_KEY, timeoutMs: config.timeoutMs })
  }
  if ((env.LLM_PROVIDER ?? "anthropic") === "anthropic") {
    console.warn("[llm] ANTHROPIC_API_KEY no está definida: uso el proveedor 'guion' (determinista, sin costo).")
  }
  return new AdaptadorGuion()
}
