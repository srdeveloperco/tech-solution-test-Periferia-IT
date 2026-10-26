import { readFileSync } from "node:fs"
import { join } from "node:path"
import type {
  ConversacionResumen,
  EventoChat,
  PeticionChat,
  RespuestaChat,
  ResultadoInteraccion,
  RutaTurno,
  SaludDto,
  SesionDto,
  UsuarioDto,
} from "@oc/contracts"
import type { LlmAdapter } from "../llm/adapter"
import { ErrorLlm } from "../llm/adapter"
import type { Observador } from "../observabilidad/tipos"
import { rutas } from "../tools"
import type { ConfigAgente } from "./config"
import { ejecutarAsesor, ejecutarConversador } from "./especialistas"
import { type Contador, type ContextoLlamada, contadorNuevo, ErrorPresupuesto, tokensDelContador } from "./modelo"
import { type DepsEspecialista, ejecutarOperador, type ResultadoEspecialista } from "./operador"
import { cargarPrompts, type Prompts } from "./prompts"
import { enrutar } from "./router"
import {
  AlmacenSesiones,
  pendienteDe,
  quitarPendiente,
  type RepositorioSesiones,
  type Sesion,
  ultimoPendiente,
} from "./sesiones"

export type Emisor = (evento: EventoChat) => void

export type OpcionesOrquestador = {
  directory: string
  llm: LlmAdapter
  config: ConfigAgente
  observador: Observador
  /** Punto de inyección de la persistencia de sesiones. Por defecto: memoria + JSON en out/sesiones. */
  almacen?: RepositorioSesiones
}

export type Orquestador = {
  procesarTurno(peticion: PeticionChat, usuario: UsuarioDto | null, emitir: Emisor): Promise<RespuestaChat>
  sesion(id: string, usuario: string | null): SesionDto | null
  conversaciones(usuario: string | null): ConversacionResumen[]
  salud(): SaludDto
}

type Salida = ResultadoEspecialista & { ruta: RutaTurno | null; resultado: ResultadoInteraccion; error: boolean }

/**
 * Orquestación secuencial por turno: router (reglas → modelo pequeño) → especialista
 * (operador con herramientas | asesor | conversador) → verificador determinista.
 */
export function crearOrquestador(opciones: OpcionesOrquestador): Orquestador {
  const { directory, llm, config, observador } = opciones
  const almacen = opciones.almacen ?? new AlmacenSesiones(() => rutas(directory).out)
  const prompts = cargarPrompts(leerMaestros(directory))

  async function procesarTurno(p: PeticionChat, usuario: UsuarioDto | null, emitir: Emisor): Promise<RespuestaChat> {
    const inicio = performance.now()
    const email = usuario?.email ?? null
    if (usuario) registrarUsuarioSeguro(almacen, usuario)
    const sesion = (p.sessionId ? almacen.obtener(p.sessionId, email) : null) ?? almacen.crear(email)
    emitir({ tipo: "sesion", sessionId: sesion.id })
    const interaccionId = observador.iniciarInteraccion({
      sessionId: sesion.id,
      usuario: email,
      mensaje: p.message,
    })
    const contador = contadorNuevo()
    const salida = almacen.bloquear(sesion.id)
      ? await atenderTurno(p, sesion, { llm, observador, interaccionId, contador }, emitir)
      : errorSalida("Todavía estoy trabajando en tu mensaje anterior. Dame un momento.")
    return finalizar(sesion, salida, contador, interaccionId, inicio, emitir)
  }

  async function atenderTurno(p: PeticionChat, sesion: Sesion, llamada: ContextoLlamada, emitir: Emisor) {
    sesion.visibles.push({ rol: "usuario", texto: p.message, ts: new Date().toISOString() })
    emitir({ tipo: "pensando" })
    let ruta: RutaTurno | null = null
    try {
      if (sesion.tokensUsados >= config.maxTokensSesion) {
        return errorSalida("Esta sesión llegó a su tope de uso. Abre una sesión nueva para seguir.")
      }
      const elegida = await enrutar(p, sesion, llamada, config, prompts.router)
      ruta = elegida
      observador.registrarRuta(llamada.interaccionId, elegida)
      emitir({ tipo: "ruta", ruta: elegida })
      aplicarDecision(sesion, elegida)
      const deps = (sistema: string[]): DepsEspecialista => ({ llamada, config, sistema, directory, sesion, emitir })
      const r = await despachar(elegida, p.message, deps, prompts)
      return { ...r, ruta: elegida, resultado: r.confirmacion ? "confirmacion" : "ok", error: false } satisfies Salida
    } catch (error) {
      return { ...salidaDeError(error), ruta }
    } finally {
      almacen.liberar(sesion.id)
    }
  }

  function finalizar(
    sesion: Sesion,
    s: Salida,
    contador: Contador,
    interaccionId: string,
    inicio: number,
    emitir: Emisor,
  ): RespuestaChat {
    sesion.tokensUsados += tokensDelContador(contador)
    sesion.costoUsd += contador.costoUsd
    emitir(s.error ? { tipo: "error", mensaje: s.texto } : { tipo: "mensaje", texto: s.texto })
    sesion.visibles.push({
      rol: "agente",
      texto: s.texto,
      ts: new Date().toISOString(),
      toolCalls: s.toolCalls,
      confirmacion: s.confirmacion,
      ruta: s.ruta,
    })
    almacen.guardar(sesion)
    const ms = Math.round(performance.now() - inicio)
    cerrarSeguro(observador, interaccionId, { respuesta: s.texto, resultado: s.resultado, ms })
    const respuesta: RespuestaChat = {
      sessionId: sesion.id,
      reply: s.texto,
      toolCalls: s.toolCalls,
      needsConfirmation: s.confirmacion !== null,
      confirmacion: s.confirmacion,
      ruta: s.ruta,
      uso: {
        tokensEntrada: contador.uso.entrada + contador.uso.cacheLectura + contador.uso.cacheEscritura,
        tokensSalida: contador.uso.salida,
        iteraciones: contador.llamadas,
        costoUsd: contador.costoUsd,
      },
      presupuesto: observador.presupuesto(),
      interaccionId,
    }
    emitir({ tipo: "fin", respuesta })
    return respuesta
  }

  return {
    procesarTurno,
    conversaciones: (usuario) => almacen.listar(usuario),
    sesion: (id, usuario) => {
      const s = almacen.obtener(id, usuario)
      return s ? { sessionId: s.id, mensajes: s.visibles } : null
    },
    salud: () => ({
      ok: true,
      provider: llm.proveedor,
      model: config.modelos.operador,
      modelos: { router: config.modelos.router, operador: config.modelos.operador, asesor: config.modelos.asesor },
    }),
  }
}

