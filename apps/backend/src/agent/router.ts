import type { PeticionChat, RutaTurno } from "@oc/contracts"
import { z } from "zod"
import { textoDe } from "../llm/adapter"
import type { ConfigAgente } from "./config"
import { type ContextoLlamada, llamarModelo } from "./modelo"
import type { Sesion } from "./sesiones"

type Intencion = RutaTurno["intencion"]

const AGENTE_POR_INTENCION: Record<Intencion, RutaTurno["agente"]> = {
  procesar_caso: "operador",
  confirmar: "operador",
  rechazar: "operador",
  consulta_proceso: "asesor",
  estado: "asesor",
  charla: "conversador",
  fuera_de_alcance: "conversador",
}

const SalidaRouter = z.object({
  intencion: z.enum([
    "procesar_caso",
    "confirmar",
    "rechazar",
    "consulta_proceso",
    "estado",
    "charla",
    "fuera_de_alcance",
  ]),
  caso: z.string().nullable(),
  motivo: z.string(),
})

const AFIRMACION =
  /^(si|sip|claro|confirmo|confirmado|dale|adelante|procede|proceda|de acuerdo|ok|okay|listo|correcto|hagale|apruebo|creala|crealo|hazlo|va)\b/
const NEGACION = /^(no|nop|cancela|cancelar|mejor no|espera|todavia no|aun no|rechazo|dejala|dejalo)\b/
const VERBO_PROCESAR =
  /\b(procesa|procesar|procesame|revisa|revisar|valida|validar|crea|crear|corre|ejecuta|prepara|analiza|haz|muestrame|arma|carga|tramita)\b/
const PREGUNTA_ESTADO = /\b(que paso|como va|como vamos|estado|por que|quedo|resultado de)\b/
const SALUDO = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias|hey|que tal)\b/

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function casoMencionado(texto: string): string | null {
  const m = normalizar(texto).match(/\bsol[-\s_]?0*(\d{1,3})\b/)
  return m?.[1] ? `sol-${m[1].padStart(3, "0")}` : null
}

function ruta(intencion: Intencion, caso: string | null, motivo: string, enrutador: string): Omit<RutaTurno, "modelo"> {
  return { agente: AGENTE_POR_INTENCION[intencion], intencion, caso, motivo, enrutador }
}

/** Reglas deterministas sin costo. Devuelve null si el mensaje es ambiguo. */
export function enrutarPorReglas(p: PeticionChat, sesion: Sesion): Omit<RutaTurno, "modelo"> | null {
  if (p.confirmar?.caso) return ruta("confirmar", p.confirmar.caso, "Botón de confirmación", "reglas")
  const t = normalizar(p.message)
  const caso = casoMencionado(p.message)
  const pendientes = sesion.pendientes.map((x) => x.caso)
  const objetivo = caso && pendientes.includes(caso) ? caso : caso === null ? (pendientes.at(-1) ?? null) : null
  if (objetivo) {
    if (AFIRMACION.test(t)) return ruta("confirmar", objetivo, "Afirmación con confirmación pendiente", "reglas")
    if (NEGACION.test(t)) return ruta("rechazar", objetivo, "Negación con confirmación pendiente", "reglas")
  }
  if (caso && VERBO_PROCESAR.test(t)) return ruta("procesar_caso", caso, "Pide procesar un caso", "reglas")
  if (caso && !PREGUNTA_ESTADO.test(t) && t.split(" ").length <= 4) {
    return ruta("procesar_caso", caso, "Mensaje corto con un caso", "reglas")
  }
  if (!caso && SALUDO.test(t) && t.split(" ").length <= 5) return ruta("charla", null, "Saludo", "reglas")
  return null
}

/** Router híbrido: reglas primero; si son ambiguas, un modelo pequeño clasifica con salida estructurada. */
export async function enrutar(
  p: PeticionChat,
  sesion: Sesion,
  llamada: ContextoLlamada,
  config: ConfigAgente,
  sistema: string[],
): Promise<RutaTurno> {
  const conModelo = (r: Omit<RutaTurno, "modelo">): RutaTurno => ({ ...r, modelo: config.modelos[r.agente] })
  const porReglas = enrutarPorReglas(p, sesion)
  if (porReglas) return conModelo(porReglas)
  const contexto = {
    pendientes: sesion.pendientes.map((x) => x.caso),
    casos_en_sesion: Object.keys(sesion.casos),
    ultimo_mensaje_agente: ultimoTextoAgente(sesion),
  }
  const respuesta = await llamarModelo(
    llamada,
    {
      agente: "router",
      modelo: config.modelos.router,
      sistema,
      mensajes: [
        {
          rol: "usuario",
          contenido: [{ tipo: "texto", texto: `<contexto>${JSON.stringify(contexto)}</contexto>\n\n${p.message}` }],
        },
      ],
      salidaJson: z.toJSONSchema(SalidaRouter) as Record<string, unknown>,
      maxTokens: config.maxTokens.router,
      esfuerzo: "low",
    },
    { agente: "router", pendientes: contexto.pendientes },
  )
  const salida = interpretar(textoDe(respuesta.contenido))
  return conModelo(
    ruta(salida.intencion, salida.caso ?? casoMencionado(p.message), salida.motivo, config.modelos.router),
  )
}

function interpretar(texto: string): z.infer<typeof SalidaRouter> {
  try {
    const r = SalidaRouter.safeParse(JSON.parse(texto))
    if (r.success) return r.data
  } catch {
    // salida no parseable: se trata como charla
  }
  return { intencion: "charla", caso: null, motivo: "Clasificación no disponible" }
}

function ultimoTextoAgente(sesion: Sesion): string | null {
  for (let i = sesion.visibles.length - 1; i >= 0; i--) {
    const m = sesion.visibles[i]
    if (m?.rol === "agente") return m.texto.slice(0, 400)
  }
  return null
}
