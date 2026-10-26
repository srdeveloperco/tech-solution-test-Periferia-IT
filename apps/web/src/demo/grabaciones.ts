import type { EventoChat, Hallazgo, MensajeVisible, RespuestaChat, RutaTurno, ToolCallVisible } from "@oc/contracts"
import { CASOS_DEMO, presupuestoDemo } from "./datos"

export type Paso = { ms: number; evento: EventoChat }

const SONNET = "claude-sonnet-5-5"
const HAIKU = "claude-haiku-5-5"

let contador = 0
const idLlamada = () => `toolu_demo_${(contador++).toString(36)}`

/** Un turno grabado: se convierte en pasos con tiempos realistas. */
type Turno = {
  ruta: RutaTurno
  herramientas: Array<{ nombre: string; args: unknown; resultado: unknown; resumen: string; ms: number }>
  texto: string
  confirmacion: { caso: string; confirmaciones: Hallazgo[] } | null
  costoUsd: number
  tokens: [number, number]
}

function trozos(texto: string): string[] {
  // Trozos de 2 a 4 palabras, como llegan los deltas de un modelo.
  const palabras = texto.split(/(?<=\s)/)
  const salida: string[] = []
  for (let i = 0; i < palabras.length; i += 3) salida.push(palabras.slice(i, i + 3).join(""))
  return salida
}

/** Un turno grabado como mensajes ya guardados (para el historial de la demo). */
export function visibleDeTurno(mensajeUsuario: string, turno: Turno, ts: string): MensajeVisible[] {
  const toolCalls: ToolCallVisible[] = turno.herramientas.map((h) => ({
    id: idLlamada(),
    nombre: h.nombre,
    args: h.args,
    ok: typeof h.resultado === "object" && h.resultado !== null && "ok" in h.resultado && h.resultado.ok === true,
    resumen: h.resumen,
    resultado: h.resultado,
    ms: h.ms,
  }))
  return [
    { rol: "usuario", texto: mensajeUsuario, ts },
    { rol: "agente", texto: turno.texto, ts, toolCalls, confirmacion: turno.confirmacion, ruta: turno.ruta },
  ]
}

export function pasosDeTurno(turno: Turno, sessionId: string): Paso[] {
  const pasos: Paso[] = [
    { ms: 60, evento: { tipo: "sesion", sessionId } },
    { ms: 220, evento: { tipo: "ruta", ruta: turno.ruta } },
    { ms: 80, evento: { tipo: "pensando" } },
  ]
  const llamadas: ToolCallVisible[] = []
  let primera = true
  for (const h of turno.herramientas) {
    const id = idLlamada()
    pasos.push({ ms: primera ? 900 : 420, evento: { tipo: "herramienta_inicio", id, nombre: h.nombre, args: h.args } })
    primera = false
    const ok = typeof h.resultado === "object" && h.resultado !== null && "ok" in h.resultado && h.resultado.ok === true
    pasos.push({
      ms: h.ms,
      evento: {
        tipo: "herramienta_fin",
        id,
        nombre: h.nombre,
        ok,
        resumen: h.resumen,
        resultado: h.resultado,
        ms: h.ms,
      },
    })
    llamadas.push({ id, nombre: h.nombre, args: h.args, ok, resumen: h.resumen, resultado: h.resultado, ms: h.ms })
  }
  if (turno.confirmacion) pasos.push({ ms: 120, evento: { tipo: "confirmacion", ...turno.confirmacion } })
  pasos.push({ ms: 700, evento: { tipo: "pensando" } })
  for (const trozo of trozos(turno.texto))
    pasos.push({ ms: 26 + Math.round(Math.random() * 34), evento: { tipo: "texto_delta", texto: trozo } })
  pasos.push({ ms: 60, evento: { tipo: "mensaje", texto: turno.texto } })
  const cifras = (turno.texto.match(/\d[\d.]{3,}/g) ?? []).length
  pasos.push({
    ms: 90,
    evento: {
      tipo: "verificacion",
      ok: true,
      detalle: cifras > 0 ? `${cifras} cifras verificadas contra las herramientas` : "Sin cifras que verificar",
    },
  })
  presupuestoDemo.gastadoUsd += turno.costoUsd
  const respuesta: RespuestaChat = {
    sessionId,
    reply: turno.texto,
    toolCalls: llamadas,
    needsConfirmation: turno.confirmacion !== null,
    confirmacion: turno.confirmacion,
    ruta: turno.ruta,
    uso: {
      tokensEntrada: turno.tokens[0],
      tokensSalida: turno.tokens[1],
      iteraciones: turno.herramientas.length + 1,
      costoUsd: turno.costoUsd,
    },
    presupuesto: {
      limiteUsd: presupuestoDemo.limiteUsd,
      gastadoUsd: presupuestoDemo.gastadoUsd,
      restanteUsd: presupuestoDemo.limiteUsd - presupuestoDemo.gastadoUsd,
      bloqueado: presupuestoDemo.gastadoUsd >= presupuestoDemo.limiteUsd,
    },
    interaccionId: `int_demo_${contador}`,
  }
  pasos.push({ ms: 40, evento: { tipo: "fin", respuesta } })
  return pasos
}