function despachar(
  ruta: RutaTurno,
  mensaje: string,
  deps: (sistema: string[]) => DepsEspecialista,
  prompts: Prompts,
): Promise<ResultadoEspecialista> {
  switch (ruta.agente) {
    case "operador":
      return ejecutarOperador(deps(prompts.operador), mensaje, ruta)
    case "asesor":
      return ejecutarAsesor(deps(prompts.asesor), mensaje)
    case "conversador":
      return ejecutarConversador(deps(prompts.conversador), mensaje)
  }
}

/** La confirmación la otorga el usuario (botón o afirmación con un pendiente activo), nunca el modelo. */
function aplicarDecision(sesion: Sesion, ruta: RutaTurno): void {
  const caso = ruta.caso ?? ultimoPendiente(sesion)?.caso ?? null
  if (!pendienteDe(sesion, caso) || caso === null) return
  if (ruta.intencion === "confirmar" && !sesion.confirmacionesOtorgadas.includes(caso)) {
    sesion.confirmacionesOtorgadas.push(caso)
  }
  if (ruta.intencion === "rechazar") quitarPendiente(sesion, caso)
}

function errorSalida(texto: string, resultado: ResultadoInteraccion = "error"): Salida {
  return { texto, toolCalls: [], confirmacion: null, ruta: null, resultado, error: true }
}

/** CA5: cualquier error se traduce a lenguaje claro y la sesión sigue viva. */
function salidaDeError(error: unknown): Salida {
  if (error instanceof ErrorPresupuesto) {
    return errorSalida(
      "Se alcanzó el límite de gasto en IA de esta cuenta de prueba, así que no puedo consultar el modelo ahora. Las herramientas siguen disponibles con el modo sin modelo.",
      "bloqueado_presupuesto",
    )
  }
  if (error instanceof ErrorLlm) return errorSalida(error.message)
  console.error("[orquestador] error inesperado", error)
  return errorSalida("Algo falló de mi lado al procesar tu mensaje. Intenta de nuevo; la conversación sigue activa.")
}

function registrarUsuarioSeguro(almacen: RepositorioSesiones, usuario: UsuarioDto): void {
  try {
    almacen.registrarUsuario(usuario)
  } catch {
    // registrar el usuario no debe impedir atender el turno
  }
}

function cerrarSeguro(observador: Observador, id: string, d: Parameters<Observador["cerrarInteraccion"]>[1]): void {
  try {
    observador.cerrarInteraccion(id, d)
  } catch {
    // la observabilidad no interrumpe la respuesta
  }
}

/** Maestros compactos para el asesor (solo lectura, estables → cacheables). */
function leerMaestros(directory: string): string {
  const dir = rutas(directory).maestros
  const archivos = ["proveedores", "centros-costo", "indicadores-iva", "condiciones-pago"]
  return archivos
    .map((nombre) => {
      try {
        return `### ${nombre}\n${JSON.stringify(JSON.parse(readFileSync(join(dir, `${nombre}.json`), "utf8")))}`
      } catch {
        return `### ${nombre}\n(no disponible)`
      }
    })
    .join("\n\n")
}
