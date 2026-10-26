/** Reglas de control RC1–RC10 (PRD 7.3). Funciones puras: mismo paquete + maestros → mismo resultado. */
import type {
  CentroCosto,
  CodigoControl,
  Derivado,
  EstadoControl,
  Hallazgo,
  Maestros,
  Paquete,
  Proveedor,
  Validacion,
} from "./esquemas"
import { formatoMoneda, mismoTexto, normalizarNit, normalizarNombre, recortarPalabras, soloFecha } from "./normalizar"

export const TOLERANCIA_COTIZACION = 0.02
export const TOLERANCIA_ARITMETICA = 1
export const MAX_DESCRIPCION_SAP = 40

type Control = { codigo: CodigoControl; estado: EstadoControl; detalle: string }

/** Acumulador de una validación: cada regla agrega su control y, si aplica, un hallazgo. */
class Acta {
  readonly bloqueos: Hallazgo[] = []
  readonly confirmaciones: Hallazgo[] = []
  readonly derivados: Record<string, Derivado> = {}
  readonly controles: Control[] = []

  ok(codigo: CodigoControl, detalle: string) {
    this.controles.push({ codigo, estado: "ok", detalle })
  }
  noAplica(codigo: CodigoControl, detalle: string) {
    this.controles.push({ codigo, estado: "no_aplica", detalle })
  }
  bloquear(h: Hallazgo) {
    this.bloqueos.push(h)
    this.controles.push({ codigo: h.codigo, estado: "bloqueo", detalle: h.detalle })
  }
  confirmar(h: Hallazgo) {
    this.confirmaciones.push(h)
    this.controles.push({ codigo: h.codigo, estado: "confirmacion", detalle: h.detalle })
  }
  derivar(codigo: CodigoControl, campo: string, d: Derivado, informar = true) {
    this.derivados[campo] = d
    if (informar) this.controles.push({ codigo, estado: "derivado", detalle: `${campo} = ${d.valor} (${d.motivo})` })
  }
}

// ── Búsquedas en maestros ────────────────────────────────────────────────────

export function buscarProveedor(
  paquete: Paquete,
  maestros: Maestros,
): { proveedor: Proveedor | null; criterio: string } {
  const nit = normalizarNit(paquete.solicitud.proveedor_nit) ?? paquete.cotizacion?.nit ?? null
  if (nit) {
    const fuente = paquete.solicitud.proveedor_nit ? "NIT de la solicitud" : "NIT de la cotización"
    return {
      proveedor: maestros.proveedores.find((p) => normalizarNit(p.nit) === nit) ?? null,
      criterio: `${fuente} ${nit}`,
    }
  }
  const nombre = normalizarNombre(paquete.solicitud.proveedor_nombre)
  return {
    proveedor: maestros.proveedores.find((p) => normalizarNombre(p.nombre) === nombre) ?? null,
    criterio: `nombre "${paquete.solicitud.proveedor_nombre}"`,
  }
}

export function buscarCentro(paquete: Paquete, maestros: Maestros): CentroCosto | null {
  return maestros.centrosCosto.find((c) => mismoTexto(c.centro_costo, paquete.solicitud.centro_costo)) ?? null
}

function emailAprobador(paquete: Paquete): string | null {
  return paquete.aprobacion?.de.trim().toLowerCase() ?? null
}

// ── Reglas ───────────────────────────────────────────────────────────────────

