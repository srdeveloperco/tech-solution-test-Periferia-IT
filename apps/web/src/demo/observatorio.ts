import type {
  InteraccionDetalle,
  InteraccionResumen,
  ObservatorioResumen,
  PresupuestoDto,
  RutaTurno,
} from "@oc/contracts"

const SONNET = "claude-sonnet-5-5"
const HAIKU = "claude-haiku-5-5"

const PROMPT_ROUTER = `# Router de intención
Clasifica el último mensaje de la analista en una intención y, si aplica, el caso.
Responde solo con la herramienta \`enrutar\`.

Intenciones: procesar_caso, confirmar, rechazar, consulta_proceso, estado, charla, fuera_de_alcance.
Si hay una confirmación pendiente para {{caso_pendiente}}, un "sí" o "dale" es confirmar.`

const PROMPT_OPERADOR = `# Operador de órdenes de compra
Eres el asistente de la analista de compras. Procesas solicitudes con las herramientas oc_*.

## Reglas
- No afirmes ningún valor que no venga de una herramienta.
- Orden: leer paquete, validar, construir payload, generar evidencia, crear.
- Si oc_crear responde "pendiente", termina el turno con una pregunta cerrada.

## Voz
Habla como una colega experta: directa, cálida, sin relleno. Primero el resultado, luego el detalle.`

export const INTERACCIONES_DEMO: InteraccionResumen[] = [
  {
    id: "int_7",
    sessionId: "ses_a1",
    usuario: "camila.rojas@periferia-ficticia.com",
    ts: "2026-10-26T15:42:10-05:00",
    mensajeUsuario: "Confirmo",
    agente: "operador",
    intencion: "confirmar",
    caso: "sol-004",
    llamadasLlm: 2,
    herramientas: 1,
    tokensEntrada: 9310,
    tokensSalida: 240,
    costoUsd: 0.0118,
    ms: 3120,
    resultado: "ok",
  },
  {
    id: "int_6",
    sessionId: "ses_a1",
    usuario: "camila.rojas@periferia-ficticia.com",
    ts: "2026-10-26T15:41:02-05:00",
    mensajeUsuario: "Procesa la solicitud sol-004. Muéstrame la OC y no la crees hasta que lo confirme.",
    agente: "operador",
    intencion: "procesar_caso",
    caso: "sol-004",
    llamadasLlm: 6,
    herramientas: 5,
    tokensEntrada: 21840,
    tokensSalida: 1420,
    costoUsd: 0.0412,
    ms: 11840,
    resultado: "confirmacion",
  },
  {
    id: "int_5",
    sessionId: "ses_a1",
    usuario: "camila.rojas@periferia-ficticia.com",
    ts: "2026-10-26T15:38:47-05:00",
    mensajeUsuario: "¿Qué controles revisas antes de crear una OC?",
    agente: "asesor",
    intencion: "consulta_proceso",
    caso: null,
    llamadasLlm: 2,
    herramientas: 0,
    tokensEntrada: 3900,
    tokensSalida: 210,
    costoUsd: 0.0016,
    ms: 2410,
    resultado: "ok",
  },
  {
    id: "int_4",
    sessionId: "ses_a1",
    usuario: "camila.rojas@periferia-ficticia.com",
    ts: "2026-10-26T15:36:12-05:00",
    mensajeUsuario: "Procesa sol-002",
    agente: "operador",
    intencion: "procesar_caso",
    caso: "sol-002",
    llamadasLlm: 5,
    herramientas: 4,
    tokensEntrada: 14210,
    tokensSalida: 720,
    costoUsd: 0.0244,
    ms: 8730,
    resultado: "ok",
  },
  {
    id: "int_3",
    sessionId: "ses_a1",
    usuario: "camila.rojas@periferia-ficticia.com",
    ts: "2026-10-26T15:33:55-05:00",
    mensajeUsuario: "Procesa la solicitud sol-001",
    agente: "operador",
    intencion: "procesar_caso",
    caso: "sol-001",
    llamadasLlm: 6,
    herramientas: 5,
    tokensEntrada: 18420,
    tokensSalida: 960,
    costoUsd: 0.0318,
    ms: 10260,
    resultado: "ok",
  },
  {
    id: "int_2",
    sessionId: "ses_9f",
    usuario: "evaluador@periferia-ficticia.com",
    ts: "2026-10-26T14:12:31-05:00",
    mensajeUsuario: "hola, ¿qué puedes hacer?",
    agente: "conversador",
    intencion: "charla",
    caso: null,
    llamadasLlm: 2,
    herramientas: 0,
    tokensEntrada: 1800,
    tokensSalida: 90,
    costoUsd: 0.0009,
    ms: 1380,
    resultado: "ok",
  },
  {
    id: "int_1",
    sessionId: "ses_9f",
    usuario: "evaluador@periferia-ficticia.com",
    ts: "2026-10-26T14:10:04-05:00",
    mensajeUsuario: "procesa sol-099",
    agente: "operador",
    intencion: "procesar_caso",
    caso: "sol-099",
    llamadasLlm: 2,
    herramientas: 1,
    tokensEntrada: 5200,
    tokensSalida: 130,
    costoUsd: 0.0071,
    ms: 2950,
    resultado: "error",
  },
]

