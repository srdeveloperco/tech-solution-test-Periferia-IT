import type { ToolCallVisible, Validacion } from "@oc/contracts"
import {
  casoDeArgs,
  comoCrear,
  comoEvidencia,
  comoOrden,
  comoPaquete,
  comoValidacion,
  type EvidenciaVista,
  errorDe,
  type OrdenVista,
  type PaqueteVista,
  type ResultadoCrearVista,
} from "../api/guards"

export type EtapaId = "paquete" | "validar" | "orden" | "evidencia" | "crear"
export type EstadoEtapa = "pendiente" | "en_curso" | "ok" | "atencion" | "bloqueo" | "error"

export const ETAPAS: ReadonlyArray<{ id: EtapaId; herramienta: string; etiqueta: string }> = [
  { id: "paquete", herramienta: "oc_leer_paquete", etiqueta: "Leer paquete" },
  { id: "validar", herramienta: "oc_validar", etiqueta: "Validar" },
  { id: "orden", herramienta: "oc_construir_payload", etiqueta: "Construir OC" },
  { id: "evidencia", herramienta: "oc_generar_evidencia", etiqueta: "Evidencia" },
  { id: "crear", herramienta: "oc_crear", etiqueta: "Crear en SAP" },
]

const POR_HERRAMIENTA = new Map(ETAPAS.map((e) => [e.herramienta, e.id]))

export type Lienzo = {
  caso: string | null
  etapas: Record<EtapaId, EstadoEtapa>
  activa: EtapaId | null
  paquete: PaqueteVista | null
  validacion: Validacion | null
  orden: OrdenVista | null
  evidencia: EvidenciaVista | null
  crear: ResultadoCrearVista | null
  errores: Partial<Record<EtapaId, string>>
  /** Cuántas etapas tienen resultado: sirve para seguir con el scroll lo último que apareció. */
  avance: number
}

function vacio(caso: string | null): Lienzo {
  return {
    caso,
    etapas: {
      paquete: "pendiente",
      validar: "pendiente",
      orden: "pendiente",
      evidencia: "pendiente",
      crear: "pendiente",
    },
    activa: null,
    paquete: null,
    validacion: null,
    orden: null,
    evidencia: null,
    crear: null,
    errores: {},
    avance: 0,
  }
}

function estadoValidacion(v: Validacion): EstadoEtapa {
  if (!v.apta || v.bloqueos.length > 0) return "bloqueo"
  return v.confirmaciones.length > 0 ? "atencion" : "ok"
}

function estadoCrear(c: ResultadoCrearVista): EstadoEtapa {
  if (c.tipo === "creada" || c.tipo === "idempotente") return "ok"
  if (c.tipo === "pendiente") return "atencion"
  return c.tipo === "bloqueada" ? "bloqueo" : "error"
}

function aplicarResultado(l: Lienzo, etapa: EtapaId, llamada: ToolCallVisible): Lienzo {
  const r = llamada.resultado
  const base = { ...l, activa: l.activa === etapa ? null : l.activa, avance: l.avance + 1 }
  const fallo = (estado: EstadoEtapa): Lienzo => ({
    ...base,
    etapas: { ...l.etapas, [etapa]: estado },
    errores: { ...l.errores, [etapa]: errorDe(r) ?? llamada.resumen },
  })

  switch (etapa) {
    case "paquete": {
      const paquete = comoPaquete(r)
      return paquete ? { ...base, paquete, etapas: { ...l.etapas, paquete: "ok" } } : fallo("error")
    }
    case "validar": {
      const validacion = comoValidacion(r)
      return validacion
        ? { ...base, validacion, etapas: { ...l.etapas, validar: estadoValidacion(validacion) } }
        : fallo("error")
    }
    case "orden": {
      const orden = comoOrden(r)
      if (orden) return { ...base, orden, etapas: { ...l.etapas, orden: "ok" } }
      // Si la validación ya tenía bloqueos, no construir la OC es lo esperado: se marca como bloqueo.
      return fallo(l.validacion && !l.validacion.apta ? "bloqueo" : "error")
    }
    case "evidencia": {
      const evidencia = comoEvidencia(r)
      return evidencia ? { ...base, evidencia, etapas: { ...l.etapas, evidencia: "ok" } } : fallo("error")
    }
    case "crear": {
      const crear = comoCrear(r)
      if (!crear) return fallo("error")
      const creada = crear.tipo === "creada" || crear.tipo === "idempotente"
      // Crear con confirmaciones implica que la persona las aceptó: la validación queda resuelta.
      const validar = creada && l.etapas.validar === "atencion" ? "ok" : l.etapas.validar
      return { ...base, crear, etapas: { ...l.etapas, validar, crear: estadoCrear(crear) } }
    }
  }
}

/** Reconstruye el lienzo a partir de las llamadas a herramientas de la sesión, en orden. */
export function derivarLienzo(llamadas: ToolCallVisible[]): Lienzo {
  let lienzo = vacio(null)
  for (const llamada of llamadas) {
    const etapa = POR_HERRAMIENTA.get(llamada.nombre)
    if (!etapa) continue
    const caso = casoDeArgs(llamada.args)
    // Un caso distinto, o volver a leer el paquete, empieza un lienzo nuevo.
    if (caso && (caso !== lienzo.caso || etapa === "paquete")) lienzo = vacio(caso)
    if (llamada.ok === null) {
      lienzo = { ...lienzo, activa: etapa, etapas: { ...lienzo.etapas, [etapa]: "en_curso" } }
      continue
    }
    lienzo = aplicarResultado(lienzo, etapa, llamada)
  }
  return lienzo
}

export function hayActividad(l: Lienzo): boolean {
  return l.caso !== null
}
