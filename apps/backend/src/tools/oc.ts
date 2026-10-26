/**
 * Herramientas del agente de órdenes de compra (PRD 6.2). Cada export `x` llega al modelo como `oc_x`.
 * Son la ÚNICA fuente de valores que el agente puede afirmar. Devuelven JSON `{ ok, data | error }` y nunca lanzan.
 * Regla de diseño: las herramientas recalculan desde las fuentes del caso; lo que mande el modelo se verifica, no se cree.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  construirEvidencia,
  construirOrden,
  Derivado,
  diferenciasOrden,
  type Maestros,
  OrdenCompra,
  Paquete,
  type Validacion,
  validarPaquete,
} from "@oc/domain"
import { z } from "zod"
import { SapMock } from "../sap/mock"
import { registrarControl } from "./control"
import { escribirEvidencia } from "./evidencia"
import { leerAprobacionCruda, leerMaestros, leerPaquete } from "./fuentes"
import { rutas, rutaVisible } from "./rutas"
import type { ToolContext } from "./tipos"

// ── utilidades ───────────────────────────────────────────────────────────────

const ok = (data: unknown) => JSON.stringify({ ok: true, data })
const fallo = (error: string, extra: Record<string, unknown> = {}) => JSON.stringify({ ok: false, error, ...extra })

async function seguro(nombre: string, fn: () => Promise<string>): Promise<string> {
  try {
    return await fn()
  } catch (e) {
    return fallo(`Error inesperado en oc_${nombre}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

type Contexto = { paquete: Paquete; maestros: Maestros; validacion: Validacion }

/** Paquete original del caso + maestros + validación. Base de todas las herramientas que deciden. */
async function cargar(
  ctx: ToolContext,
  caso: string,
): Promise<{ ok: true; data: Contexto } | { ok: false; error: string }> {
  const paquete = await leerPaquete(ctx.directory, caso)
  if (!paquete.ok) return paquete
  const maestros = await leerMaestros(ctx.directory)
  if (!maestros.ok) return maestros
  return {
    ok: true,
    data: { paquete: paquete.data, maestros: maestros.data, validacion: validarPaquete(paquete.data, maestros.data) },
  }
}

async function shaEvidencia(ctx: ToolContext, caso: string, solicitudId: string): Promise<string | null> {
  const aprob = await leerAprobacionCruda(ctx.directory, caso)
  return aprob.ok && aprob.data ? construirEvidencia(aprob.data, solicitudId).sha256 : null
}

async function ordenCanonica(ctx: ToolContext, caso: string, c: Contexto) {
  const sha = await shaEvidencia(ctx, caso, c.paquete.solicitud.solicitud_id)
  if (!sha) return { error: "No hay aprobación para calcular la evidencia." }
  return construirOrden(c.paquete, c.validacion.derivados, c.maestros, sha, c.validacion.confirmaciones)
}

function mismoPaquete(a: Paquete, b: Paquete): boolean {
  return JSON.stringify(a.solicitud) === JSON.stringify(b.solicitud) && a.cotizacion?.total === b.cotizacion?.total
}

const sapPorDirectorio = new Map<string, SapMock>()
function sap(ctx: ToolContext, maestros: Maestros): SapMock {
  const clave = rutas(ctx.directory).sap
  const existente = sapPorDirectorio.get(clave)
  if (existente) return existente
  const nuevo = new SapMock(clave, maestros.proveedores)
  sapPorDirectorio.set(clave, nuevo)
  return nuevo
}

const codigos = (hs: Array<{ codigo: string }>) => hs.map((h) => h.codigo)

// ── herramientas ─────────────────────────────────────────────────────────────

const caso = z.string().describe("Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/, ej. sol-001")
const paquete = Paquete.describe("Paquete normalizado tal como lo devolvió oc_leer_paquete")

export const leer_paquete = {
  description:
    "Lee el paquete de un caso (correo, solicitud, cotización, aprobación y factura) y lo devuelve normalizado; los adjuntos ausentes vienen en null y listados en faltantes.",
  args: { caso },
  async execute(args: { caso: string }, ctx: ToolContext) {
    return seguro("leer_paquete", async () => {
      const p = await leerPaquete(ctx.directory, args.caso)
      return p.ok ? ok(p.data) : fallo(p.error)
    })
  },
}

export const validar = {
  description:
    "Valida el paquete contra los maestros con las reglas RC1–RC10 y devuelve apta, bloqueos, confirmaciones, derivados, retroactiva y el estado de cada control.",
  args: { caso, paquete },
  async execute(args: { caso: string; paquete: Paquete }, ctx: ToolContext) {
    return seguro("validar", async () => {
      const c = await cargar(ctx, args.caso)
      if (!c.ok) return fallo(c.error)
      const verificado = mismoPaquete(args.paquete, c.data.paquete)
      return ok({
        ...c.data.validacion,
        paquete_verificado: verificado,
        ...(verificado ? {} : { aviso: "El paquete recibido difiere del original; se validó el original del caso." }),
      })
    })
  },
}

