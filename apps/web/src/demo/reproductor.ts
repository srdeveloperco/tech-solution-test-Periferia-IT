import type { EventoChat, PeticionChat } from "@oc/contracts"
import {
  pasosDeTurno,
  turnoAsesor,
  turnoConfirmar,
  turnoFueraDeDemo,
  turnoProcesar,
  turnoRechazar,
} from "./grabaciones"

type Transporte = (peticion: PeticionChat, alEvento: (e: EventoChat) => void, senal: AbortSignal) => Promise<void>

function esperar(ms: number, senal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (senal.aborted) return rechazar(new DOMException("Cancelado", "AbortError"))
    const t = window.setTimeout(resolver, ms)
    senal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t)
        rechazar(new DOMException("Cancelado", "AbortError"))
      },
      { once: true },
    )
  })
}

const CONFIRMA = /\b(confirmo|confirmado|s[ií]|dale|cr[eé]ala|procede)\b/i
const RECHAZA = /\b(ahora no|no la cre|pendiente|despu[eé]s)\b/i
const CASO = /sol-?0*(\d{1,3})/i

/** Reproduce turnos grabados con la misma interfaz que el transporte real. */
export function crearReproductor(casoInicial: string): Transporte {
  let casoActual: string | null = casoInicial
  const velocidad = Number(new URLSearchParams(window.location.search).get("velocidad") ?? "1") || 1

  return async (peticion, alEvento, senal) => {
    const sessionId = "ses_demo"
    const mencion = CASO.exec(peticion.message)
    const caso = peticion.confirmar?.caso ?? (mencion ? `sol-${mencion[1]?.padStart(3, "0")}` : casoActual)

    let turno = null
    if (peticion.confirmar || (CONFIRMA.test(peticion.message) && !mencion)) turno = turnoConfirmar(caso ?? "")
    else if (RECHAZA.test(peticion.message) && !mencion) turno = turnoRechazar(caso)
    else if (mencion && caso) turno = turnoProcesar(caso)
    else if (/control|valid|regla|proceso|c[oó]mo/i.test(peticion.message)) turno = turnoAsesor()
    turno ??= turnoFueraDeDemo()
    if (mencion && caso) casoActual = caso

    for (const paso of pasosDeTurno(turno, sessionId)) {
      await esperar(paso.ms / velocidad, senal)
      alEvento(paso.evento)
    }
  }
}
