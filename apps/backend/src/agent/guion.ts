import type { Hallazgo, OrdenCompra } from "@oc/contracts"
import type { BloqueContenido, LlmAdapter, MensajeLlm, PeticionLlm, RespuestaLlm } from "../llm/adapter"
import { USO_CERO } from "../llm/adapter"
import { type ContextoOperador, leerContexto } from "./memoria"
import { formatearCop, parsearResultado } from "./resumen"
import { casoMencionado, normalizar } from "./router"

type Json = Record<string, unknown>
type Paso = { nombre: string; r: Json }

/**
 * Proveedor determinista sin clave ni red: mismo contrato que un modelo real.
 * Sirve para CI, demo sin costo y respaldo cuando no hay clave configurada.
 */
export class AdaptadorGuion implements LlmAdapter {
  readonly proveedor = "guion"

  async enviar(p: PeticionLlm): Promise<RespuestaLlm> {
    const contenido = this.responder(p)
    const texto = contenido.find((b) => b.tipo === "texto")
    if (texto && texto.tipo === "texto" && p.onTexto) p.onTexto(texto.texto)
    const usaHerramienta = contenido.some((b) => b.tipo === "uso_herramienta")
    return { contenido, parada: usaHerramienta ? "herramientas" : "fin", uso: { ...USO_CERO }, modelo: p.modelo }
  }

  private responder(p: PeticionLlm): BloqueContenido[] {
    switch (p.agente) {
      case "router":
        return [texto(JSON.stringify(clasificar(ultimoTextoUsuario(p.mensajes))))]
      case "operador":
        return operar(p)
      case "asesor":
        return [texto(asesorar(p.mensajes))]
      case "conversador":
        return [
          texto(
            "Aquí estoy para ayudarte con órdenes de compra. Dime, por ejemplo, «procesa la sol-001» y la reviso de punta a punta.",
          ),
        ]
    }
  }
}

const texto = (t: string): BloqueContenido => ({ tipo: "texto", texto: t })

function ultimoTextoUsuario(mensajes: MensajeLlm[]): string {
  const primero = mensajes.find((m) => m.rol === "usuario")
  return (primero?.contenido ?? [])
    .filter((b) => b.tipo === "texto")
    .map((b) => (b.tipo === "texto" ? b.texto : ""))
    .join("\n")
}

function clasificar(t: string): { intencion: string; caso: string | null; motivo: string } {
  const n = normalizar(t.replace(/<contexto>[\s\S]*?<\/contexto>/, ""))
  const caso = casoMencionado(n)
  if (/\b(regla|control|rc\d+|retroactiv|como funciona|que es|por que|politica|tope|aprobador)\b/.test(n)) {
    return { intencion: "consulta_proceso", caso, motivo: "Pregunta sobre el proceso" }
  }
  if (/\b(cuantas|estado|resumen|como va|como vamos|que paso|control)\b/.test(n)) {
    return { intencion: "estado", caso, motivo: "Pregunta por el estado" }
  }
  if (caso) return { intencion: "procesar_caso", caso, motivo: "Menciona un caso" }
  return { intencion: "charla", caso: null, motivo: "Conversación general" }
}

// ── Operador determinista ────────────────────────────────────────────────────

let secuencia = 0
function usar(nombre: string, entrada: Json): BloqueContenido {
  secuencia += 1
  return { tipo: "uso_herramienta", id: `guion_${secuencia}`, nombre, entrada }
}

function pasosDelTurno(mensajes: MensajeLlm[]): Paso[] {
  const nombres = new Map<string, string>()
  const pasos: Paso[] = []
  for (const m of mensajes) {
    for (const b of m.contenido) {
      if (b.tipo === "uso_herramienta") nombres.set(b.id, b.nombre)
      if (b.tipo === "resultado_herramienta") {
        pasos.push({ nombre: nombres.get(b.idUso) ?? "", r: parsearResultado(b.contenido) })
      }
    }
  }
  return pasos
}

