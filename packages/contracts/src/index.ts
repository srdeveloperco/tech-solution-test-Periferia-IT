/**
 * Contrato HTTP entre @oc/backend y @oc/web. Solo tipos: el front los importa con `import type`.
 */
import type { Hallazgo, OrdenCompra, ResultadoCrear, Validacion } from "@oc/domain"

export type { Hallazgo, OrdenCompra, ResultadoCrear, Validacion }

/** POST /api/chat */
export type PeticionChat = {
  sessionId?: string
  message: string
  /** Lo envía el botón "Confirmar y crear OC". Equivale a escribir "confirmo" para ese caso. */
  confirmar?: { caso: string }
}

export type ToolCallVisible = {
  id: string
  nombre: string
  args: unknown
  ok: boolean | null // null = en curso
  resumen: string
  resultado: unknown
  ms: number | null
}

/** Eventos SSE de POST /api/chat (cada uno en `data: <json>\n\n`). */
/** Agentes del sistema (orquestación secuencial: router → especialista → verificador). */
export type AgenteId = "router" | "operador" | "asesor" | "conversador"

export type RutaTurno = {
  agente: Exclude<AgenteId, "router">
  intencion: "procesar_caso" | "confirmar" | "rechazar" | "consulta_proceso" | "estado" | "charla" | "fuera_de_alcance"
  caso: string | null
  /** "reglas" = enrutado determinista sin costo; si no, id del modelo que enrutó. */
  enrutador: string
  modelo: string // modelo del especialista que atiende el turno
  motivo: string
}

export type EventoChat =
  | { tipo: "sesion"; sessionId: string }
  | { tipo: "ruta"; ruta: RutaTurno }
  | { tipo: "pensando" }
  | { tipo: "texto_delta"; texto: string }
  | { tipo: "verificacion"; ok: boolean; detalle: string }
  | { tipo: "herramienta_inicio"; id: string; nombre: string; args: unknown }
  | {
      tipo: "herramienta_fin"
      id: string
      nombre: string
      ok: boolean
      resumen: string
      resultado: unknown
      ms: number
    }
  | { tipo: "mensaje"; texto: string }
  | { tipo: "confirmacion"; caso: string; confirmaciones: Hallazgo[] }
  | { tipo: "error"; mensaje: string }
  | { tipo: "fin"; respuesta: RespuestaChat }

/** Respuesta final (también es el cuerpo JSON si se pide `Accept: application/json`). */
export type RespuestaChat = {
  sessionId: string
  reply: string
  toolCalls: ToolCallVisible[]
  needsConfirmation: boolean
  confirmacion: { caso: string; confirmaciones: Hallazgo[] } | null
  ruta: RutaTurno | null
  uso: { tokensEntrada: number; tokensSalida: number; iteraciones: number; costoUsd: number }
  presupuesto: PresupuestoDto
  interaccionId: string
}

export type MensajeVisible =
  | { rol: "usuario"; texto: string; ts: string }
  | {
      rol: "agente"
      texto: string
      ts: string
      toolCalls: ToolCallVisible[]
      confirmacion: { caso: string; confirmaciones: Hallazgo[] } | null
      ruta: RutaTurno | null
    }

/** GET /api/sessions/:id */
export type SesionDto = { sessionId: string; mensajes: MensajeVisible[] }

/** GET /api/health */
export type SaludDto = {
  ok: true
  provider: string
  model: string
  modelos: Record<Exclude<AgenteId, "conversador">, string>
}

/** GET /api/casos */
export type CasoResumen = {
  caso: string // nombre de carpeta, ej. "sol-004"
  solicitud_id: string | null
  descripcion: string | null
  proveedor: string | null
  valor_total: number | null
  moneda: string | null
  estado: ResultadoCrear | null // último resultado registrado en control.csv
  numero_oc: string | null
}

// ── Autenticación ────────────────────────────────────────────────────────────

/** GET /api/auth/config (público) */
export type ConfigAuth = { modo: "cognito" | "local" | "abierto" }

/** POST /api/auth/login (público) */
export type PeticionLogin = { usuario: string; clave: string }
/** "admin" ve todo (chat, observatorio, costos); "analista" solo el chat. Rol = grupo "admin" de Cognito. */
export type RolUsuario = "admin" | "analista"
export type UsuarioDto = { email: string; nombre: string | null; rol: RolUsuario }
export type RespuestaLogin =
  | { ok: true; token: string; expiraEn: number; usuario: UsuarioDto }
  | { ok: false; error: string }

/** Todas las rutas /api/* salvo /api/health y /api/auth/* exigen `Authorization: Bearer <token>`. */

// ── Observatorio y presupuesto ───────────────────────────────────────────────

/** GET /api/presupuesto — límite global de gasto en IA de la cuenta de prueba. */
export type PresupuestoDto = { limiteUsd: number; gastadoUsd: number; restanteUsd: number; bloqueado: boolean }

export type ResultadoInteraccion = "ok" | "error" | "confirmacion" | "bloqueado_presupuesto"

export type InteraccionResumen = {
  id: string
  sessionId: string
  usuario: string | null
  ts: string
  mensajeUsuario: string
  agente: string | null
  intencion: string | null
  caso: string | null
  llamadasLlm: number
  herramientas: number
  tokensEntrada: number
  tokensSalida: number
  costoUsd: number
  ms: number
  resultado: ResultadoInteraccion
}

export type LlamadaLlmDto = {
  id: string
  interaccionId: string
  ts: string
  agente: string
  proveedor: string
  modelo: string
  /** Texto completo del system prompt enviado y su hash (versión del prompt). */
  sistema: string
  promptHash: string
  mensajes: unknown
  herramientas: string[]
  /** Variables dinámicas con las que se compuso la llamada (caso, pendiente, iteración, etc.). */
  variables: Record<string, unknown>
  respuesta: unknown
  stopReason: string | null
  tokensEntrada: number
  tokensSalida: number
  tokensCacheLectura: number
  tokensCacheEscritura: number
  costoUsd: number
  ms: number
  error: string | null
}

export type EjecucionHerramientaDto = {
  id: string
  interaccionId: string
  ts: string
  agente: string
  nombre: string
  args: unknown
  resultado: unknown
  ok: boolean
  ms: number
}

/** GET /api/observatorio/interacciones/:id */
export type InteraccionDetalle = InteraccionResumen & {
  respuesta: string
  ruta: RutaTurno | null
  llamadas: LlamadaLlmDto[]
  herramientasEjecutadas: EjecucionHerramientaDto[]
}

/** GET /api/observatorio/resumen */
export type ObservatorioResumen = {
  presupuesto: PresupuestoDto
  totales: {
    interacciones: number
    llamadasLlm: number
    tokensEntrada: number
    tokensSalida: number
    costoUsd: number
    costoPromedioInteraccionUsd: number
    latenciaP50Ms: number
    latenciaP95Ms: number
  }
  porModelo: Array<{ modelo: string; llamadas: number; tokensEntrada: number; tokensSalida: number; costoUsd: number }>
  porAgente: Array<{ agente: string; llamadas: number; costoUsd: number }>
  prompts: Array<{ hash: string; agente: string; usos: number; primeraVez: string }>
}
/** GET /api/observatorio/interacciones?limite=50 → InteraccionResumen[] */