export function resumenDemo(presupuesto: PresupuestoDto): ObservatorioResumen {
  const lista = INTERACCIONES_DEMO
  const costo = lista.reduce((s, i) => s + i.costoUsd, 0)
  return {
    presupuesto,
    totales: {
      interacciones: lista.length,
      llamadasLlm: lista.reduce((s, i) => s + i.llamadasLlm, 0),
      tokensEntrada: lista.reduce((s, i) => s + i.tokensEntrada, 0),
      tokensSalida: lista.reduce((s, i) => s + i.tokensSalida, 0),
      costoUsd: costo,
      costoPromedioInteraccionUsd: costo / lista.length,
      latenciaP50Ms: 3120,
      latenciaP95Ms: 11840,
    },
    porModelo: [
      { modelo: SONNET, llamadas: 19, tokensEntrada: 63980, tokensSalida: 3340, costoUsd: 0.1133 },
      { modelo: HAIKU, llamadas: 6, tokensEntrada: 10700, tokensSalida: 430, costoUsd: 0.0055 },
    ],
    porAgente: [
      { agente: "operador", llamadas: 19, costoUsd: 0.1133 },
      { agente: "router", llamadas: 3, costoUsd: 0.0012 },
      { agente: "asesor", llamadas: 2, costoUsd: 0.0016 },
      { agente: "conversador", llamadas: 1, costoUsd: 0.0009 },
    ],
    prompts: [
      { hash: "a41f09c2", agente: "operador", usos: 19, primeraVez: "2026-10-26T14:10:04-05:00" },
      { hash: "7be2d013", agente: "router", usos: 3, primeraVez: "2026-10-26T14:10:04-05:00" },
      { hash: "c90e51aa", agente: "asesor", usos: 2, primeraVez: "2026-10-26T15:38:47-05:00" },
      { hash: "52d8f7e4", agente: "conversador", usos: 1, primeraVez: "2026-10-26T14:12:31-05:00" },
    ],
  }
}

