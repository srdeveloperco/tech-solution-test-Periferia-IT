/**
 * Datos del modo demostración (?demo=...). sol-001 y sol-002 reflejan los fixtures reales;
 * sol-004 es una reconstrucción plausible para diseñar el flujo de confirmación (RC5).
 */
import type { CasoResumen, Validacion } from "@oc/contracts"
import type { EvidenciaVista, OrdenVista, PaqueteVista } from "../api/guards"

export type CasoDemo = {
  paquete: PaqueteVista
  validacion: Validacion
  orden: OrdenVista | null
  evidencia: EvidenciaVista
}

const SHA_001 = "8d3f6a0c4b21e97f5a1c0d8e2b7f4a9c63e1d5b8a0f2c4e6d8b1a3c5e7f9d2b4"
const SHA_002 = "1b9e4c7a2d5f8e0b3c6a9d2f5e8b1c4a7d0f3e6b9c2a5d8f1e4b7c0a3d6f9e2c"
const SHA_004 = "3f9a2c71e8b4d6f0a5c3e9b1d7f2a8c4e6b0d9f3a1c5e7b2d4f6a8c0e9b3d5f1"

const CONTROLES_OK = (detalles: Record<string, string>): Validacion["controles"] =>
  (["RC1", "RC2", "RC3", "RC4", "RC5", "RC6", "RC7", "RC8", "RC9", "RC10"] as const).map((codigo) => ({
    codigo,
    estado: codigo === "RC8" ? "no_aplica" : "ok",
    detalle: detalles[codigo] ?? "",
  }))

// ── sol-001: flujo normal, termina con OC creada ──

