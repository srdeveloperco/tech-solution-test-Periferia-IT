/** Escribe la evidencia de aprobación: aprobacion.txt (P0) y aprobacion.pdf (P1, pdf-lib). */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { construirEvidencia, type Evidencia } from "@oc/domain"
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib"
import { leerAprobacionCruda, leerPaquete } from "./fuentes"
import { rutas, rutaVisible } from "./rutas"

/** Las fuentes estándar de PDF usan WinAnsi: reemplaza lo que no se puede codificar. */
function aWinAnsi(texto: string): string {
  return texto.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, (c) => (c === "\t" ? "  " : "?"))
}

function partirLinea(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const palabras = texto.split(" ")
  const lineas: string[] = []
  let actual = ""
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (fuente.widthOfTextAtSize(prueba, tamano) > ancho && actual) {
      lineas.push(actual)
      actual = p
    } else actual = prueba
  }
  lineas.push(actual)
  return lineas
}

async function generarPdf(ev: Evidencia, fecha: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fijo = new Date(Number.isNaN(Date.parse(fecha)) ? 0 : Date.parse(fecha))
  doc.setTitle("Evidencia de aprobación")
  doc.setProducer("oc-agente-sap")
  doc.setCreationDate(fijo)
  doc.setModificationDate(fijo)
  const fuente = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  let pagina = doc.addPage([595, 842])
  let y = 790
  const margen = 56
  const ancho = 595 - margen * 2
  const escribir = (texto: string, f: PDFFont, tamano: number, color = rgb(0.12, 0.12, 0.14)) => {
    for (const linea of partirLinea(aWinAnsi(texto), f, tamano, ancho)) {
      if (y < 60) {
        pagina = doc.addPage([595, 842])
        y = 790
      }
      pagina.drawText(linea, { x: margen, y, size: tamano, font: f, color })
      y -= tamano * 1.5
    }
  }
  const [titulo, ...resto] = ev.contenido.split("\n")
  escribir(titulo ?? "", negrita, 15)
  y -= 6
  for (const linea of resto) {
    if (linea === "") y -= 6
    else escribir(linea, /^(De|Para|CC|Fecha|Asunto|Solicitud):/.test(linea) ? negrita : fuente, 10.5)
  }
  y -= 12
  escribir(`sha256 del contenido: ${ev.sha256}`, fuente, 8.5, rgb(0.4, 0.4, 0.45))
  return doc.save({ useObjectStreams: false })
}

export type EvidenciaEscrita = { ruta: string; ruta_pdf: string; sha256: string }

export async function escribirEvidencia(
  directory: string,
  caso: string,
): Promise<{ ok: true; data: EvidenciaEscrita } | { ok: false; error: string }> {
  const paquete = await leerPaquete(directory, caso)
  if (!paquete.ok) return paquete
  const aprobacion = await leerAprobacionCruda(directory, caso)
  if (!aprobacion.ok) return aprobacion
  if (!aprobacion.data) return { ok: false, error: "No hay correo de aprobación para generar la evidencia." }
  const ev = construirEvidencia(aprobacion.data, paquete.data.solicitud.solicitud_id)
  const carpeta = rutas(directory).outCaso(caso)
  await mkdir(carpeta, { recursive: true })
  const txt = join(carpeta, "aprobacion.txt")
  const pdf = join(carpeta, "aprobacion.pdf")
  await writeFile(txt, ev.archivo, "utf8")
  await writeFile(pdf, await generarPdf(ev, aprobacion.data.fecha))
  return {
    ok: true,
    data: { ruta: rutaVisible(directory, txt), ruta_pdf: rutaVisible(directory, pdf), sha256: ev.sha256 },
  }
}