export const construir_payload = {
  description:
    "Construye la orden de compra exactamente como quedaría en SAP (esquema zod) y guarda la trazabilidad de cada campo en out/<caso>/trazabilidad.json.",
  args: {
    caso,
    paquete,
    derivados: z.record(z.string(), Derivado).describe("El objeto derivados devuelto por oc_validar"),
  },
  async execute(args: { caso: string; paquete: Paquete; derivados: Record<string, Derivado> }, ctx: ToolContext) {
    return seguro("construir_payload", async () => {
      const c = await cargar(ctx, args.caso)
      if (!c.ok) return fallo(c.error)
      const { validacion } = c.data
      if (!validacion.apta) {
        const lista = validacion.bloqueos.map((b) => `${b.codigo} ${b.titulo}`).join("; ")
        return fallo(`No se construye la OC porque hay bloqueos: ${lista}.`, { bloqueos: validacion.bloqueos })
      }
      const r = await ordenCanonica(ctx, args.caso, c.data)
      if ("error" in r) return fallo(r.error)
      const carpeta = rutas(ctx.directory).outCaso(args.caso)
      await mkdir(carpeta, { recursive: true })
      const archivo = join(carpeta, "trazabilidad.json")
      const registro = {
        caso: args.caso,
        orden: r.orden,
        trazabilidad: r.trazabilidad,
        derivados: validacion.derivados,
      }
      await writeFile(archivo, `${JSON.stringify(registro, null, 2)}\n`, "utf8")
      return ok({
        orden: r.orden,
        trazabilidad: r.trazabilidad,
        trazabilidad_ruta: rutaVisible(ctx.directory, archivo),
      })
    })
  },
}

export const generar_evidencia = {
  description:
    "Genera la evidencia de aprobación del caso: out/<caso>/aprobacion.txt con encabezados, cuerpo y sha256, y su versión PDF.",
  args: { caso },
  async execute(args: { caso: string }, ctx: ToolContext) {
    return seguro("generar_evidencia", async () => {
      const r = await escribirEvidencia(ctx.directory, args.caso)
      return r.ok ? ok(r.data) : fallo(r.error)
    })
  },
}

export const crear = {
  description:
    "Crea la OC en SAP (simulado) solo si es apta y, cuando hay confirmaciones, con confirmado=true; es idempotente por solicitud y registra cada intento en out/control.csv.",
  args: {
    caso,
    payload: OrdenCompra.nullable().describe(
      "La orden devuelta por oc_construir_payload sin modificar, o null si la validación tuvo bloqueos",
    ),
    confirmado: z
      .boolean()
      .optional()
      .describe("true solo si el usuario confirmó explícitamente las excepciones en su último mensaje"),
  },
  async execute(
    args: { caso: string; payload: OrdenCompra | null; confirmado?: boolean | undefined },
    ctx: ToolContext,
  ) {
    return seguro("crear", async () => {
      const c = await cargar(ctx, args.caso)
      if (!c.ok) return fallo(c.error)
      const { validacion, paquete: p, maestros } = c.data
      const solicitud_id = p.solicitud.solicitud_id
      const base = { solicitud_id, retroactiva: validacion.retroactiva }
      const control = {
        ...base,
        bloqueos: codigos(validacion.bloqueos),
        confirmaciones: codigos(validacion.confirmaciones),
      }

      if (!validacion.apta) {
        await registrarControl(ctx.directory, { ...control, resultado: "bloqueada", numero_oc: null })
        const lista = validacion.bloqueos.map((b) => `${b.codigo} ${b.titulo}`).join("; ")
        return fallo(`No se creó la OC: ${lista}.`, {
          resultado: "bloqueada",
          caso: args.caso,
          bloqueos: validacion.bloqueos,
        })
      }

      const adaptador = sap(ctx, maestros)
      const existente = await adaptador.buscarOrdenPorReferencia(solicitud_id)
      if (existente) {
        await registrarControl(ctx.directory, { ...control, resultado: "idempotente", numero_oc: existente.numero_oc })
        const fecha = (await adaptador.fechaDe(existente.numero_oc)) ?? ""
        return ok({
          resultado: "idempotente",
          numero_oc: existente.numero_oc,
          fecha,
          idempotente: true,
          retroactiva: validacion.retroactiva,
        })
      }

      if (validacion.confirmaciones.length > 0 && args.confirmado !== true) {
        await registrarControl(ctx.directory, { ...control, resultado: "pendiente", numero_oc: null })
        const lista = validacion.confirmaciones.map((h) => `${h.codigo} ${h.titulo}`).join("; ")
        return fallo(`La OC requiere confirmación explícita del usuario antes de crearse: ${lista}.`, {
          resultado: "pendiente",
          caso: args.caso,
          confirmaciones: validacion.confirmaciones,
        })
      }

      const canonica = await ordenCanonica(ctx, args.caso, c.data)
      if ("error" in canonica) return fallo(canonica.error)
      if (args.payload) {
        const distintos = diferenciasOrden(args.payload, canonica.orden)
        if (distintos.length > 0) {
          return fallo(
            `El payload recibido no coincide con el construido desde las fuentes (campos: ${distintos.join(", ")}). Usa la orden de oc_construir_payload sin modificarla.`,
          )
        }
      }

      const evidencia = await escribirEvidencia(ctx.directory, args.caso)
      const confirmadoPor = args.confirmado === true ? `analista (sesión ${ctx.sessionId})` : null
      const orden: OrdenCompra = {
        ...canonica.orden,
        excepciones: canonica.orden.excepciones.map((e) => ({ ...e, confirmado_por: confirmadoPor })),
      }
      const creada = await adaptador.crearOrden(orden)
      const carpeta = rutas(ctx.directory).outCaso(args.caso)
      await mkdir(carpeta, { recursive: true })
      await writeFile(join(carpeta, "orden.json"), `${JSON.stringify({ ...creada, orden }, null, 2)}\n`, "utf8")
      await registrarControl(ctx.directory, { ...control, resultado: "creada", numero_oc: creada.numero_oc })
      return ok({
        resultado: "creada",
        numero_oc: creada.numero_oc,
        fecha: creada.fecha,
        idempotente: false,
        retroactiva: validacion.retroactiva,
        evidencia: evidencia.ok ? evidencia.data : null,
      })
    })
  },
}