const dataDe = (paso: Paso | undefined): Json | null =>
  paso && paso.r.ok === true && typeof paso.r.data === "object" && paso.r.data !== null ? (paso.r.data as Json) : null

function operar(p: PeticionLlm): BloqueContenido[] {
  const ctx = leerContexto(ultimoTextoUsuario(p.mensajes))
  const pasos = pasosDelTurno(p.mensajes)
  const ultimo = pasos.at(-1)
  if (!ctx?.caso) return [texto("¿Qué solicitud quieres que procese? Dime el caso, por ejemplo sol-001.")]
  if (p.sinHerramientas || ultimo?.nombre === "oc_crear") return [texto(redactarCierre(ctx, pasos))]
  if (ctx.intencion === "rechazar") {
    return [texto(`Entendido, no creo la OC de ${ctx.caso}. Queda pendiente en el control para cuando la retomes.`)]
  }
  if (ctx.intencion === "confirmar" && ctx.orden_validada && pasos.length === 0) {
    return [usar("oc_crear", { caso: ctx.caso, payload: ctx.orden_validada, confirmado: true })]
  }
  return [siguientePaso(ctx, pasos)]
}

function siguientePaso(ctx: ContextoOperador, pasos: Paso[]): BloqueContenido {
  const caso = ctx.caso as string
  const ultimo = pasos.at(-1)
  const paquete = dataDe(pasos.find((s) => s.nombre === "oc_leer_paquete"))
  const validacion = dataDe(pasos.find((s) => s.nombre === "oc_validar"))
  const construccion = dataDe(pasos.find((s) => s.nombre === "oc_construir_payload"))
  const confirmado = ctx.confirmacion_otorgada ? { confirmado: true } : {}
  if (!ultimo) return usar("oc_leer_paquete", { caso })
  if (ultimo.nombre === "oc_leer_paquete") {
    return paquete ? usar("oc_validar", { caso, paquete }) : texto(errorPaquete(caso, ultimo.r))
  }
  if (ultimo.nombre === "oc_validar" && validacion) {
    const bloqueos = Array.isArray(validacion.bloqueos) ? validacion.bloqueos : []
    if (bloqueos.length > 0) return usar("oc_crear", { caso, payload: null })
    return usar("oc_construir_payload", { caso, paquete, derivados: validacion.derivados ?? {} })
  }
  if (ultimo.nombre === "oc_construir_payload") {
    return construccion ? usar("oc_generar_evidencia", { caso }) : usar("oc_crear", { caso, payload: null })
  }
  if (ultimo.nombre === "oc_generar_evidencia") {
    return usar("oc_crear", { caso, payload: construccion?.orden ?? null, ...confirmado })
  }
  return texto(`No pude completar el proceso de ${caso}: ${String(ultimo.r.error ?? "error desconocido")}.`)
}

function errorPaquete(caso: string, r: Json): string {
  return `No pude leer el paquete de ${caso}: ${String(r.error ?? "error desconocido")}. Pídele al solicitante que reenvíe lo que falta.`
}

function totalOrden(orden: OrdenCompra | null): number | null {
  if (!orden) return null
  return orden.posiciones.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0)
}

function redactarCierre(ctx: ContextoOperador, pasos: Paso[]): string {
  const caso = ctx.caso as string
  const crear = [...pasos].reverse().find((s) => s.nombre === "oc_crear")
  const orden = (dataDe(pasos.find((s) => s.nombre === "oc_construir_payload"))?.orden ??
    ctx.orden_validada) as OrdenCompra | null
  const evidencia = dataDe(pasos.find((s) => s.nombre === "oc_generar_evidencia"))
  if (!crear) return `Revisé ${caso}, pero no alcancé a registrar el intento en SAP. Pídeme que lo retome.`
  const r = crear.r
  if (r.ok === true) return cierreCreada(caso, dataDe(crear) ?? {}, orden, evidencia)
  if (r.resultado === "pendiente") return cierrePendiente(caso, (r.confirmaciones as Hallazgo[]) ?? [], orden)
  if (r.resultado === "bloqueada") return cierreBloqueada(caso, (r.bloqueos as Hallazgo[]) ?? [])
  return `No pude crear la OC de ${caso}: ${String(r.error ?? "error desconocido")}.`
}

