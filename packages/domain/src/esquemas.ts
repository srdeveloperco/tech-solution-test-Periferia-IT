import { z } from "zod"

// ── Fuentes crudas (fixtures) ────────────────────────────────────────────────

export const CorreoCrudo = z.looseObject({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  cuerpo: z.string(),
  adjuntos: z.array(z.string()),
})
export type CorreoCrudo = z.infer<typeof CorreoCrudo>

export const Solicitud = z.object({
  solicitud_id: z.string().min(1),
  solicitante: z.string(),
  proveedor_nombre: z.string(),
  proveedor_nit: z.string().optional(),
  descripcion: z.string().min(1),
  centro_costo: z.string(),
  subarea: z.string(),
  cantidad: z.number({ error: "cantidad debe ser numérica" }),
  valor_unitario: z.number({ error: "valor_unitario debe ser numérico" }),
  valor_total: z.number({ error: "valor_total debe ser numérico" }),
  moneda: z.enum(["COP", "USD"]),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string(),
})
export type Solicitud = z.infer<typeof Solicitud>

export const AprobacionCruda = z.looseObject({
  de: z.string(),
  para: z.string(),
  fecha: z.string(),
  asunto: z.string(),
  cuerpo: z.string(),
  cc: z.array(z.string()).optional(),
})
export type AprobacionCruda = z.infer<typeof AprobacionCruda>

// ── Maestros ─────────────────────────────────────────────────────────────────

export const Proveedor = z.object({
  codigo_sap: z.string(),
  nit: z.string(),
  nombre: z.string(),
  condiciones_pago_default: z.string(),
  indicador_iva_default: z.string(),
  activo: z.boolean(),
})
export type Proveedor = z.infer<typeof Proveedor>

export const CentroCosto = z.object({
  centro_costo: z.string(),
  nombre: z.string().optional(),
  subareas: z.array(z.string()),
  aprobadores: z.array(z.object({ email: z.string(), nombre: z.string().optional(), tope: z.number() })),
})
export type CentroCosto = z.infer<typeof CentroCosto>

export const IndicadorIva = z.object({ codigo: z.string(), descripcion: z.string(), tasa: z.number() })
export type IndicadorIva = z.infer<typeof IndicadorIva>

export const CondicionPago = z.object({ codigo: z.string(), descripcion: z.string(), dias: z.number() })
export type CondicionPago = z.infer<typeof CondicionPago>

export type Maestros = {
  proveedores: Proveedor[]
  centrosCosto: CentroCosto[]
  indicadoresIva: IndicadorIva[]
  condicionesPago: CondicionPago[]
}

// ── Paquete normalizado (PRD 7.2) ────────────────────────────────────────────

export const Paquete = z.object({
  correo: z.object({ id: z.string(), de: z.string(), asunto: z.string(), fecha: z.string() }),
  solicitud: Solicitud,
  cotizacion: z
    .object({
      numero: z.string().nullable(),
      fecha: z.string().nullable(),
      proveedor: z.string(),
      nit: z.string().nullable(),
      total: z.number(),
      moneda: z.string(),
      validez_hasta: z.string().nullable(),
      texto: z.string(),
    })
    .nullable(),
  aprobacion: z.object({ de: z.string(), fecha: z.string(), aprobado: z.boolean(), texto: z.string() }).nullable(),
  factura: z.object({ numero: z.string(), fecha: z.string(), total: z.number() }).nullable(),
  /** Adjuntos que no llegaron (por nombre). Vacío si el paquete está completo. */
  faltantes: z.array(z.string()),
})
export type Paquete = z.infer<typeof Paquete>

// ── Resultado de validación ──────────────────────────────────────────────────

export const CodigoControl = z.enum(["RC1", "RC2", "RC3", "RC4", "RC5", "RC6", "RC7", "RC8", "RC9", "RC10"])
export type CodigoControl = z.infer<typeof CodigoControl>

export const Hallazgo = z.object({
  codigo: CodigoControl,
  titulo: z.string(),
  detalle: z.string(),
  accion_sugerida: z.string(),
  /** Para mostrar dos valores lado a lado (ej. solicitud vs cotización). */
  comparacion: z
    .object({
      etiqueta_a: z.string(),
      valor_a: z.union([z.string(), z.number()]),
      etiqueta_b: z.string(),
      valor_b: z.union([z.string(), z.number()]),
      diferencia: z.string().optional(),
    })
    .optional(),
})
export type Hallazgo = z.infer<typeof Hallazgo>

export const Derivado = z.object({
  valor: z.string(),
  fuente: z.string(),
  motivo: z.string(),
})
export type Derivado = z.infer<typeof Derivado>

export const EstadoControl = z.enum(["ok", "bloqueo", "confirmacion", "derivado", "no_aplica"])
export type EstadoControl = z.infer<typeof EstadoControl>

export const Validacion = z.object({
  apta: z.boolean(),
  bloqueos: z.array(Hallazgo),
  confirmaciones: z.array(Hallazgo),
  derivados: z.record(z.string(), Derivado),
  retroactiva: z.boolean(),
  /** Una fila por regla RC1–RC10: qué pasó y qué no. */
  controles: z.array(z.object({ codigo: CodigoControl, estado: EstadoControl, detalle: z.string() })),
})
export type Validacion = z.infer<typeof Validacion>

// ── Orden de compra (PRD 7.4) ────────────────────────────────────────────────

export const OrdenCompra = z.object({
  referencia: z.object({
    solicitud_id: z.string(),
    correo_id: z.string(),
    cotizacion_ref: z.string().nullable(),
  }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({ codigo_sap: z.string(), nit: z.string(), nombre: z.string() }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({
    email: z.string(),
    fecha_aprobacion: z.string(),
    evidencia_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  posiciones: z
    .array(
      z.object({
        numero: z.number().int(),
        descripcion: z.string().max(40),
        cantidad: z.number(),
        unidad: z.enum(["UN", "H", "MES"]),
        precio_unitario: z.number(),
        centro_costo: z.string(),
        subarea: z.string(),
        indicador_iva: z.string(),
      }),
    )
    .min(1),
  excepciones: z.array(z.object({ codigo: z.string(), detalle: z.string(), confirmado_por: z.string().nullable() })),
})
export type OrdenCompra = z.infer<typeof OrdenCompra>

export const FuenteTraza = z.string() // "solicitud" | "cotizacion" | "correo" | "aprobacion" | "maestro.<nombre>" | "derivado" | "constante"
export type Trazabilidad = Record<string, { valor: unknown; fuente: string; detalle?: string }>

// ── Resultado de crear (lo usa el ciclo del agente) ──────────────────────────

export type ResultadoCrear = "creada" | "idempotente" | "bloqueada" | "pendiente"