function rc1Proveedor(acta: Acta, paquete: Paquete, maestros: Maestros): Proveedor | null {
  const { proveedor, criterio } = buscarProveedor(paquete, maestros)
  const nombre = paquete.solicitud.proveedor_nombre
  if (!proveedor) {
    acta.bloquear({
      codigo: "RC1",
      titulo: "Proveedor no registrado",
      detalle: `${nombre} no existe en el maestro de proveedores (búsqueda por ${criterio}).`,
      accion_sugerida:
        "Pedir a Datos Maestros/Compras la creación del proveedor en SAP (RUT, certificación bancaria) o confirmar con el solicitante si hay un proveedor homologado equivalente.",
    })
    return null
  }
  if (!proveedor.activo) {
    acta.bloquear({
      codigo: "RC1",
      titulo: "Proveedor inactivo",
      detalle: `${proveedor.nombre} (SAP ${proveedor.codigo_sap}) está inactivo en el maestro.`,
      accion_sugerida: "Solicitar a Datos Maestros la reactivación del proveedor o cotizar con un proveedor activo.",
    })
    return proveedor
  }
  acta.ok("RC1", `${proveedor.nombre} existe y está activo (SAP ${proveedor.codigo_sap}, por ${criterio}).`)
  return proveedor
}

type AprobadorValido = { email: string; tope: number; nombre: string | undefined }

function rc2Aprobacion(acta: Acta, paquete: Paquete, centro: CentroCosto | null): AprobadorValido | null {
  const cc = paquete.solicitud.centro_costo
  if (!paquete.aprobacion) {
    acta.bloquear({
      codigo: "RC2",
      titulo: "Falta la aprobación",
      detalle: "El paquete no trae el correo de aprobación del líder.",
      accion_sugerida: "Pedir al solicitante que reenvíe el correo de aprobación de su líder.",
    })
    return null
  }
  if (!paquete.aprobacion.aprobado) {
    acta.bloquear({
      codigo: "RC2",
      titulo: "El correo no aprueba",
      detalle: `El correo de ${paquete.aprobacion.de} no contiene una aprobación explícita ("Aprobado").`,
      accion_sugerida: 'Pedir al líder una respuesta explícita con la palabra "Aprobado".',
    })
    return null
  }
  if (!centro) {
    acta.bloquear({
      codigo: "RC2",
      titulo: "No se puede verificar el aprobador",
      detalle: `El centro de costo ${cc} no existe, así que no hay matriz de aprobación para validar a ${paquete.aprobacion.de}.`,
      accion_sugerida: "Corregir el centro de costo en la solicitud y volver a procesar.",
    })
    return null
  }
  const email = emailAprobador(paquete) ?? ""
  const aprobador = centro.aprobadores.find((a) => a.email.toLowerCase() === email)
  if (!aprobador) {
    const validos = centro.aprobadores.map((a) => `${a.nombre ?? a.email} (${a.email})`).join(", ")
    acta.bloquear({
      codigo: "RC2",
      titulo: "Aprobador sin autoridad en el centro",
      detalle: `${paquete.aprobacion.de} no es aprobador de ${cc}${centro.nombre ? ` (${centro.nombre})` : ""}. Aprobadores válidos: ${validos}.`,
      accion_sugerida: `Solicitar la aprobación a un aprobador de ${cc}: ${validos}.`,
    })
    return null
  }
  acta.ok("RC2", `Aprobado por ${aprobador.nombre ?? aprobador.email}, aprobador de ${cc}.`)
  return { email: aprobador.email, tope: aprobador.tope, nombre: aprobador.nombre }
}

