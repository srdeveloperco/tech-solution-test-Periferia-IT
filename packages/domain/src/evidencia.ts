/** Evidencia de aprobación (HU-4): texto canónico + sha256 del contenido. Puro. */
import { createHash } from "node:crypto"
import type { AprobacionCruda } from "./esquemas"

export type Evidencia = { contenido: string; sha256: string; archivo: string }

export function construirEvidencia(aprobacion: AprobacionCruda, solicitudId: string): Evidencia {
  const lineas = [
    "EVIDENCIA DE APROBACIÓN DE COMPRA",
    `Solicitud: ${solicitudId}`,
    "",
    `De: ${aprobacion.de}`,
    `Para: ${aprobacion.para}`,
    ...(aprobacion.cc && aprobacion.cc.length > 0 ? [`CC: ${aprobacion.cc.join(", ")}`] : []),
    `Fecha: ${aprobacion.fecha}`,
    `Asunto: ${aprobacion.asunto}`,
    "",
    aprobacion.cuerpo.trim(),
    "",
  ]
  const contenido = lineas.join("\n")
  const sha256 = createHash("sha256").update(contenido, "utf8").digest("hex")
  return { contenido, sha256, archivo: `${contenido}\n---\nsha256 (contenido anterior a esta línea): ${sha256}\n` }
}
