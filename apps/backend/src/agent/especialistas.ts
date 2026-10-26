import type { MensajeLlm } from "../llm/adapter"
import { textoDe } from "../llm/adapter"
import { leerControlCsv, listarCasos } from "../tools"
import { llamarModelo } from "./modelo"
import type { DepsEspecialista, ResultadoEspecialista } from "./operador"
import type { Sesion } from "./sesiones"
import { detalleVerificacion, verificarCifras } from "./verificador"

/** Últimos mensajes visibles como texto breve: contexto conversacional sin reenviar historiales completos. */
function conversacionReciente(sesion: Sesion, n = 6): string {
  return sesion.visibles
    .slice(-n - 1, -1)
    .map((m) => `${m.rol === "usuario" ? "Usuario" : "Agente"}: ${m.texto.slice(0, 300)}`)
    .join("\n")
}

async function datosDeConsulta(deps: DepsEspecialista): Promise<string> {
  const casos = await listarCasos(deps.directory)
  const control = (await leerControlCsv(deps.directory)).split("\n").filter(Boolean)
  const memoria = Object.entries(deps.sesion.casos).map(([caso, m]) => ({
    caso,
    resultado: m.resultado,
    numero_oc: m.numero_oc,
    retroactiva: m.retroactiva,
    bloqueos: m.bloqueos,
  }))
  return JSON.stringify({
    casos,
    control_csv: [control[0], ...control.slice(1).slice(-40)].filter(Boolean),
    memoria_sesion: memoria,
  })
}

/** Asesor: preguntas de proceso y estado. Solo lectura, sin herramientas de escritura. */
export async function ejecutarAsesor(deps: DepsEspecialista, pregunta: string): Promise<ResultadoEspecialista> {
  const datos = await datosDeConsulta(deps)
  const reciente = conversacionReciente(deps.sesion)
  const mensajes: MensajeLlm[] = [
    {
      rol: "usuario",
      contenido: [
        { tipo: "texto", texto: `<datos>${datos}</datos>` },
        { tipo: "texto", texto: `<conversacion_reciente>\n${reciente}\n</conversacion_reciente>` },
        { tipo: "texto", texto: pregunta },
      ],
    },
  ]
  const fuentes = [datos, reciente, pregunta, deps.sistema.at(-1) ?? ""]
  const variables = { agente: "asesor", casos_en_sesion: Object.keys(deps.sesion.casos) }
  const llamar = () =>
    llamarModelo(
      deps.llamada,
      {
        agente: "asesor",
        modelo: deps.config.modelos.asesor,
        sistema: deps.sistema,
        mensajes,
        maxTokens: deps.config.maxTokens.asesor,
        esfuerzo: "low",
        onTexto: (delta) => deps.emitir({ tipo: "texto_delta", texto: delta }),
      },
      variables,
    )
  const primera = await llamar()
  let texto = textoDe(primera.contenido) || "No tengo una respuesta para eso con los datos disponibles."
  let v = verificarCifras(texto, fuentes)
  if (!v.ok) {
    mensajes.push({ rol: "asistente", contenido: primera.contenido })
    mensajes.push({
      rol: "usuario",
      contenido: [
        {
          tipo: "texto",
          texto: `<verificador>Citaste cifras sin respaldo en los datos: ${v.inventadas.join(", ")}. Reescribe usando solo cifras de <datos> o de los maestros.</verificador>`,
        },
      ],
    })
    texto = textoDe((await llamar()).contenido) || texto
    v = verificarCifras(texto, fuentes)
  }
  deps.emitir({ tipo: "verificacion", ok: v.ok, detalle: detalleVerificacion(v) })
  return { texto, toolCalls: [], confirmacion: null }
}

/** Conversador: charla breve y fuera de alcance; reconduce a lo que el agente sabe hacer. */
export async function ejecutarConversador(deps: DepsEspecialista, mensaje: string): Promise<ResultadoEspecialista> {
  const casos = (await listarCasos(deps.directory)).map((c) => c.caso)
  const r = await llamarModelo(
    deps.llamada,
    {
      agente: "conversador",
      modelo: deps.config.modelos.conversador,
      sistema: deps.sistema,
      mensajes: [
        {
          rol: "usuario",
          contenido: [
            { tipo: "texto", texto: `<casos_disponibles>${casos.join(", ")}</casos_disponibles>` },
            {
              tipo: "texto",
              texto: `<conversacion_reciente>\n${conversacionReciente(deps.sesion)}\n</conversacion_reciente>`,
            },
            { tipo: "texto", texto: mensaje },
          ],
        },
      ],
      maxTokens: deps.config.maxTokens.conversador,
      esfuerzo: "low",
      onTexto: (delta) => deps.emitir({ tipo: "texto_delta", texto: delta }),
    },
    { agente: "conversador" },
  )
  return {
    texto: textoDe(r.contenido) || "Aquí estoy. Dime qué solicitud quieres que procese.",
    toolCalls: [],
    confirmacion: null,
  }
}