const sol001: CasoDemo = {
  paquete: {
    correo: {
      id: "sol-001-correo",
      de: "juan.camargo@periferia-ficticia.com",
      asunto: "Solicitud de orden de compra SOL-001 - Renovación licencias antivirus corporati",
      fecha: "2026-08-20T09:00:00-05:00",
    },
    solicitud: {
      solicitud_id: "SOL-2026-001",
      solicitante: "Juan Camargo",
      proveedor_nombre: "TecnoSuministros S.A.S.",
      proveedor_nit: "900555111",
      descripcion: "Renovación licencias antivirus corporativo 120 puestos, vigencia 12 meses",
      centro_costo: "CC-1010",
      subarea: "Infraestructura",
      cantidad: 120,
      valor_unitario: 95000,
      valor_total: 11400000,
      moneda: "COP",
      indicador_iva: "C1",
      condiciones_pago: "Z030",
      fecha_solicitud: "2026-08-20",
    },
    cotizacion: {
      numero: "COT-TS-2026-0451",
      fecha: "2026-08-18",
      proveedor: "TecnoSuministros S.A.S.",
      nit: "900555111",
      total: 11400000,
      moneda: "COP",
      validez_hasta: "2026-09-17",
    },
    aprobacion: {
      de: "mlopez@periferia-ficticia.com",
      fecha: "2026-08-21T10:02:00-05:00",
      aprobado: true,
      texto: "Aprobado, proceder con la orden de compra.\n\nMariana López\nGerente de Tecnología",
    },
    factura: null,
    faltantes: [],
  },
  validacion: {
    apta: true,
    bloqueos: [],
    confirmaciones: [],
    derivados: {
      descripcion_corta: {
        valor: "Renovación licencias antivirus",
        fuente: "derivado",
        motivo: "SAP admite 40 caracteres en el texto breve; se recortó en palabra completa.",
      },
      unidad: { valor: "UN", fuente: "derivado", motivo: "La solicitud no trae unidad de medida; se usa UN." },
    },
    retroactiva: false,
    controles: CONTROLES_OK({
      RC1: "TecnoSuministros S.A.S. (100234) activo, encontrado por NIT 900555111.",
      RC2: "Aprobado por mlopez@periferia-ficticia.com, aprobadora de CC-1010.",
      RC3: "$ 11.400.000 dentro del tope de $ 50.000.000.",
      RC4: "Infraestructura pertenece a CC-1010.",
      RC5: "La cotización suma lo mismo que la solicitud (0 %).",
      RC6: "Indicador C1 informado en la solicitud.",
      RC7: "Condiciones Z030 informadas en la solicitud.",
      RC8: "No hay factura en el paquete.",
      RC9: "Aprobada el 21 ago, después de la solicitud del 20 ago.",
      RC10: "120 × $ 95.000 = $ 11.400.000.",
    }),
  },
  orden: {
    orden: {
      referencia: { solicitud_id: "SOL-2026-001", correo_id: "sol-001-correo", cotizacion_ref: "COT-TS-2026-0451" },
      sociedad: "1000",
      organizacion_compras: "1000",
      proveedor: { codigo_sap: "100234", nit: "900555111", nombre: "TecnoSuministros S.A.S." },
      moneda: "COP",
      condiciones_pago: "Z030",
      aprobador: {
        email: "mlopez@periferia-ficticia.com",
        fecha_aprobacion: "2026-08-21T10:02:00-05:00",
        evidencia_sha256: SHA_001,
      },
      posiciones: [
        {
          numero: 10,
          descripcion: "Renovación licencias antivirus",
          cantidad: 120,
          unidad: "UN",
          precio_unitario: 95000,
          centro_costo: "CC-1010",
          subarea: "Infraestructura",
          indicador_iva: "C1",
        },
      ],
      excepciones: [],
    },
    trazabilidad: {
      "referencia.solicitud_id": { valor: "SOL-2026-001", fuente: "solicitud" },
      "referencia.correo_id": { valor: "sol-001-correo", fuente: "correo" },
      "referencia.cotizacion_ref": { valor: "COT-TS-2026-0451", fuente: "cotizacion" },
      sociedad: { valor: "1000", fuente: "constante" },
      organizacion_compras: { valor: "1000", fuente: "constante" },
      "proveedor.codigo_sap": { valor: "100234", fuente: "maestro.proveedores" },
      "proveedor.nit": { valor: "900555111", fuente: "maestro.proveedores" },
      "proveedor.nombre": { valor: "TecnoSuministros S.A.S.", fuente: "maestro.proveedores" },
      moneda: { valor: "COP", fuente: "solicitud" },
      condiciones_pago: { valor: "Z030", fuente: "solicitud" },
      "aprobador.email": { valor: "mlopez@periferia-ficticia.com", fuente: "aprobacion" },
      "aprobador.fecha_aprobacion": { valor: "2026-08-21T10:02:00-05:00", fuente: "aprobacion" },
      "aprobador.evidencia_sha256": { valor: SHA_001, fuente: "derivado", detalle: "sha256 de aprobacion.txt" },
      "posiciones[0].descripcion": { valor: "Renovación licencias antivirus", fuente: "derivado" },
      "posiciones[0].cantidad": { valor: 120, fuente: "solicitud" },
      "posiciones[0].unidad": { valor: "UN", fuente: "derivado" },
      "posiciones[0].precio_unitario": { valor: 95000, fuente: "solicitud" },
      "posiciones[0].centro_costo": { valor: "CC-1010", fuente: "solicitud" },
      "posiciones[0].subarea": { valor: "Infraestructura", fuente: "solicitud" },
      "posiciones[0].indicador_iva": { valor: "C1", fuente: "solicitud" },
    },
    trazabilidad_ruta: "out/sol-001/trazabilidad.json",
  },
  evidencia: { ruta: "out/sol-001/aprobacion.txt", ruta_pdf: "out/sol-001/aprobacion.pdf", sha256: SHA_001 },
}

// ── sol-002: proveedor inexistente, se bloquea ──