const ok = (data: unknown) => ({ ok: true, data })

function rutaOperador(caso: string, intencion: RutaTurno["intencion"], motivo: string): RutaTurno {
  return { agente: "operador", intencion, caso, enrutador: "reglas", modelo: SONNET, motivo }
}

// ── Turnos grabados ──

export function turnoProcesar(caso: string): Turno | null {
  const d = CASOS_DEMO[caso]
  if (!d) return null
  const args = { caso }
  const v = d.validacion
  const herramientas: Turno["herramientas"] = [
    {
      nombre: "oc_leer_paquete",
      args,
      resultado: ok(d.paquete),
      resumen: "Paquete completo: correo, solicitud, cotización y aprobación",
      ms: 640,
    },
    {
      nombre: "oc_validar",
      args: { caso, paquete: d.paquete },
      resultado: ok(v),
      resumen: [
        v.apta ? "Apta" : "No apta",
        v.bloqueos.length > 0 && `${v.bloqueos.length} ${v.bloqueos.length === 1 ? "bloqueo" : "bloqueos"}`,
        v.confirmaciones.length > 0 &&
          `${v.confirmaciones.length} ${v.confirmaciones.length === 1 ? "confirmación" : "confirmaciones"}`,
      ]
        .filter(Boolean)
        .join(" · "),
      ms: 820,
    },
  ]
  if (d.orden) {
    herramientas.push(
      {
        nombre: "oc_construir_payload",
        args: { caso, paquete: d.paquete, derivados: v.derivados },
        resultado: ok(d.orden),
        resumen: `OC lista: ${d.orden.orden.posiciones.length} posición`,
        ms: 560,
      },
      {
        nombre: "oc_generar_evidencia",
        args,
        resultado: ok(d.evidencia),
        resumen: `aprobacion.txt y aprobacion.pdf · ${d.evidencia.sha256.slice(0, 8)}`,
        ms: 480,
      },
    )
  } else {
    herramientas.push({
      nombre: "oc_construir_payload",
      args: { caso, paquete: d.paquete, derivados: v.derivados },
      resultado: { ok: false, error: "No se puede construir la OC: la validación tiene bloqueos (RC1)." },
      resumen: "No se construye: hay bloqueos",
      ms: 180,
    })
  }

  if (caso === "sol-001") {
    herramientas.push({
      nombre: "oc_crear",
      args: { caso, payload: d.orden?.orden ?? null },
      resultado: ok({
        resultado: "creada",
        numero_oc: "4500000001",
        fecha: "2026-10-26",
        idempotente: false,
        retroactiva: false,
      }),
      resumen: "OC 4500000001 creada",
      ms: 700,
    })
    return {
      ruta: rutaOperador(caso, "procesar_caso", "El mensaje nombra el caso sol-001"),
      herramientas,
      confirmacion: null,
      costoUsd: 0.0318,
      tokens: [18420, 960],
      texto:
        "Listo, creé la OC **4500000001** para sol-001, sin excepciones.\n\nSon 120 licencias de antivirus de TecnoSuministros por **$ 11.400.000**, con cargo a CC-1010 · Infraestructura. Aprobó Mariana López el 21 de agosto.\n\nRecorté la descripción a 40 caracteres, que es el límite de SAP. El texto completo quedó en la trazabilidad.",
    }
  }

  if (caso === "sol-002") {
    herramientas.push({
      nombre: "oc_crear",
      args: { caso, payload: null },
      resultado: {
        ok: false,
        error: "La OC no es apta: tiene bloqueos.",
        resultado: "bloqueada",
        caso,
        bloqueos: v.bloqueos,
      },
      resumen: "Bloqueada: proveedor inexistente (RC1)",
      ms: 240,
    })
    return {
      ruta: rutaOperador(caso, "procesar_caso", "El mensaje nombra el caso sol-002"),
      herramientas,
      confirmacion: null,
      costoUsd: 0.0244,
      tokens: [14210, 720],
      texto:
        "No puedo crear la OC de **sol-002**.\n\nEl proveedor *Soluciones Digitales del Norte S.A.S.* (NIT 901999000) no está en el maestro de proveedores, y sin código SAP la orden no se puede registrar. El resto del paquete está en orden.\n\n**Siguiente paso:** pide a Compras que lo den de alta en SAP. Cuando esté, la vuelvo a procesar en segundos.",
    }
  }

  // sol-004: pide confirmación por RC5
  herramientas.push({
    nombre: "oc_crear",
    args: { caso, payload: d.orden?.orden ?? null },
    resultado: {
      ok: false,
      error: "Requiere confirmación explícita del usuario antes de crear.",
      resultado: "pendiente",
      caso,
      confirmaciones: v.confirmaciones,
    },
    resumen: "Pendiente: necesita tu confirmación (RC5)",
    ms: 260,
  })
  return {
    ruta: rutaOperador(caso, "procesar_caso", "El mensaje nombra el caso sol-004"),
    herramientas,
    confirmacion: { caso, confirmaciones: v.confirmaciones },
    costoUsd: 0.0412,
    tokens: [21840, 1420],
    texto:
      "Revisé **sol-004**. Pasa 9 de 10 controles, pero hay algo que necesito que decidas antes de crearla.\n\n**La cotización no cuadra con la solicitud.** Mobiliario Andino cotizó **$ 17.980.000** y la solicitud dice **$ 17.000.000**: 5,8 % de diferencia, por encima del 2 % que toleramos.\n\n| Campo | Valor |\n|---|---|\n| Proveedor | Mobiliario Andino S.A. (100150) |\n| Posición 10 | 20 UN × $ 850.000 |\n| Centro de costo | CC-2020 · Servicios Generales |\n| IVA y pago | C1 · Z030 |\n| Aprobó | rtorres@periferia-ficticia.com |\n\n¿La creo por el valor de la solicitud? Si prefieres, la dejo pendiente mientras el solicitante actualiza la cotización.",
  }
}

