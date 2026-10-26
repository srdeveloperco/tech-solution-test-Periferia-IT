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
export type SaludDto = { ok: true; provider: string; model: string; modelos: Record<Exclude<AgenteId, "conversador">, string> }

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
