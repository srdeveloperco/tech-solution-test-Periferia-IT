import type { EventoChat, PeticionChat, RespuestaChat } from "@oc/contracts"
import { crearReproductor } from "../demo/reproductor"
import { apiFetch, errorDe, modoDemo } from "./http"

export type Transporte = (
  peticion: PeticionChat,
  alEvento: (evento: EventoChat) => void,
  senal: AbortSignal,
) => Promise<void>

const TIPOS = new Set<string>([
  "sesion",
  "ruta",
  "pensando",
  "texto_delta",
  "verificacion",
  "herramienta_inicio",
  "herramienta_fin",
  "mensaje",
  "confirmacion",
  "error",
  "fin",
])

function esEvento(valor: unknown): valor is EventoChat {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "tipo" in valor &&
    typeof valor.tipo === "string" &&
    TIPOS.has(valor.tipo)
  )
}

function parsearBloque(bloque: string): EventoChat | null {
  const datos = bloque
    .split(/\r?\n/)
    .filter((linea) => linea.startsWith("data:"))
    .map((linea) => linea.slice(5).trimStart())
    .join("\n")
  if (!datos) return null
  try {
    const valor: unknown = JSON.parse(datos)
    return esEvento(valor) ? valor : null
  } catch {
    return null
  }
}

/** Si el servidor respondió JSON en vez de stream, se traduce a la misma secuencia de eventos. */
function eventosDesdeRespuesta(respuesta: RespuestaChat): EventoChat[] {
  const eventos: EventoChat[] = [{ tipo: "sesion", sessionId: respuesta.sessionId }]
  if (respuesta.ruta) eventos.push({ tipo: "ruta", ruta: respuesta.ruta })
  for (const llamada of respuesta.toolCalls) {
    eventos.push({ tipo: "herramienta_inicio", id: llamada.id, nombre: llamada.nombre, args: llamada.args })
    eventos.push({
      tipo: "herramienta_fin",
      id: llamada.id,
      nombre: llamada.nombre,
      ok: llamada.ok ?? false,
      resumen: llamada.resumen,
      resultado: llamada.resultado,
      ms: llamada.ms ?? 0,
    })
  }
  eventos.push({ tipo: "mensaje", texto: respuesta.reply })
  if (respuesta.confirmacion) eventos.push({ tipo: "confirmacion", ...respuesta.confirmacion })
  eventos.push({ tipo: "fin", respuesta })
  return eventos
}

const SEPARADOR = /\r?\n\r?\n/

export const transporteSse: Transporte = async (peticion, alEvento, senal) => {
  const respuesta = await apiFetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(peticion),
    signal: senal,
  })
  if (!respuesta.ok) throw await errorDe(respuesta)

  if ((respuesta.headers.get("content-type") ?? "").includes("application/json")) {
    const cuerpo = (await respuesta.json()) as RespuestaChat
    for (const evento of eventosDesdeRespuesta(cuerpo)) alEvento(evento)
    return
  }
  if (!respuesta.body) throw new Error("El servidor no envió respuesta.")

  const lector = respuesta.body.getReader()
  const decodificador = new TextDecoder()
  let bufer = ""
  for (;;) {
    const { value, done } = await lector.read()
    if (done) break
    bufer += decodificador.decode(value, { stream: true })
    let corte = bufer.search(SEPARADOR)
    while (corte >= 0) {
      const evento = parsearBloque(bufer.slice(0, corte))
      bufer = bufer.slice(corte).replace(SEPARADOR, "")
      if (evento) alEvento(evento)
      corte = bufer.search(SEPARADOR)
    }
  }
  const ultimo = parsearBloque(bufer)
  if (ultimo) alEvento(ultimo)
}

export function transporte(): Transporte {
  const demo = modoDemo()
  return demo ? crearReproductor(demo) : transporteSse
}
