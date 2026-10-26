/** Construcción de la orden de compra (PRD 7.4) con trazabilidad campo a campo. Puro. */
import { type Derivado, type Maestros, OrdenCompra, type Paquete, type Trazabilidad } from "./esquemas"
import { buscarProveedor } from "./reglas"

export type OrdenConstruida = { orden: OrdenCompra; trazabilidad: Trazabilidad }
export type ErrorOrden = { error: string }

function derivadoO(derivados: Record<string, Derivado>, campo: string, propio: string | undefined) {
  if (propio) return { valor: propio, fuente: "solicitud" }
  const d = derivados[campo]
  return d ? { valor: d.valor, fuente: "derivado", detalle: `${d.fuente}: ${d.motivo}` } : null
}

export function construirOrden(
  paquete: Paquete,
  derivados: Record<string, Derivado>,
  maestros: Maestros,
  evidenciaSha256: string,
  confirmaciones: Array<{ codigo: string; detalle: string }> = [],
): OrdenConstruida | ErrorOrden {
  const s = paquete.solicitud
  const { proveedor } = buscarProveedor(paquete, maestros)
  if (!proveedor) return { error: `No se puede construir la OC: ${s.proveedor_nombre} no está en el maestro (RC1).` }
  if (!paquete.aprobacion) return { error: "No se puede construir la OC: falta la aprobación (RC2)." }

  const iva = derivadoO(derivados, "indicador_iva", s.indicador_iva)
  const pago = derivadoO(derivados, "condiciones_pago", s.condiciones_pago)
  if (!iva || !pago) return { error: "Faltan indicador de IVA o condiciones de pago y no se pudieron derivar." }
  const unidad = derivados.unidad?.valor ?? "UN"
  const descripcion = derivados.descripcion?.valor ?? s.descripcion

  const candidato = {
    referencia: {
      solicitud_id: s.solicitud_id,
      correo_id: paquete.correo.id,
      cotizacion_ref: paquete.cotizacion?.numero ?? null,
    },
    sociedad: "1000",
    organizacion_compras: "1000",
    proveedor: { codigo_sap: proveedor.codigo_sap, nit: proveedor.nit, nombre: proveedor.nombre },
    moneda: s.moneda,
    condiciones_pago: pago.valor,
    aprobador: {
      email: paquete.aprobacion.de,
      fecha_aprobacion: paquete.aprobacion.fecha,
      evidencia_sha256: evidenciaSha256,
    },
    posiciones: [
      {
        numero: 10,
        descripcion,
        cantidad: s.cantidad,
        unidad,
        precio_unitario: s.valor_unitario,
        centro_costo: s.centro_costo,
        subarea: s.subarea,
        indicador_iva: iva.valor,
      },
    ],
    excepciones: confirmaciones.map((c) => ({ codigo: c.codigo, detalle: c.detalle, confirmado_por: null })),
  }
  const parsed = OrdenCompra.safeParse(candidato)
  if (!parsed.success)
    return { error: `La OC no cumple el esquema SAP: ${parsed.error.issues.map((i) => i.message).join("; ")}` }

  const prov = "maestro.proveedores"
  const trazabilidad: Trazabilidad = {
    "referencia.solicitud_id": { valor: s.solicitud_id, fuente: "solicitud" },
    "referencia.correo_id": { valor: paquete.correo.id, fuente: "correo" },
    "referencia.cotizacion_ref": { valor: paquete.cotizacion?.numero ?? null, fuente: "cotizacion" },
    sociedad: { valor: "1000", fuente: "constante", detalle: "Sociedad única de Periferia en SAP" },
    organizacion_compras: { valor: "1000", fuente: "constante" },
    "proveedor.codigo_sap": { valor: proveedor.codigo_sap, fuente: prov },
    "proveedor.nit": { valor: proveedor.nit, fuente: prov },
    "proveedor.nombre": { valor: proveedor.nombre, fuente: prov },
    moneda: { valor: s.moneda, fuente: "solicitud" },
    condiciones_pago: pago,
    "aprobador.email": { valor: paquete.aprobacion.de, fuente: "aprobacion" },
    "aprobador.fecha_aprobacion": { valor: paquete.aprobacion.fecha, fuente: "aprobacion" },
    "aprobador.evidencia_sha256": { valor: evidenciaSha256, fuente: "derivado", detalle: "sha256 de aprobacion.txt" },
    "posiciones[0].numero": { valor: 10, fuente: "constante" },
    "posiciones[0].descripcion": derivados.descripcion
      ? { valor: descripcion, fuente: "derivado", detalle: `Texto completo: ${s.descripcion}` }
      : { valor: descripcion, fuente: "solicitud" },
    "posiciones[0].cantidad": { valor: s.cantidad, fuente: "solicitud" },
    "posiciones[0].unidad": { valor: unidad, fuente: "derivado", detalle: derivados.unidad?.motivo },
    "posiciones[0].precio_unitario": { valor: s.valor_unitario, fuente: "solicitud", detalle: "IVA incluido" },
    "posiciones[0].centro_costo": { valor: s.centro_costo, fuente: "solicitud" },
    "posiciones[0].subarea": { valor: s.subarea, fuente: "solicitud" },
    "posiciones[0].indicador_iva": iva,
    excepciones: {
      valor: confirmaciones.map((c) => c.codigo),
      fuente: "derivado",
      detalle: "confirmaciones de oc_validar",
    },
  }
  return { orden: parsed.data, trazabilidad }
}

/** Forma canónica para comparar payloads (ignora quién confirmó). */
export function huellaOrden(orden: OrdenCompra): string {
  const base = { ...orden, excepciones: orden.excepciones.map((e) => ({ codigo: e.codigo, detalle: e.detalle })) }
  return JSON.stringify(base)
}

/** Campos (primer nivel/posición) en los que difieren dos órdenes. */
export function diferenciasOrden(a: OrdenCompra, b: OrdenCompra): string[] {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof OrdenCompra>
  const distintas: string[] = []
  for (const k of claves) {
    const va = k === "excepciones" ? a[k].map((e) => e.codigo) : a[k]
    const vb = k === "excepciones" ? b[k].map((e) => e.codigo) : b[k]
    if (JSON.stringify(va) !== JSON.stringify(vb)) distintas.push(k)
  }
  return distintas
}