export function detalleDemo(id: string): InteraccionDetalle | null {
  const base = INTERACCIONES_DEMO.find((i) => i.id === id)
  if (!base) return null
  const t0 = new Date(base.ts).getTime()
  const ts = (ms: number) => new Date(t0 + ms).toISOString()
  const usaRouter = base.intencion !== "procesar_caso" && base.intencion !== "confirmar"
  const llamadas: InteraccionDetalle["llamadas"] = []
  if (usaRouter) {
    llamadas.push({
      id: `${id}_llm_r`,
      interaccionId: id,
      ts: ts(20),
      agente: "router",
      proveedor: "anthropic",
      modelo: HAIKU,
      sistema: PROMPT_ROUTER,
      promptHash: "7be2d013",
      mensajes: [{ role: "user", content: base.mensajeUsuario }],
      herramientas: ["enrutar"],
      variables: {
        caso_pendiente: null,
        casos_disponibles: ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"],
      },
      respuesta: {
        type: "tool_use",
        name: "enrutar",
        input: { intencion: base.intencion, caso: base.caso, confianza: 0.94 },
      },
      stopReason: "tool_use",
      tokensEntrada: 612,
      tokensSalida: 41,
      tokensCacheLectura: 0,
      tokensCacheEscritura: 0,
      costoUsd: 0.0004,
      ms: 410,
      error: null,
    })
  }
  const iteraciones = Math.max(1, base.llamadasLlm - (usaRouter ? 1 : 0))
  const herramientasOperador = [
    "oc_leer_paquete",
    "oc_validar",
    "oc_construir_payload",
    "oc_generar_evidencia",
    "oc_crear",
  ]
  for (let i = 0; i < iteraciones; i++) {
    const usaHerramienta = i < base.herramientas
    const nombre = base.intencion === "confirmar" ? "oc_crear" : herramientasOperador[i]
    llamadas.push({
      id: `${id}_llm_${i}`,
      interaccionId: id,
      ts: ts(500 + i * 1700),
      agente: base.agente ?? "operador",
      proveedor: "anthropic",
      modelo: base.agente === "operador" ? SONNET : HAIKU,
      sistema: PROMPT_OPERADOR,
      promptHash: base.agente === "operador" ? "a41f09c2" : "c90e51aa",
      mensajes: [
        { role: "user", content: base.mensajeUsuario },
        ...(i > 0
          ? [
              { role: "assistant", content: "[tool_use …]" },
              { role: "user", content: "[tool_result …]" },
            ]
          : []),
      ],
      herramientas: base.agente === "operador" ? herramientasOperador : [],
      variables: { caso: base.caso, iteracion: i + 1, pendiente: base.intencion === "confirmar" ? base.caso : null },
      respuesta:
        usaHerramienta && nombre
          ? { type: "tool_use", name: nombre, input: { caso: base.caso } }
          : { type: "text", text: "Revisé la solicitud. Pasa 9 de 10 controles…" },
      stopReason: usaHerramienta ? "tool_use" : "end_turn",
      tokensEntrada: Math.round(base.tokensEntrada / iteraciones),
      tokensSalida: Math.round(base.tokensSalida / iteraciones),
      tokensCacheLectura: i === 0 ? 0 : 2840,
      tokensCacheEscritura: i === 0 ? 2840 : 0,
      costoUsd: base.costoUsd / iteraciones,
      ms: Math.round(base.ms / (iteraciones + 1)),
      error: base.resultado === "error" && i === iteraciones - 1 ? "Caso inexistente: sol-099" : null,
    })
  }
  const herramientasEjecutadas: InteraccionDetalle["herramientasEjecutadas"] = Array.from(
    { length: base.herramientas },
    (_, i) => {
      const nombre = base.intencion === "confirmar" ? "oc_crear" : (herramientasOperador[i] ?? "oc_crear")
      return {
        id: `${id}_tool_${i}`,
        interaccionId: id,
        ts: ts(900 + i * 1700),
        agente: "operador",
        nombre,
        args: {
          caso: base.caso,
          ...(nombre === "oc_crear" && base.intencion === "confirmar" ? { confirmado: true } : {}),
        },
        resultado:
          base.resultado === "error"
            ? { ok: false, error: `No existe la carpeta del caso ${base.caso}` }
            : { ok: true, data: { resumen: `${nombre} ejecutada` } },
        ok: base.resultado !== "error",
        ms: 180 + i * 90,
      }
    },
  )
  return {
    ...base,
    respuesta:
      base.resultado === "error"
        ? "No encuentro el caso sol-099. Los disponibles son sol-001 a sol-006."
        : "Revisé la solicitud y te dejé el resultado en el lienzo.",
    ruta: base.agente
      ? {
          agente: base.agente === "router" ? "operador" : (base.agente as "operador" | "asesor" | "conversador"),
          intencion: (base.intencion ?? "charla") as RutaTurno["intencion"],
          caso: base.caso,
          enrutador: usaRouter ? HAIKU : "reglas",
          modelo: base.agente === "operador" ? SONNET : HAIKU,
          motivo: usaRouter ? "Clasificado por el router" : `El mensaje nombra el caso ${base.caso}`,
        }
      : null,
    llamadas,
    herramientasEjecutadas,
  }
}
