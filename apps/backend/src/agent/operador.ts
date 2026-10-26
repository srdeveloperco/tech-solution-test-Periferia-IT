import type { EventoChat, Hallazgo, RutaTurno, ToolCallVisible } from "@oc/contracts"
import { z } from "zod"
import type { BloqueContenido, HerramientaLlm, MensajeLlm, RespuestaLlm } from "../llm/adapter"
import { textoDe, usosDe } from "../llm/adapter"
import { esquemaJson } from "../llm/esquema"
import { ejecutar, herramientas, rutas } from "../tools"
import type { ConfigAgente } from "./config"
import { registrarEnLog } from "./log"
import { bloqueContexto, contextoOperador, recordar } from "./memoria"
import { type ContextoLlamada, llamarModelo, tokensDelContador } from "./modelo"
import { parsearResultado, resumirArgs, resumirResultado } from "./resumen"
import { ponerPendiente, quitarPendiente, type Sesion } from "./sesiones"
import { detalleVerificacion, verificarCifras } from "./verificador"

export type ResultadoEspecialista = {
  texto: string
  toolCalls: ToolCallVisible[]
  confirmacion: { caso: string; confirmaciones: Hallazgo[] } | null
}

export type DepsEspecialista = {
  llamada: ContextoLlamada
  config: ConfigAgente
  sistema: string[]
  directory: string
  sesion: Sesion
  emitir: (e: EventoChat) => void
}

type Uso = Extract<BloqueContenido, { tipo: "uso_herramienta" }>

/** Herramientas oc_* en el formato del adaptador (JSON Schema desde zod). Orden estable para el caché. */
export const HERRAMIENTAS_LLM: HerramientaLlm[] = Object.entries(herramientas).map(([nombre, def]) => ({
  nombre,
  descripcion: def.description,
  esquema: esquemaJson(z.object(def.args)),
}))

const NOTA_PENDIENTE =
  "<nota_orquestador>La OC quedó pendiente de confirmación humana. Cierra el turno con un resumen breve y UNA pregunta cerrada para que el usuario confirme. No llames más herramientas.</nota_orquestador>"

/** Estado mutable de un turno del operador. */
class Turno {
  readonly mensajes: MensajeLlm[] = []
  readonly fuentes: string[] = []
  readonly toolCalls: ToolCallVisible[] = []
  confirmacion: ResultadoEspecialista["confirmacion"] = null
  soloTexto = false
  iteraciones = 0
}

/** Especialista con herramientas: ciclo modelo → herramientas → modelo con tope y guardas deterministas. */
export async function ejecutarOperador(
  deps: DepsEspecialista,
  textoUsuario: string,
  ruta: RutaTurno,
): Promise<ResultadoEspecialista> {
  const ctx = contextoOperador(deps.sesion, ruta)
  const turno = new Turno()
  const contexto = bloqueContexto(ctx)
  turno.fuentes.push(textoUsuario, contexto)
  turno.mensajes.push({
    rol: "usuario",
    contenido: [
      { tipo: "texto", texto: textoUsuario },
      { tipo: "texto", texto: contexto },
    ],
  })
  const variables = {
    agente: "operador",
    intencion: ruta.intencion,
    caso: ctx.caso,
    pendiente: ctx.pendiente?.caso ?? null,
  }
  let texto = await ciclo(deps, turno, variables)
  texto = await verificar(deps, turno, texto, variables)
  return { texto, toolCalls: turno.toolCalls, confirmacion: turno.confirmacion }
}

async function ciclo(deps: DepsEspecialista, turno: Turno, variables: Record<string, unknown>): Promise<string> {
  while (turno.iteraciones < deps.config.maxIteraciones) {
    if (excedeTokensSesion(deps)) return "Esta sesión llegó a su tope de uso. Abre una sesión nueva para seguir."
    const respuesta = await llamar(deps, turno, { ...variables, iteracion: turno.iteraciones + 1 })
    turno.mensajes.push({ rol: "asistente", contenido: respuesta.contenido })
    const usos = usosDe(respuesta.contenido)
    if (respuesta.parada !== "herramientas" || usos.length === 0 || turno.soloTexto) return textoFinal(respuesta)
    const resultados: BloqueContenido[] = []
    for (const uso of usos) resultados.push(await ejecutarUso(deps, turno, uso))
    if (turno.soloTexto) resultados.push({ tipo: "texto", texto: NOTA_PENDIENTE })
    turno.mensajes.push({ rol: "usuario", contenido: resultados })
  }
  return cerrarPorTope(deps, turno, variables)
}

