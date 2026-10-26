const formatos = new Map<string, Intl.NumberFormat>()

function formato(clave: string, crear: () => Intl.NumberFormat): Intl.NumberFormat {
  const existente = formatos.get(clave)
  if (existente) return existente
  const nuevo = crear()
  formatos.set(clave, nuevo)
  return nuevo
}

/** Monto en la moneda indicada, con convenciones es-CO ($ 11.400.000). */
export function dinero(valor: number, moneda = "COP"): string {
  const decimales = moneda === "COP" ? 0 : 2
  return formato(
    `dinero-${moneda}`,
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: moneda,
        minimumFractionDigits: 0,
        maximumFractionDigits: decimales,
      }),
  ).format(valor)
}

export function numero(valor: number): string {
  return formato("numero", () => new Intl.NumberFormat("es-CO")).format(valor)
}

/** Costo en dólares con la precisión que merece el valor (los turnos cuestan centavos). */
export function usd(valor: number): string {
  const decimales = valor >= 1 ? 2 : valor >= 0.01 ? 3 : 4
  return formato(
    `usd-${decimales}`,
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }),
  ).format(valor)
}

/** Para espacios estrechos: como mucho dos decimales (US$ 0,46). */
export function usdCorto(valor: number): string {
  return formato(
    "usd-corto",
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
  ).format(valor)
}

export function tokens(valor: number): string {
  if (valor < 1000) return numero(valor)
  const miles = valor / 1000
  return `${miles.toLocaleString("es-CO", { maximumFractionDigits: miles >= 100 ? 0 : 1 })} k`
}

export function duracion(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} s`
}

function aFecha(iso: string): Date {
  // Una fecha sin hora se interpreta al mediodía local para no saltar de día por zona horaria.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
}

export function fecha(iso: string): string {
  const d = aFecha(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
}

export function fechaHora(iso: string): string {
  const d = aFecha(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
}

export function hora(iso: string): string {
  const d = aFecha(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
}

export function porcentaje(valor: number): string {
  return `${(valor * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`
}

export function shaCorto(sha: string): string {
  return sha.length > 16 ? `${sha.slice(0, 8)}…${sha.slice(-6)}` : sha
}

const MODELOS_CONOCIDOS: Record<string, string> = { guion: "Guion", reglas: "Reglas", demo: "Demo" }

/** "claude-sonnet-5-5" → "Sonnet 5.5". */
export function nombreModelo(id: string): string {
  const conocido = MODELOS_CONOCIDOS[id]
  if (conocido) return conocido
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  const familia = m?.[1]
  if (m && familia) return `${familia.charAt(0).toUpperCase()}${familia.slice(1)} ${m[2]}.${m[3]}`
  return id
}

const AGENTES: Record<string, string> = {
  router: "Router",
  operador: "Operador",
  asesor: "Asesor",
  conversador: "Conversación",
}

export function nombreAgente(id: string): string {
  return AGENTES[id] ?? id
}

const INTENCIONES: Record<string, string> = {
  procesar_caso: "Procesar caso",
  confirmar: "Confirmar",
  rechazar: "Rechazar",
  consulta_proceso: "Consulta de proceso",
  estado: "Estado",
  charla: "Conversación",
  fuera_de_alcance: "Fuera de alcance",
}

export function nombreIntencion(id: string): string {
  return INTENCIONES[id] ?? id
}

type InfoHerramienta = { etiqueta: string; actividad: string }

const HERRAMIENTAS: Record<string, InfoHerramienta> = {
  oc_leer_paquete: { etiqueta: "Leer paquete", actividad: "Leyendo el paquete" },
  oc_validar: { etiqueta: "Validar controles", actividad: "Validando controles" },
  oc_construir_payload: { etiqueta: "Construir OC", actividad: "Armando la orden" },
  oc_generar_evidencia: { etiqueta: "Generar evidencia", actividad: "Generando la evidencia" },
  oc_crear: { etiqueta: "Crear en SAP", actividad: "Creando la orden en SAP" },
  oc_leer_excel: { etiqueta: "Leer Excel", actividad: "Leyendo el Excel" },
}

export function infoHerramienta(nombre: string): InfoHerramienta {
  return HERRAMIENTAS[nombre] ?? { etiqueta: nombre, actividad: "Trabajando" }
}

/** "hoy, 10:42", "ayer, 18:05" o "21 oct". */
export function fechaRelativa(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hoy = new Date()
  const dias = Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  )
  const hhmm = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  if (dias === 0) return `hoy, ${hhmm}`
  if (dias === 1) return `ayer, ${hhmm}`
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
}
