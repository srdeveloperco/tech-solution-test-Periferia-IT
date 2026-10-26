import Anthropic from "@anthropic-ai/sdk"
import type { BloqueContenido, LlmAdapter, MensajeLlm, PeticionLlm, RespuestaLlm } from "./adapter"
import { ErrorLlm } from "./adapter"

type Opciones = { apiKey: string; timeoutMs: number }

/** Implementación del adaptador sobre la API de Anthropic (Messages + streaming + prompt caching). */
export class AdaptadorAnthropic implements LlmAdapter {
  readonly proveedor = "anthropic"
  private readonly cliente: Anthropic
  private readonly timeoutMs: number

  constructor(opciones: Opciones) {
    this.cliente = new Anthropic({ apiKey: opciones.apiKey, maxRetries: 2 })
    this.timeoutMs = opciones.timeoutMs
  }

  async enviar(peticion: PeticionLlm): Promise<RespuestaLlm> {
    const params = construirParams(peticion)
    for (let intento = 0; ; intento++) {
      try {
        const stream = this.cliente.messages.stream(params, { timeout: this.timeoutMs })
        if (peticion.onTexto) {
          const onTexto = peticion.onTexto
          stream.on("text", (delta) => onTexto(delta))
        }
        const mensaje = await stream.finalMessage()
        return convertirRespuesta(mensaje)
      } catch (error) {
        // Entrada de herramienta con JSON no parseable (streaming ansioso): se reintenta una vez.
        if (!(error instanceof Anthropic.APIError) && error instanceof SyntaxError && intento < 1) continue
        throw traducirError(error, this.timeoutMs)
      }
    }
  }
}

function construirParams(p: PeticionLlm): Anthropic.MessageStreamParams {
  const ultimo = p.sistema.length - 1
  const system: Anthropic.TextBlockParam[] = p.sistema.map((texto, i) =>
    i === ultimo ? { type: "text", text: texto, cache_control: { type: "ephemeral" } } : { type: "text", text: texto },
  )
  const tools: Anthropic.Tool[] | undefined = p.herramientas?.map((h) => ({
    name: h.nombre,
    description: h.descripcion,
    input_schema: h.esquema as Anthropic.Tool.InputSchema,
    eager_input_streaming: true,
  }))
  const outputConfig: Anthropic.OutputConfig = { effort: p.esfuerzo ?? "medium" }
  if (p.salidaJson) outputConfig.format = { type: "json_schema", schema: p.salidaJson }
  return {
    model: p.modelo,
    max_tokens: p.maxTokens,
    system,
    messages: p.mensajes.map(convertirMensaje),
    cache_control: { type: "ephemeral" },
    output_config: outputConfig,
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(tools && p.sinHerramientas ? { tool_choice: { type: "none" } } : {}),
  }
}

function convertirMensaje(m: MensajeLlm): Anthropic.MessageParam {
  const content: Anthropic.ContentBlockParam[] = []
  for (const b of m.contenido) {
    const bloque = convertirBloque(b)
    if (bloque) content.push(bloque)
  }
  return { role: m.rol === "usuario" ? "user" : "assistant", content }
}

function convertirBloque(b: BloqueContenido): Anthropic.ContentBlockParam | null {
  switch (b.tipo) {
    case "texto":
      return { type: "text", text: b.texto }
    case "uso_herramienta":
      return { type: "tool_use", id: b.id, name: b.nombre, input: b.entrada }
    case "resultado_herramienta":
      return { type: "tool_result", tool_use_id: b.idUso, content: b.contenido, is_error: b.esError }
    case "crudo":
      // Bloques de thinking: se devuelven sin modificar (historial solo de anexión).
      return b.proveedor === "anthropic" ? (b.dato as Anthropic.ContentBlockParam) : null
  }
}

function convertirRespuesta(m: Anthropic.Message): RespuestaLlm {
  const contenido: BloqueContenido[] = m.content.map((b): BloqueContenido => {
    if (b.type === "text") return { tipo: "texto", texto: b.text }
    if (b.type === "tool_use") return { tipo: "uso_herramienta", id: b.id, nombre: b.name, entrada: b.input }
    return { tipo: "crudo", proveedor: "anthropic", dato: b }
  })
  return {
    contenido,
    parada: traducirParada(m.stop_reason),
    modelo: m.model,
    uso: {
      entrada: m.usage.input_tokens,
      salida: m.usage.output_tokens,
      cacheLectura: m.usage.cache_read_input_tokens ?? 0,
      cacheEscritura: m.usage.cache_creation_input_tokens ?? 0,
    },
  }
}

function traducirParada(razon: Anthropic.Message["stop_reason"]): RespuestaLlm["parada"] {
  switch (razon) {
    case "end_turn":
    case "stop_sequence":
      return "fin"
    case "tool_use":
      return "herramientas"
    case "max_tokens":
      return "limite_tokens"
    case "refusal":
      return "rechazo"
    default:
      return "otro"
  }
}

function traducirError(error: unknown, timeoutMs: number): ErrorLlm {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ErrorLlm(`El modelo no respondió en ${Math.round(timeoutMs / 1000)} s. Intenta de nuevo.`, true)
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ErrorLlm("La clave del proveedor del modelo no es válida. Revisa la configuración del servidor.", false)
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ErrorLlm("El proveedor del modelo está limitando las peticiones. Espera un momento y reintenta.", true)
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ErrorLlm("No pude conectar con el proveedor del modelo. Revisa la conexión y reintenta.", true)
  }
  if (error instanceof Anthropic.APIError) {
    return new ErrorLlm(`El proveedor del modelo respondió con un error (${error.status ?? "sin código"}).`, true)
  }
  return new ErrorLlm("Ocurrió un error inesperado al consultar el modelo.", true)
}