async function llamar(deps: DepsEspecialista, turno: Turno, variables: Record<string, unknown>): Promise<RespuestaLlm> {
  turno.iteraciones += 1
  return llamarModelo(
    deps.llamada,
    {
      agente: "operador",
      modelo: deps.config.modelos.operador,
      sistema: deps.sistema,
      mensajes: turno.mensajes,
      herramientas: HERRAMIENTAS_LLM,
      sinHerramientas: turno.soloTexto,
      maxTokens: deps.config.maxTokens.operador,
      esfuerzo: "medium",
      onTexto: (delta) => deps.emitir({ tipo: "texto_delta", texto: delta }),
    },
    variables,
  )
}

function textoFinal(r: RespuestaLlm): string {
  const texto = textoDe(r.contenido)
  if (r.parada === "rechazo") return "No puedo continuar con esta solicitud. Si crees que es un error, reformúlala."
  if (texto) return texto
  if (r.parada === "limite_tokens") return "Me quedé sin espacio para responder. Pídeme el resultado de nuevo."
  return "Terminé los pasos, pero no tengo un resumen que mostrar. Revisa las herramientas ejecutadas."
}

function excedeTokensSesion(deps: DepsEspecialista): boolean {
  return deps.sesion.tokensUsados + tokensDelContador(deps.llamada.contador) >= deps.config.maxTokensSesion
}

/** CA1: al llegar al tope, una última llamada sin herramientas resume lo hecho y lo que falta. */
async function cerrarPorTope(
  deps: DepsEspecialista,
  turno: Turno,
  variables: Record<string, unknown>,
): Promise<string> {
  const ultimo = turno.mensajes.at(-1)
  const nota = `<nota_orquestador>Llegaste al tope de ${deps.config.maxIteraciones} pasos. Resume lo que lograste y lo que falta, sin llamar herramientas.</nota_orquestador>`
  if (ultimo?.rol === "usuario") ultimo.contenido.push({ tipo: "texto", texto: nota })
  else turno.mensajes.push({ rol: "usuario", contenido: [{ tipo: "texto", texto: nota }] })
  turno.soloTexto = true
  try {
    const r = await llamar(deps, turno, { ...variables, motivo: "tope_iteraciones" })
    turno.mensajes.push({ rol: "asistente", contenido: r.contenido })
    return textoFinal(r)
  } catch {
    const hechos = turno.toolCalls.map((t) => `${t.nombre} (${t.ok ? "ok" : "falló"})`).join(", ")
    return `Llegué al tope de pasos de este turno. Alcancé a ejecutar: ${hechos || "nada"}. Pídeme que continúe.`
  }
}

/** Compuerta de confirmación: oc_crear con confirmado=true solo si el usuario confirmó ese caso. */
function compuertaBloquea(sesion: Sesion, uso: Uso): boolean {
  if (uso.nombre !== "oc_crear") return false
  const args = (uso.entrada ?? {}) as { caso?: unknown; confirmado?: unknown }
  if (args.confirmado !== true) return false
  return !(typeof args.caso === "string" && sesion.confirmacionesOtorgadas.includes(args.caso))
}

const ERROR_COMPUERTA = JSON.stringify({
  ok: false,
  error:
    "Requiere confirmación explícita del usuario. No uses confirmado=true hasta que el usuario confirme en su mensaje.",
})