function rc3Tope(acta: Acta, paquete: Paquete, centro: CentroCosto | null, aprobador: AprobadorValido | null) {
  const { valor_total, moneda, centro_costo } = paquete.solicitud
  if (!aprobador) {
    const conTope = centro?.aprobadores.filter((a) => a.tope >= valor_total) ?? []
    const nota =
      centro && conTope.length === 0
        ? ` Ojo: ningún aprobador de ${centro_costo} tiene tope para ${formatoMoneda(valor_total, moneda)}; requerirá escalamiento.`
        : ""
    acta.noAplica("RC3", `Sin aprobador válido no se evalúa el tope.${nota}`)
    return
  }
  if (valor_total > aprobador.tope) {
    const alternativos = centro?.aprobadores.filter((a) => a.tope >= valor_total).map((a) => a.email) ?? []
    acta.bloquear({
      codigo: "RC3",
      titulo: "Monto supera el tope del aprobador",
      detalle: `${formatoMoneda(valor_total, moneda)} supera el tope de ${aprobador.email} (${formatoMoneda(aprobador.tope, moneda)}).`,
      accion_sugerida:
        alternativos.length > 0
          ? `Solicitar la aprobación a: ${alternativos.join(", ")}.`
          : `Ningún aprobador de ${centro_costo} tiene tope suficiente: escalar a la dirección financiera.`,
      comparacion: {
        etiqueta_a: "Valor solicitud",
        valor_a: valor_total,
        etiqueta_b: "Tope del aprobador",
        valor_b: aprobador.tope,
      },
    })
    return
  }
  acta.ok(
    "RC3",
    `${formatoMoneda(valor_total, moneda)} está dentro del tope (${formatoMoneda(aprobador.tope, moneda)}).`,
  )
}

function rc4Subarea(acta: Acta, paquete: Paquete, centro: CentroCosto | null) {
  const { centro_costo, subarea } = paquete.solicitud
  if (!centro) {
    acta.bloquear({
      codigo: "RC4",
      titulo: "Centro de costo inexistente",
      detalle: `${centro_costo} no existe en el maestro de centros de costo.`,
      accion_sugerida: "Confirmar con el solicitante el centro de costo correcto.",
    })
    return
  }
  if (!centro.subareas.some((s) => mismoTexto(s, subarea))) {
    acta.bloquear({
      codigo: "RC4",
      titulo: "Subárea no pertenece al centro",
      detalle: `"${subarea}" no es subárea de ${centro_costo}. Subáreas válidas: ${centro.subareas.join(", ")}.`,
      accion_sugerida: "Corregir la subárea con el solicitante.",
    })
    return
  }
  acta.ok("RC4", `"${subarea}" pertenece a ${centro_costo}.`)
}

function rc5Cotizacion(acta: Acta, paquete: Paquete) {
  const { valor_total, moneda } = paquete.solicitud
  const cot = paquete.cotizacion
  if (!cot) {
    acta.confirmar({
      codigo: "RC5",
      titulo: "Sin cotización",
      detalle: "El paquete no trae cotización del proveedor; el valor no se puede contrastar.",
      accion_sugerida: "Confirmar que se acepta crear la OC sin cotización, o pedirla al solicitante.",
    })
    return
  }
  const diferencia = Math.abs(cot.total - valor_total) / valor_total
  const pct = `${(diferencia * 100).toFixed(1).replace(".", ",")} %`
  if (diferencia > TOLERANCIA_COTIZACION || cot.moneda !== moneda) {
    acta.confirmar({
      codigo: "RC5",
      titulo: "La cotización no coincide con la solicitud",
      detalle: `Solicitud ${formatoMoneda(valor_total, moneda)} vs cotización ${formatoMoneda(cot.total, cot.moneda)} (diferencia ${pct}, tolerancia 2 %).`,
      accion_sugerida:
        "Confirmar con cuál valor se crea la OC. La OC usa el valor aprobado de la solicitud; si debe ir por el de la cotización, se requiere nueva aprobación.",
      comparacion: {
        etiqueta_a: "Solicitud",
        valor_a: valor_total,
        etiqueta_b: "Cotización",
        valor_b: cot.total,
        diferencia: pct,
      },
    })
    return
  }
  acta.ok("RC5", `Cotización ${cot.numero ?? ""} cuadra con la solicitud (diferencia ${pct}).`.replace("  ", " "))
}

