import type { Hallazgo } from "@oc/contracts"
import type { Confirmacion } from "../../estado/chat"
import { dinero } from "../../util/formato"
import { IconoPausa } from "../Iconos"

function valor(v: string | number): string {
  return typeof v === "number" ? dinero(v) : v
}

function Comparacion({ c }: { c: NonNullable<Hallazgo["comparacion"]> }) {
  return (
    <div className="comparacion">
      <div>
        <p className="comparacion-etiqueta">{c.etiqueta_a}</p>
        <p className="comparacion-valor num">{valor(c.valor_a)}</p>
      </div>
      <div>
        <p className="comparacion-etiqueta">{c.etiqueta_b}</p>
        <p className="comparacion-valor num">{valor(c.valor_b)}</p>
      </div>
      {c.diferencia && <p className="comparacion-diferencia num">{c.diferencia}</p>}
    </div>
  )
}

type Props = {
  confirmacion: Confirmacion
  ocupado: boolean
  onConfirmar: () => void
  onPosponer: () => void
}

/** Hoja de decisión fija sobre el campo de texto (CA3): sin modal, con los valores lado a lado. */
export function HojaConfirmacion({ confirmacion, ocupado, onConfirmar, onPosponer }: Props) {
  return (
    <section className="hoja-decision" aria-labelledby="hoja-decision-titulo">
      <header className="hoja-decision-cabecera">
        <span className="hoja-decision-icono">
          <IconoPausa tam={16} />
        </span>
        <div>
          <h2 id="hoja-decision-titulo">Necesito tu confirmación</h2>
          <p>
            Antes de crear la OC de <span className="mono">{confirmacion.caso}</span>
          </p>
        </div>
      </header>
      <ul className="hoja-decision-lista">
        {confirmacion.confirmaciones.map((h) => (
          <li key={h.codigo}>
            <p className="hallazgo-titulo">
              <span className="mono hallazgo-codigo">{h.codigo}</span>
              {h.titulo}
            </p>
            <p className="hallazgo-detalle">{h.detalle}</p>
            {h.comparacion && <Comparacion c={h.comparacion} />}
          </li>
        ))}
      </ul>
      <div className="hoja-decision-acciones">
        <button type="button" className="boton boton-primario" disabled={ocupado} onClick={onConfirmar}>
          Confirmar y crear OC
        </button>
        <button type="button" className="boton boton-fantasma" disabled={ocupado} onClick={onPosponer}>
          Ahora no
        </button>
      </div>
    </section>
  )
}