const sol002: CasoDemo = {
  paquete: {
    correo: {
      id: "sol-002-correo",
      de: "sofía.herrera@periferia-ficticia.com",
      asunto: "Solicitud de orden de compra SOL-002 - Licencia anual herramienta de pruebas au",
      fecha: "2026-08-22T09:00:00-05:00",
    },
    solicitud: {
      solicitud_id: "SOL-2026-002",
      solicitante: "Sofía Herrera",
      proveedor_nombre: "Soluciones Digitales del Norte S.A.S.",
      proveedor_nit: "901999000",
      descripcion: "Licencia anual herramienta de pruebas automatizadas, 5 usuarios",
      centro_costo: "CC-1010",
      subarea: "Desarrollo",
      cantidad: 5,
      valor_unitario: 1700000,
      valor_total: 8500000,
      moneda: "COP",
      indicador_iva: "C1",
      condiciones_pago: "Z030",
      fecha_solicitud: "2026-08-22",
    },
    cotizacion: {
      numero: "SDN-0093",
      fecha: "2026-08-21",
      proveedor: "Soluciones Digitales del Norte S.A.S.",
      nit: "901999000",
      total: 8500000,
      moneda: "COP",
      validez_hasta: "2026-09-05",
    },
    aprobacion: {
      de: "mlopez@periferia-ficticia.com",
      fecha: "2026-08-22T15:30:00-05:00",
      aprobado: true,
      texto: "Aprobado.\n\nMariana López",
    },
    factura: null,
    faltantes: [],
  },
  validacion: {
    apta: false,
    bloqueos: [
      {
        codigo: "RC1",
        titulo: "El proveedor no existe en el maestro",
        detalle: "No hay proveedor con NIT 901999000 (Soluciones Digitales del Norte S.A.S.) en el maestro.",
        accion_sugerida: "Pide a Compras dar de alta al proveedor en SAP y vuelve a procesar la solicitud.",
      },
    ],
    confirmaciones: [],
    derivados: {},
    retroactiva: false,
    controles: CONTROLES_OK({
      RC2: "Aprobado por mlopez@periferia-ficticia.com, aprobadora de CC-1010.",
      RC3: "$ 8.500.000 dentro del tope de $ 50.000.000.",
      RC4: "Desarrollo pertenece a CC-1010.",
      RC5: "La cotización suma lo mismo que la solicitud (0 %).",
      RC6: "Indicador C1 informado en la solicitud.",
      RC7: "Condiciones Z030 informadas en la solicitud.",
      RC8: "No hay factura en el paquete.",
      RC9: "Aprobada el mismo día de la solicitud.",
      RC10: "5 × $ 1.700.000 = $ 8.500.000.",
    }).map((c) =>
      c.codigo === "RC1"
        ? { ...c, estado: "bloqueo", detalle: "NIT 901999000 no está en el maestro de proveedores." }
        : c,
    ),
  },
  orden: null,
  evidencia: { ruta: "out/sol-002/aprobacion.txt", ruta_pdf: "out/sol-002/aprobacion.pdf", sha256: SHA_002 },
}

// ── sol-004: la cotización no cuadra, pide confirmación ──

const confirmacionRc5 = {
  codigo: "RC5" as const,
  titulo: "La cotización no cuadra con la solicitud",
  detalle: "La cotización suma 5,8 % más que la solicitud. La tolerancia es 2 %.",
  accion_sugerida: "Confirma si se compra por el valor de la solicitud o pide al solicitante actualizarla.",
  comparacion: {
    etiqueta_a: "Solicitud",
    valor_a: 17000000,
    etiqueta_b: "Cotización",
    valor_b: 17980000,
    diferencia: "+5,8 %",
  },
}