function rc6Iva(acta: Acta, paquete: Paquete, proveedor: Proveedor | null, maestros: Maestros) {
  const informado = paquete.solicitud.indicador_iva
  if (informado) {
    const existe = maestros.indicadoresIva.find((i) => i.codigo === informado)
    if (existe) {
      acta.ok("RC6", `Indicador ${informado} (${existe.descripcion}) informado en la solicitud.`)
      return
    }
  }
  if (!proveedor) {
    acta.noAplica("RC6", "Sin proveedor en el maestro no se puede derivar el indicador de IVA.")
    return
  }
  const codigo = proveedor.indicador_iva_default
  const desc = maestros.indicadoresIva.find((i) => i.codigo === codigo)?.descripcion ?? codigo
  const motivo = informado ? `el indicador "${informado}" no existe en el maestro` : "la solicitud no informa IVA"
  acta.derivar("RC6", "indicador_iva", { valor: codigo, fuente: "maestro.proveedores", motivo }, false)
  acta.confirmar({
    codigo: "RC6",
    titulo: "IVA no informado",
    detalle: `Como ${motivo}, se propone ${codigo} (${desc}), el indicador por defecto de ${proveedor.nombre}.`,
    accion_sugerida: `Confirmar ${codigo} o indicar el código de IVA correcto.`,
    comparacion: {
      etiqueta_a: "Solicitud",
      valor_a: informado ?? "sin dato",
      etiqueta_b: "Propuesto",
      valor_b: codigo,
    },
  })
}

function rc7CondicionesPago(acta: Acta, paquete: Paquete, proveedor: Proveedor | null, maestros: Maestros) {
  const informado = paquete.solicitud.condiciones_pago
  if (informado && maestros.condicionesPago.some((c) => c.codigo === informado)) {
    acta.ok("RC7", `Condiciones ${informado} informadas en la solicitud.`)
    return
  }
  if (!proveedor) {
    acta.noAplica("RC7", "Sin proveedor en el maestro no se pueden derivar las condiciones de pago.")
    return
  }
  const codigo = proveedor.condiciones_pago_default
  const desc = maestros.condicionesPago.find((c) => c.codigo === codigo)?.descripcion ?? codigo
  acta.derivar("RC7", "condiciones_pago", {
    valor: codigo,
    fuente: "maestro.proveedores",
    motivo: `${informado ? `"${informado}" no existe en el maestro` : "la solicitud no las informa"}; se usa el default del proveedor (${desc})`,
  })
}

function rc8Retroactiva(acta: Acta, paquete: Paquete): boolean {
  const factura = paquete.factura
  const fechaSol = paquete.solicitud.fecha_solicitud
  if (!factura) {
    acta.noAplica("RC8", "No llegó factura con el paquete.")
    return false
  }
  if (factura.fecha < fechaSol) {
    acta.confirmar({
      codigo: "RC8",
      titulo: "OC retroactiva",
      detalle: `La factura ${factura.numero} (${factura.fecha}) es anterior a la solicitud (${fechaSol}): la compra se hizo antes de pedir la OC.`,
      accion_sugerida:
        "Confirmar la creación; quedará marcada como retroactiva en el log de control para seguimiento de la dirección.",
      comparacion: { etiqueta_a: "Factura", valor_a: factura.fecha, etiqueta_b: "Solicitud", valor_b: fechaSol },
    })
    return true
  }
  acta.ok("RC8", `La factura ${factura.numero} (${factura.fecha}) no es anterior a la solicitud.`)
  return false
}

function rc9FechaAprobacion(acta: Acta, paquete: Paquete) {
  const aprob = paquete.aprobacion
  if (!aprob) {
    acta.noAplica("RC9", "Sin aprobación no se evalúa la fecha.")
    return
  }
  const fechaAprob = soloFecha(aprob.fecha) ?? aprob.fecha
  const fechaSol = paquete.solicitud.fecha_solicitud
  if (fechaAprob < fechaSol) {
    acta.confirmar({
      codigo: "RC9",
      titulo: "Aprobación anterior a la solicitud",
      detalle: `La aprobación (${fechaAprob}) es anterior a la fecha de la solicitud (${fechaSol}).`,
      accion_sugerida: "Confirmar que la aprobación corresponde a esta solicitud.",
      comparacion: { etiqueta_a: "Aprobación", valor_a: fechaAprob, etiqueta_b: "Solicitud", valor_b: fechaSol },
    })
    return
  }
  acta.ok("RC9", `Aprobación del ${fechaAprob}, posterior o igual a la solicitud (${fechaSol}).`)
}