export function turnoConfirmar(caso: string): Turno | null {
  const d = CASOS_DEMO[caso]
  if (!d?.orden || caso !== "sol-004") return null
  return {
    ruta: rutaOperador(caso, "confirmar", "Confirmación explícita desde la hoja de decisión"),
    herramientas: [
      {
        nombre: "oc_crear",
        args: { caso, payload: d.orden.orden, confirmado: true },
        resultado: ok({
          resultado: "creada",
          numero_oc: "4500000002",
          fecha: "2026-10-26",
          idempotente: false,
          retroactiva: false,
        }),
        resumen: "OC 4500000002 creada",
        ms: 720,
      },
    ],
    confirmacion: null,
    costoUsd: 0.0118,
    tokens: [9310, 240],
    texto:
      "Listo, creé la OC **4500000002** por $ 17.000.000.\n\nDejé registrada tu confirmación de la diferencia con la cotización y adjunté la evidencia de aprobación.",
  }
}

export function turnoRechazar(caso: string | null): Turno {
  return {
    ruta: rutaOperador(caso ?? "", "rechazar", "El usuario decidió no crearla por ahora"),
    herramientas: [],
    confirmacion: null,
    costoUsd: 0.0021,
    tokens: [2100, 60],
    texto: "Entendido, la dejo pendiente. Cuando el solicitante actualice la cotización, me dices y la retomo.",
  }
}

export function turnoAsesor(): Turno {
  return {
    ruta: {
      agente: "asesor",
      intencion: "consulta_proceso",
      caso: null,
      enrutador: HAIKU,
      modelo: HAIKU,
      motivo: "Pregunta sobre el proceso, sin caso",
    },
    herramientas: [],
    confirmacion: null,
    costoUsd: 0.0016,
    tokens: [3900, 210],
    texto:
      "Antes de crear una OC reviso diez controles. Cuatro bloquean: que el proveedor exista y esté activo, que quien aprueba sea aprobador del centro de costo, que el monto no supere su tope y que la subárea pertenezca al centro.\n\nOtros me hacen pedirte confirmación: si la cotización difiere más de 2 % de la solicitud, si falta el IVA, si la factura es anterior a la solicitud o si la aprobación llegó antes de la solicitud. Las condiciones de pago faltantes las completo desde el maestro y te aviso.",
  }
}

export function turnoFueraDeDemo(): Turno {
  return {
    ruta: {
      agente: "conversador",
      intencion: "charla",
      caso: null,
      enrutador: HAIKU,
      modelo: HAIKU,
      motivo: "Mensaje general",
    },
    herramientas: [],
    confirmacion: null,
    costoUsd: 0.0009,
    tokens: [1800, 90],
    texto:
      "Estás en la demostración: tengo grabadas **sol-001**, **sol-002** y **sol-004**. Pídeme cualquiera de ellas, por ejemplo: *procesa la solicitud sol-004*.",
  }
}