const sol004: CasoDemo = {
  paquete: {
    correo: {
      id: "sol-004-correo",
      de: "andres.pineda@periferia-ficticia.com",
      asunto: "Solicitud de orden de compra SOL-004 - Sillas ergonómicas sala de capacitación",
      fecha: "2026-08-25T08:15:00-05:00",
    },
    solicitud: {
      solicitud_id: "SOL-2026-004",
      solicitante: "Andrés Pineda",
      proveedor_nombre: "Mobiliario Andino S.A.",
      proveedor_nit: "830111222",
      descripcion: "Sillas ergonómicas para sala de capacitación, 20 unidades",
      centro_costo: "CC-2020",
      subarea: "Servicios Generales",
      cantidad: 20,
      valor_unitario: 850000,
      valor_total: 17000000,
      moneda: "COP",
      indicador_iva: "C1",
      condiciones_pago: "Z030",
      fecha_solicitud: "2026-08-25",
    },
    cotizacion: {
      numero: "MA-2026-0712",
      fecha: "2026-08-24",
      proveedor: "Mobiliario Andino S.A.",
      nit: "830111222",
      total: 17980000,
      moneda: "COP",
      validez_hasta: "2026-09-23",
    },
    aprobacion: {
      de: "rtorres@periferia-ficticia.com",
      fecha: "2026-08-26T08:40:00-05:00",
      aprobado: true,
      texto: "Aprobado.\n\nRocío Torres\nDirectora Administrativa",
    },
    factura: null,
    faltantes: [],
  },
  validacion: {
    apta: true,
    bloqueos: [],
    confirmaciones: [confirmacionRc5],
    derivados: {
      descripcion_corta: {
        valor: "Sillas ergonómicas sala de capacitación",
        fuente: "derivado",
        motivo: "SAP admite 40 caracteres en el texto breve; se recortó en palabra completa.",
      },
      unidad: { valor: "UN", fuente: "derivado", motivo: "La solicitud no trae unidad de medida; se usa UN." },
    },
    retroactiva: false,
    controles: CONTROLES_OK({
      RC1: "Mobiliario Andino S.A. (100150) activo, encontrado por NIT 830111222.",
      RC2: "Aprobado por rtorres@periferia-ficticia.com, aprobadora de CC-2020.",
      RC3: "$ 17.000.000 dentro del tope de $ 30.000.000.",
      RC4: "Servicios Generales pertenece a CC-2020.",
      RC6: "Indicador C1 informado en la solicitud.",
      RC7: "Condiciones Z030 informadas en la solicitud.",
      RC8: "No hay factura en el paquete.",
      RC9: "Aprobada el 26 ago, después de la solicitud del 25 ago.",
      RC10: "20 × $ 850.000 = $ 17.000.000.",
    }).map((c) =>
      c.codigo === "RC5"
        ? { ...c, estado: "confirmacion", detalle: "Cotización $ 17.980.000 frente a solicitud $ 17.000.000 (+5,8 %)." }
        : c,
    ),
  },
  orden: {
    orden: {
      referencia: { solicitud_id: "SOL-2026-004", correo_id: "sol-004-correo", cotizacion_ref: "MA-2026-0712" },
      sociedad: "1000",
      organizacion_compras: "1000",
      proveedor: { codigo_sap: "100150", nit: "830111222", nombre: "Mobiliario Andino S.A." },
      moneda: "COP",
      condiciones_pago: "Z030",
      aprobador: {
        email: "rtorres@periferia-ficticia.com",
        fecha_aprobacion: "2026-08-26T08:40:00-05:00",
        evidencia_sha256: SHA_004,
      },
      posiciones: [
        {
          numero: 10,
          descripcion: "Sillas ergonómicas sala de capacitación",
          cantidad: 20,
          unidad: "UN",
          precio_unitario: 850000,
          centro_costo: "CC-2020",
          subarea: "Servicios Generales",
          indicador_iva: "C1",
        },
      ],
      excepciones: [
        {
          codigo: "RC5",
          detalle: "Cotización $ 17.980.000 frente a solicitud $ 17.000.000 (+5,8 %).",
          confirmado_por: null,
        },
      ],
    },
    trazabilidad: {
      "referencia.solicitud_id": { valor: "SOL-2026-004", fuente: "solicitud" },
      "referencia.correo_id": { valor: "sol-004-correo", fuente: "correo" },
      "referencia.cotizacion_ref": { valor: "MA-2026-0712", fuente: "cotizacion" },
      sociedad: { valor: "1000", fuente: "constante" },
      organizacion_compras: { valor: "1000", fuente: "constante" },
      "proveedor.codigo_sap": { valor: "100150", fuente: "maestro.proveedores" },
      "proveedor.nit": { valor: "830111222", fuente: "maestro.proveedores" },
      "proveedor.nombre": { valor: "Mobiliario Andino S.A.", fuente: "maestro.proveedores" },
      moneda: { valor: "COP", fuente: "solicitud" },
      condiciones_pago: { valor: "Z030", fuente: "solicitud" },
      "aprobador.email": { valor: "rtorres@periferia-ficticia.com", fuente: "aprobacion" },
      "aprobador.fecha_aprobacion": { valor: "2026-08-26T08:40:00-05:00", fuente: "aprobacion" },
      "aprobador.evidencia_sha256": { valor: SHA_004, fuente: "derivado", detalle: "sha256 de aprobacion.txt" },
      "posiciones[0].descripcion": { valor: "Sillas ergonómicas sala de capacitación", fuente: "derivado" },
      "posiciones[0].cantidad": { valor: 20, fuente: "solicitud" },
      "posiciones[0].unidad": { valor: "UN", fuente: "derivado" },
      "posiciones[0].precio_unitario": { valor: 850000, fuente: "solicitud" },
      "posiciones[0].centro_costo": { valor: "CC-2020", fuente: "solicitud" },
      "posiciones[0].subarea": { valor: "Servicios Generales", fuente: "solicitud" },
      "posiciones[0].indicador_iva": { valor: "C1", fuente: "solicitud" },
    },
    trazabilidad_ruta: "out/sol-004/trazabilidad.json",
  },
  evidencia: { ruta: "out/sol-004/aprobacion.txt", ruta_pdf: "out/sol-004/aprobacion.pdf", sha256: SHA_004 },
}