function rc10Aritmetica(acta: Acta, paquete: Paquete) {
  const { cantidad, valor_unitario, valor_total, moneda } = paquete.solicitud
  const calculado = cantidad * valor_unitario
  if (Math.abs(calculado - valor_total) > TOLERANCIA_ARITMETICA) {
    acta.bloquear({
      codigo: "RC10",
      titulo: "Cantidad × valor unitario no da el total",
      detalle: `${cantidad} × ${formatoMoneda(valor_unitario, moneda)} = ${formatoMoneda(calculado, moneda)}, pero la solicitud dice ${formatoMoneda(valor_total, moneda)}.`,
      accion_sugerida: "Pedir al solicitante que corrija la cantidad, el valor unitario o el total.",
      comparacion: { etiqueta_a: "Calculado", valor_a: calculado, etiqueta_b: "Solicitud", valor_b: valor_total },
    })
    return
  }
  acta.ok("RC10", `${cantidad} × ${formatoMoneda(valor_unitario, moneda)} = ${formatoMoneda(valor_total, moneda)}.`)
}

/** Derivados de forma (no de maestros): unidad y texto breve SAP. Se informan, no bloquean. */
function derivadosDeForma(acta: Acta, paquete: Paquete) {
  const desc = paquete.solicitud.descripcion
  const unidad = /\bhoras?\b/i.test(desc) ? "H" : /\b(mensual(idad)?|por mes)\b/i.test(desc) ? "MES" : "UN"
  acta.derivar(
    "RC10",
    "unidad",
    { valor: unidad, fuente: "derivado", motivo: "la solicitud no informa unidad; se infiere de la descripción" },
    false,
  )
  if (desc.length > MAX_DESCRIPCION_SAP) {
    acta.derivar(
      "RC10",
      "descripcion",
      {
        valor: recortarPalabras(desc, MAX_DESCRIPCION_SAP),
        fuente: "derivado",
        motivo: `el texto breve de SAP admite ${MAX_DESCRIPCION_SAP} caracteres; el texto completo queda en la trazabilidad`,
      },
      false,
    )
  }
}

const ORDEN: CodigoControl[] = ["RC1", "RC2", "RC3", "RC4", "RC5", "RC6", "RC7", "RC8", "RC9", "RC10"]

export function validarPaquete(paquete: Paquete, maestros: Maestros): Validacion {
  const acta = new Acta()
  const proveedor = rc1Proveedor(acta, paquete, maestros)
  const centro = buscarCentro(paquete, maestros)
  const aprobador = rc2Aprobacion(acta, paquete, centro)
  rc3Tope(acta, paquete, centro, aprobador)
  rc4Subarea(acta, paquete, centro)
  rc5Cotizacion(acta, paquete)
  rc6Iva(acta, paquete, proveedor, maestros)
  rc7CondicionesPago(acta, paquete, proveedor, maestros)
  const retroactiva = rc8Retroactiva(acta, paquete)
  rc9FechaAprobacion(acta, paquete)
  rc10Aritmetica(acta, paquete)
  derivadosDeForma(acta, paquete)
  const controles = [...acta.controles].sort((a, b) => ORDEN.indexOf(a.codigo) - ORDEN.indexOf(b.codigo))
  return {
    apta: acta.bloqueos.length === 0,
    bloqueos: acta.bloqueos,
    confirmaciones: acta.confirmaciones,
    derivados: acta.derivados,
    retroactiva,
    controles,
  }
}
