/** Configuración del agente leída de variables de entorno (nunca contiene claves en claro hacia afuera). */
export type ConfigAgente = {
  proveedor: "anthropic" | "guion"
  modelos: { router: string; operador: string; asesor: string; conversador: string }
  maxTokens: { router: number; operador: number; asesor: number; conversador: number }
  maxIteraciones: number
  maxTokensSesion: number
  timeoutMs: number
}

export const MODELO_GUION = "guion-determinista"

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number.parseInt(valor ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : porDefecto
}

export function cargarConfig(env: Record<string, string | undefined>): ConfigAgente {
  const quiereAnthropic = (env.LLM_PROVIDER ?? "anthropic") === "anthropic"
  const proveedor = quiereAnthropic && env.ANTHROPIC_API_KEY ? "anthropic" : "guion"
  const haiku = "claude-haiku-5-5"
  const modelos =
    proveedor === "guion"
      ? { router: MODELO_GUION, operador: MODELO_GUION, asesor: MODELO_GUION, conversador: MODELO_GUION }
      : {
          router: env.LLM_MODELO_ROUTER ?? haiku,
          operador: env.LLM_MODELO_OPERADOR ?? env.LLM_MODEL ?? "claude-sonnet-5-5",
          asesor: env.LLM_MODELO_ASESOR ?? haiku,
          conversador: env.LLM_MODELO_CONVERSADOR ?? env.LLM_MODELO_ASESOR ?? haiku,
        }
  return {
    proveedor,
    modelos,
    maxTokens: { router: 1024, operador: 8000, asesor: 2000, conversador: 1000 },
    maxIteraciones: entero(env.AGENT_MAX_ITERACIONES, 25),
    maxTokensSesion: entero(env.AGENT_MAX_TOKENS_SESION, 300_000),
    timeoutMs: entero(env.LLM_TIMEOUT_MS, 60_000),
  }
}