function cierreCreada(caso: string, d: Json, orden: OrdenCompra | null, evidencia: Json | null): string {
  if (d.idempotente === true) return `Esa solicitud ya tenía OC: la ${String(d.numero_oc)}. No creé una segunda.`
  const total = totalOrden(orden)
  const partes = [
    `Listo, la OC ${String(d.numero_oc)} quedó creada en SAP${orden ? ` para ${orden.proveedor.nombre}` : ""}${total !== null ? ` por ${formatearCop(total)}` : ""}.`,
  ]
  if (d.retroactiva === true) {
    partes.push("La marqué como retroactiva en el control: la factura llegó antes que la solicitud.")
  }
  if (evidencia?.ruta_pdf) partes.push(`La evidencia de aprobación quedó en ${String(evidencia.ruta_pdf)}.`)
  else partes.push(`Caso ${caso} cerrado.`)
  return partes.join(" ")
}

function cierrePendiente(caso: string, confirmaciones: Hallazgo[], orden: OrdenCompra | null): string {
  const total = totalOrden(orden)
  const lista = confirmaciones.map((h) => `- **${h.titulo}.** ${h.detalle}`).join("\n")
  const encabezado = `La OC de ${caso}${total !== null ? ` por ${formatearCop(total)}` : ""} está lista, pero necesito tu visto bueno en ${confirmaciones.length === 1 ? "un punto" : `${confirmaciones.length} puntos`}:`
  return `${encabezado}\n\n${lista}\n\n¿La creo así?`
}

function cierreBloqueada(caso: string, bloqueos: Hallazgo[]): string {
  const [primero, ...resto] = bloqueos
  if (!primero) return `No puedo crear la OC de ${caso}: no pasó los controles.`
  const extra =
    resto.length > 0
      ? ` Además hay ${resto.length === 1 ? "otro bloqueo" : `${resto.length} bloqueos más`}: ${resto.map((h) => h.titulo).join("; ")}.`
      : ""
  return `No puedo crear la OC de ${caso}. ${primero.titulo}: ${primero.detalle} ${primero.accion_sugerida}${extra}`
}

// ── Asesor determinista ──────────────────────────────────────────────────────

function asesorar(mensajes: MensajeLlm[]): string {
  const t = ultimoTextoUsuario(mensajes)
  const m = t.match(/<datos>([\s\S]*?)<\/datos>/)
  let casos: Array<{ caso: string; estado: string | null; numero_oc: string | null }> = []
  try {
    casos = m?.[1] ? ((JSON.parse(m[1]) as Json).casos as typeof casos) : []
  } catch {
    casos = []
  }
  const creadas = casos.filter((c) => c.estado === "creada" || c.estado === "idempotente")
  const bloqueadas = casos.filter((c) => c.estado === "bloqueada")
  const pendientes = casos.filter((c) => c.estado === "pendiente")
  const sinProcesar = casos.filter((c) => c.estado === null)
  const nombres = (xs: typeof casos) => (xs.length > 0 ? ` (${xs.map((c) => c.caso).join(", ")})` : "")
  return [
    `Así va todo: ${creadas.length} con OC creada${nombres(creadas)}, ${bloqueadas.length} bloqueadas${nombres(bloqueadas)} y ${pendientes.length} esperando confirmación${nombres(pendientes)}.`,
    sinProcesar.length > 0 ? `Sin procesar: ${sinProcesar.map((c) => c.caso).join(", ")}.` : "",
    "Para el detalle de reglas, pregúntame por un control en particular.",
  ]
    .filter(Boolean)
    .join(" ")
}