export const CASOS_DEMO: Record<string, CasoDemo> = { "sol-001": sol001, "sol-002": sol002, "sol-004": sol004 }

export const BANDEJA_DEMO: CasoResumen[] = [
  {
    caso: "sol-001",
    solicitud_id: "SOL-2026-001",
    descripcion: "Renovación licencias antivirus corporativo 120 puestos",
    proveedor: "TecnoSuministros S.A.S.",
    valor_total: 11400000,
    moneda: "COP",
    estado: null,
    numero_oc: null,
  },
  {
    caso: "sol-002",
    solicitud_id: "SOL-2026-002",
    descripcion: "Licencia anual herramienta de pruebas automatizadas",
    proveedor: "Soluciones Digitales del Norte S.A.S.",
    valor_total: 8500000,
    moneda: "COP",
    estado: "bloqueada",
    numero_oc: null,
  },
  {
    caso: "sol-003",
    solicitud_id: "SOL-2026-003",
    descripcion: "Servidores de respaldo para centro de datos",
    proveedor: "TecnoSuministros S.A.S.",
    valor_total: 64000000,
    moneda: "COP",
    estado: null,
    numero_oc: null,
  },
  {
    caso: "sol-004",
    solicitud_id: "SOL-2026-004",
    descripcion: "Sillas ergonómicas para sala de capacitación",
    proveedor: "Mobiliario Andino S.A.",
    valor_total: 17000000,
    moneda: "COP",
    estado: null,
    numero_oc: null,
  },
  {
    caso: "sol-005",
    solicitud_id: "SOL-2026-005",
    descripcion: "Créditos de nube, consumo de julio",
    proveedor: "Cloud Andina S.A.S.",
    valor_total: 9200000,
    moneda: "COP",
    estado: null,
    numero_oc: null,
  },
  {
    caso: "sol-006",
    solicitud_id: "SOL-2026-006",
    descripcion: "Resmas y útiles de oficina, segundo semestre",
    proveedor: "Papelería Central Ltda.",
    valor_total: 2350000,
    moneda: "COP",
    estado: null,
    numero_oc: null,
  },
]

/** Gasto acumulado simulado: avanza con cada turno de la demo. */
export const presupuestoDemo = { limiteUsd: 10, gastadoUsd: 0.4213 }