async function ejecutarUso(deps: DepsEspecialista, turno: Turno, uso: Uso): Promise<BloqueContenido> {
  const { sesion, emitir, directory } = deps
  emitir({ tipo: "herramienta_inicio", id: uso.id, nombre: uso.nombre, args: uso.entrada })
  const inicio = performance.now()
  const bloqueada = compuertaBloquea(sesion, uso)
  const texto = bloqueada
    ? ERROR_COMPUERTA
    : await ejecutar(uso.nombre, uso.entrada, { directory, sessionId: sesion.id })
  const ms = Math.round(performance.now() - inicio)
  const r = parsearResultado(texto)
  const ok = r.ok === true
  const resumen = bloqueada ? "Compuerta: falta la confirmación del usuario" : resumirResultado(uso.nombre, r)
  emitir({ tipo: "herramienta_fin", id: uso.id, nombre: uso.nombre, ok, resumen, resultado: r, ms })
  turno.toolCalls.push({ id: uso.id, nombre: uso.nombre, args: uso.entrada, ok, resumen, resultado: r, ms })
  turno.fuentes.push(texto)
  registrar(deps, uso, r, ok, ms, resumen)
  aplicarEfectos(deps, turno, uso, r)
  const esResultadoDeNegocio = typeof r.resultado === "string"
  return { tipo: "resultado_herramienta", idUso: uso.id, contenido: texto, esError: !ok && !esResultadoDeNegocio }
}

function registrar(
  deps: DepsEspecialista,
  uso: Uso,
  r: Record<string, unknown>,
  ok: boolean,
  ms: number,
  resumen: string,
): void {
  registrarEnLog(rutas(deps.directory).log, {
    sessionId: deps.sesion.id,
    agente: "operador",
    herramienta: uso.nombre,
    args: resumirArgs(uso.entrada),
    ok,
    ms,
    resumen,
  })
  try {
    deps.llamada.observador.registrarHerramienta({
      interaccionId: deps.llamada.interaccionId,
      agente: "operador",
      nombre: uso.nombre,
      args: uso.entrada,
      resultado: r,
      ok,
      ms,
    })
  } catch {
    // la observabilidad no interrumpe el turno
  }
}

/** Memoria del caso, pendiente de confirmación y limpieza de la confirmación ya usada. */
function aplicarEfectos(deps: DepsEspecialista, turno: Turno, uso: Uso, r: Record<string, unknown>): void {
  const caso = (uso.entrada as { caso?: unknown } | null)?.caso
  if (typeof caso !== "string") return
  const { sesion } = deps
  recordar(sesion, uso.nombre, caso, r)
  if (uso.nombre !== "oc_crear") return
  if (r.resultado === "pendiente") {
    const confirmaciones = Array.isArray(r.confirmaciones) ? (r.confirmaciones as Hallazgo[]) : []
    ponerPendiente(sesion, { caso, confirmaciones })
    turno.confirmacion = { caso, confirmaciones }
    turno.soloTexto = true
    deps.emitir({ tipo: "confirmacion", caso, confirmaciones })
    return
  }
  if (r.ok === true || r.resultado === "bloqueada") quitarPendiente(sesion, caso)
}

/** CA2: si el texto cita cifras sin respaldo, un reintento con retroalimentación. */
async function verificar(
  deps: DepsEspecialista,
  turno: Turno,
  texto: string,
  variables: Record<string, unknown>,
): Promise<string> {
  const v = verificarCifras(texto, turno.fuentes)
  if (v.ok || turno.mensajes.at(-1)?.rol !== "asistente") {
    deps.emitir({ tipo: "verificacion", ok: v.ok, detalle: detalleVerificacion(v) })
    return texto
  }
  const nota = `<verificador>Tu respuesta cita cifras que no aparecen en los resultados de las herramientas: ${v.inventadas.join(", ")}. Reescríbela usando solo cifras que salieron de las herramientas.</verificador>`
  turno.mensajes.push({ rol: "usuario", contenido: [{ tipo: "texto", texto: nota }] })
  turno.soloTexto = true
  try {
    const r = await llamar(deps, turno, { ...variables, motivo: "verificador" })
    const corregido = textoFinal(r)
    const v2 = verificarCifras(corregido, turno.fuentes)
    deps.emitir({ tipo: "verificacion", ok: v2.ok, detalle: detalleVerificacion(v2) })
    return corregido
  } catch {
    deps.emitir({ tipo: "verificacion", ok: false, detalle: detalleVerificacion(v) })
    return texto
  }
}
