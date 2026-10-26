import type { PresupuestoDto } from "@oc/contracts"
import type { CSSProperties } from "react"
import { usd, usdCorto } from "../util/formato"

function tono(p: PresupuestoDto): "rojo" | "ambar" | undefined {
  if (p.bloqueado) return "rojo"
  return p.gastadoUsd / p.limiteUsd >= 0.8 ? "ambar" : undefined
}

function fraccion(p: PresupuestoDto): number {
  return p.limiteUsd > 0 ? Math.min(1, p.gastadoUsd / p.limiteUsd) : 0
}

/** Medidor discreto para la cabecera del chat. */
export function MedidorPresupuesto({ presupuesto }: { presupuesto: PresupuestoDto }) {
  const estilo = { "--fraccion": fraccion(presupuesto) } as CSSProperties
  const titulo = presupuesto.bloqueado
    ? `Se alcanzó el límite de ${usd(presupuesto.limiteUsd)} en IA. El agente queda en pausa.`
    : `Gasto en IA: ${usd(presupuesto.gastadoUsd)} de ${usd(presupuesto.limiteUsd)}. Restan ${usd(presupuesto.restanteUsd)}.`
  return (
    <p className="medidor" data-tono={tono(presupuesto)} title={titulo}>
      <span className="medidor-barra" style={estilo} aria-hidden="true" />
      <span className="num">{presupuesto.bloqueado ? "Límite alcanzado" : usdCorto(presupuesto.gastadoUsd)}</span>
      <span className="solo-lector">{titulo}</span>
    </p>
  )
}

/** Versión amplia para el observatorio. */
export function PresupuestoAmplio({ presupuesto }: { presupuesto: PresupuestoDto }) {
  const estilo = { "--fraccion": fraccion(presupuesto) } as CSSProperties
  return (
    <div className="presupuesto-amplio" data-tono={tono(presupuesto)}>
      <div className="presupuesto-cifras">
        <p>
          <span className="presupuesto-gastado num">{usd(presupuesto.gastadoUsd)}</span>
          <span className="presupuesto-de">gastados de {usd(presupuesto.limiteUsd)}</span>
        </p>
        <p className="presupuesto-restante">
          {presupuesto.bloqueado ? (
            "Límite alcanzado: el agente no hace más llamadas al modelo."
          ) : (
            <>
              Restan <span className="num">{usd(presupuesto.restanteUsd)}</span>
            </>
          )}
        </p>
      </div>
      <span className="presupuesto-barra" style={estilo} aria-hidden="true" />
    </div>
  )
}
