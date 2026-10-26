// STUB: firmas definitivas, implementación en curso.
import { OrdenCompra, Paquete } from "@oc/domain"
import { z } from "zod"
import type { ToolContext } from "./tipos"

const caso = z.string().describe("Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/, ej. sol-001")
const pendiente = async (_a: unknown, _c: ToolContext) => JSON.stringify({ ok: false, error: "no implementado" })

export const leer_paquete = {
  description: "Lee y normaliza el paquete de un caso: correo, solicitud, cotización, aprobación y factura.",
  args: { caso },
  execute: pendiente,
}
export const validar = {
  description: "Valida el paquete contra los maestros y las reglas RC1–RC10; devuelve bloqueos, confirmaciones y derivados.",
  args: { caso, paquete: Paquete.describe("Paquete devuelto por oc_leer_paquete") },
  execute: pendiente,
}
export const construir_payload = {
  description: "Construye la orden de compra tal como quedaría en SAP y guarda su trazabilidad.",
  args: {
    caso,
    paquete: Paquete.describe("Paquete devuelto por oc_leer_paquete"),
    derivados: z.record(z.string(), z.object({ valor: z.string(), fuente: z.string(), motivo: z.string() })).describe("derivados devueltos por oc_validar"),
  },
  execute: pendiente,
}
export const generar_evidencia = {
  description: "Genera la evidencia de aprobación (txt y pdf) con su sha256.",
  args: { caso },
  execute: pendiente,
}
export const crear = {
  description: "Crea la OC en SAP (simulado) si es apta; registra el intento en el log de control.",
  args: {
    caso,
    payload: OrdenCompra.nullable().describe("OrdenCompra de oc_construir_payload, o null si hubo bloqueos"),
    confirmado: z.boolean().optional().describe("true solo si el usuario confirmó explícitamente las excepciones"),
  },
  execute: pendiente,
}
