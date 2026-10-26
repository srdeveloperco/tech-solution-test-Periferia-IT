/** Resumen de una línea del resultado de cada herramienta, para el historial visible del chat. */
type Json = Record<string, unknown>

const esObjeto = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)
const largo = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
const plural = (n: number, s: string, p: string): string => `${n} ${n === 1 ? s : p}`

export function formatearCop(valor: number): string {
  const entero = Math.round(valor).toString()
  return `$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

export function parsearResultado(texto: string): Json {
  try {
    const v: unknown = JSON.parse(texto)
    return esObjeto(v) ? v : { ok: false, error: "Respuesta de herramienta no reconocida" }
  } catch {
    return { ok: false, error: "Respuesta de herramienta no es JSON" }
  }
}

export function resumirResultado(nombre: string, r: Json): string {
  if (nombre === "oc_crear") return resumirCrear(r)
  if (r.ok !== true) return typeof r.error === "string" ? r.error.slice(0, 160) : "Error"
  const d = esObjeto(r.data) ? r.data : {}
  switch (nombre) {
    case "oc_leer_paquete":
      return resumirPaquete(d)
    case "oc_validar":
      return [
        d.apta === true ? "Apta" : "No apta",
        plural(largo(d.bloqueos), "bloqueo", "bloqueos"),
        plural(largo(d.confirmaciones), "confirmación", "confirmaciones"),
        ...(d.retroactiva === true ? ["retroactiva"] : []),
      ].join(" · ")
    case "oc_construir_payload":
      return resumirOrden(d)
    case "oc_generar_evidencia":
      return `Evidencia lista · sha256 ${String(d.sha256 ?? "").slice(0, 12)}…`
    default:
      return "Listo"
  }
}

function resumirPaquete(d: Json): string {
  const s = esObjeto(d.solicitud) ? d.solicitud : {}
  const faltan = Array.isArray(d.faltantes) ? d.faltantes : []
  const estado = faltan.length > 0 ? `faltan: ${faltan.join(", ")}` : "completo"
  return `${String(s.solicitud_id ?? "Solicitud")} · ${String(s.proveedor_nombre ?? "")} · ${estado}`
}

function resumirOrden(d: Json): string {
  const orden = esObjeto(d.orden) ? d.orden : {}
  const posiciones = Array.isArray(orden.posiciones) ? (orden.posiciones as Json[]) : []
  const total = posiciones.reduce((s, p) => s + Number(p.cantidad ?? 0) * Number(p.precio_unitario ?? 0), 0)
  return `OC armada · ${plural(posiciones.length, "posición", "posiciones")} · ${formatearCop(total)}`
}

function resumirCrear(r: Json): string {
  const d = esObjeto(r.data) ? r.data : {}
  if (r.ok === true) {
    return d.idempotente === true ? `Ya existía: OC ${String(d.numero_oc)}` : `OC ${String(d.numero_oc)} creada`
  }
  if (r.resultado === "pendiente")
    return `Pendiente · ${plural(largo(r.confirmaciones), "confirmación", "confirmaciones")}`
  if (r.resultado === "bloqueada") {
    const codigos = Array.isArray(r.bloqueos) ? (r.bloqueos as Json[]).map((b) => String(b.codigo)).join(", ") : ""
    return `Bloqueada · ${codigos}`
  }
  return typeof r.error === "string" ? r.error.slice(0, 160) : "Error"
}

/** Argumentos resumidos para el log: sin volcar paquetes ni payloads completos. */
export function resumirArgs(args: unknown): Json {
  if (!esObjeto(args)) return {}
  const salida: Json = {}
  for (const [k, v] of Object.entries(args)) salida[k] = esObjeto(v) || Array.isArray(v) ? `[${k}]` : v
  return salida
}
