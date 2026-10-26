import type { EventoChat, Hallazgo, MensajeVisible, RutaTurno, ToolCallVisible } from "@oc/contracts"

export type Confirmacion = { caso: string; confirmaciones: Hallazgo[] }

export type MensajeUsuario = { id: string; rol: "usuario"; texto: string; ts: string }

export type MensajeAgente = {
  id: string
  rol: "agente"
  ts: string
  /** Texto definitivo (evento `mensaje`). */
  texto: string
  /** Texto que llega en streaming (`texto_delta`) mientras no hay definitivo. */
  borrador: string
  enCurso: boolean
  toolCalls: ToolCallVisible[]
  ruta: RutaTurno | null
  confirmacion: Confirmacion | null
  costoUsd: number | null
  verificacion: { ok: boolean; detalle: string } | null
  error: string | null
}

export type Mensaje = MensajeUsuario | MensajeAgente

export type EstadoChat = {
  sessionId: string | null
  mensajes: Mensaje[]
  ocupado: boolean
  pendiente: Confirmacion | null
}

export type AccionChat =
  | { tipo: "enviar"; texto: string }
  | { tipo: "evento"; evento: EventoChat }
  | { tipo: "fallo"; mensaje: string }
  | { tipo: "cerrar" }
  | { tipo: "restaurar"; sessionId: string; mensajes: MensajeVisible[] }
  | { tipo: "descartar_pendiente" }
  | { tipo: "nueva" }

export const estadoInicial: EstadoChat = { sessionId: null, mensajes: [], ocupado: false, pendiente: null }

let secuencia = 0
const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}-${(secuencia++).toString(36)}`

function agenteVacio(): MensajeAgente {
  return {
    id: nuevoId("a"),
    rol: "agente",
    ts: new Date().toISOString(),
    texto: "",
    borrador: "",
    enCurso: true,
    toolCalls: [],
    ruta: null,
    confirmacion: null,
    costoUsd: null,
    verificacion: null,
    error: null,
  }
}

/** Aplica un cambio al último mensaje del agente (el turno en curso). */
function conUltimoAgente(estado: EstadoChat, cambio: (m: MensajeAgente) => MensajeAgente): EstadoChat {
  const indice = estado.mensajes.findLastIndex((m) => m.rol === "agente")
  const actual = estado.mensajes[indice]
  if (indice < 0 || !actual || actual.rol !== "agente") return estado
  const mensajes = estado.mensajes.slice()
  mensajes[indice] = cambio(actual)
  return { ...estado, mensajes }
}

function aplicarEvento(estado: EstadoChat, evento: EventoChat): EstadoChat {
  switch (evento.tipo) {
    case "sesion":
      return { ...estado, sessionId: evento.sessionId }
    case "ruta":
      return conUltimoAgente(estado, (m) => ({ ...m, ruta: evento.ruta }))
    case "pensando":
      return estado
    case "texto_delta":
      return conUltimoAgente(estado, (m) => ({ ...m, borrador: m.borrador + evento.texto }))
    case "mensaje":
      return conUltimoAgente(estado, (m) => ({ ...m, texto: evento.texto, borrador: "" }))
    case "verificacion":
      return conUltimoAgente(estado, (m) => ({ ...m, verificacion: { ok: evento.ok, detalle: evento.detalle } }))
    case "herramienta_inicio":
      return conUltimoAgente(estado, (m) => ({
        ...m,
        toolCalls: [
          ...m.toolCalls,
          { id: evento.id, nombre: evento.nombre, args: evento.args, ok: null, resumen: "", resultado: null, ms: null },
        ],
      }))
    case "herramienta_fin":
      return conUltimoAgente(estado, (m) => {
        const existe = m.toolCalls.some((t) => t.id === evento.id)
        const fin: ToolCallVisible = {
          id: evento.id,
          nombre: evento.nombre,
          args: existe ? (m.toolCalls.find((t) => t.id === evento.id)?.args ?? null) : null,
          ok: evento.ok,
          resumen: evento.resumen,
          resultado: evento.resultado,
          ms: evento.ms,
        }
        return {
          ...m,
          toolCalls: existe ? m.toolCalls.map((t) => (t.id === evento.id ? fin : t)) : [...m.toolCalls, fin],
        }
      })
    case "confirmacion": {
      const confirmacion = { caso: evento.caso, confirmaciones: evento.confirmaciones }
      return { ...conUltimoAgente(estado, (m) => ({ ...m, confirmacion })), pendiente: confirmacion }
    }
    case "error":
      return conUltimoAgente(estado, (m) => ({ ...m, error: evento.mensaje }))
    case "fin": {
      const r = evento.respuesta
      const siguiente = conUltimoAgente(estado, (m) => ({
        ...m,
        enCurso: false,
        texto: m.texto || r.reply || m.borrador,
        borrador: "",
        ruta: m.ruta ?? r.ruta,
        toolCalls: m.toolCalls.length > 0 ? m.toolCalls : r.toolCalls,
        confirmacion: m.confirmacion ?? r.confirmacion,
        costoUsd: r.uso.costoUsd,
      }))
      return {
        ...siguiente,
        sessionId: r.sessionId || siguiente.sessionId,
        ocupado: false,
        pendiente: r.needsConfirmation ? (r.confirmacion ?? siguiente.pendiente) : null,
      }
    }
  }
}

export function reducirChat(estado: EstadoChat, accion: AccionChat): EstadoChat {
  switch (accion.tipo) {
    case "enviar": {
      const usuario: MensajeUsuario = {
        id: nuevoId("u"),
        rol: "usuario",
        texto: accion.texto,
        ts: new Date().toISOString(),
      }
      return { ...estado, ocupado: true, pendiente: null, mensajes: [...estado.mensajes, usuario, agenteVacio()] }
    }
    case "evento":
      return aplicarEvento(estado, accion.evento)
    case "fallo":
      return {
        ...conUltimoAgente(estado, (m) => ({
          ...m,
          enCurso: false,
          error: accion.mensaje,
          texto: m.texto || m.borrador,
          borrador: "",
          toolCalls: m.toolCalls.map((t) => (t.ok === null ? { ...t, ok: false, resumen: "Interrumpida" } : t)),
        })),
        ocupado: false,
      }
    case "cerrar":
      if (!estado.ocupado) return estado
      return {
        ...conUltimoAgente(estado, (m) => ({ ...m, enCurso: false, texto: m.texto || m.borrador, borrador: "" })),
        ocupado: false,
      }
    case "restaurar":
      return {
        sessionId: accion.sessionId,
        ocupado: false,
        pendiente: pendienteFinal(accion.mensajes),
        mensajes: accion.mensajes.map(desdeVisible),
      }
    case "descartar_pendiente":
      return { ...estado, pendiente: null }
    case "nueva":
      return estadoInicial
  }
}

function desdeVisible(m: MensajeVisible): Mensaje {
  if (m.rol === "usuario") return { id: nuevoId("u"), rol: "usuario", texto: m.texto, ts: m.ts }
  return {
    ...agenteVacio(),
    ts: m.ts,
    texto: m.texto,
    enCurso: false,
    toolCalls: m.toolCalls,
    ruta: m.ruta,
    confirmacion: m.confirmacion,
  }
}

/** Si el último mensaje del agente pedía confirmación, la hoja de decisión vuelve a mostrarse. */
function pendienteFinal(mensajes: MensajeVisible[]): Confirmacion | null {
  const ultimo = mensajes.at(-1)
  return ultimo && ultimo.rol === "agente" ? ultimo.confirmacion : null
}
