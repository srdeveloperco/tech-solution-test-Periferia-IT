import type { ResultadoCrearVista } from "../../api/guards"
import { fecha } from "../../util/formato"
import { IconoBloqueo, IconoCheck, IconoPausa } from "../Iconos"

/** El resultado del caso, primero: creada, en espera de confirmación o bloqueada. */
export function Sello({ resultado, retroactiva }: { resultado: ResultadoCrearVista; retroactiva: boolean }) {
  if (resultado.tipo === "creada" || resultado.tipo === "idempotente") {
    return (
      <section className="sello" data-tono="verde" aria-live="polite">
        <span className="sello-icono">
          <IconoCheck tam={20} strokeWidth={2} />
        </span>
        <div className="sello-texto">
          <p className="sello-rotulo">{resultado.tipo === "creada" ? "Orden creada en SAP" : "Ya existía en SAP"}</p>
          <p className="sello-numero num">OC {resultado.numero_oc}</p>
          <p className="sello-detalle">
            {resultado.tipo === "idempotente"
              ? "La solicitud ya tenía orden; no se creó otra."
              : `Registrada el ${fecha(resultado.fecha)}.`}
          </p>
        </div>
        {(retroactiva || resultado.retroactiva) && (
          <span className="etiqueta" data-tono="ambar">
            Retroactiva
          </span>
        )}
      </section>
    )
  }
  if (resultado.tipo === "pendiente") {
    return (
      <section className="sello" data-tono="ambar" aria-live="polite">
        <span className="sello-icono">
          <IconoPausa tam={20} strokeWidth={1.8} />
        </span>
        <div className="sello-texto">
          <p className="sello-rotulo">Esperando tu confirmación</p>
          <p className="sello-titulo">
            {resultado.confirmaciones.length === 1
              ? (resultado.confirmaciones[0]?.titulo ?? "Hay una excepción")
              : `${resultado.confirmaciones.length} excepciones por revisar`}
          </p>
          <p className="sello-detalle">Confirma en la conversación para crear la orden.</p>
        </div>
        {retroactiva && (
          <span className="etiqueta" data-tono="ambar">
            Retroactiva
          </span>
        )}
      </section>
    )
  }
  const bloqueo = resultado.tipo === "bloqueada" ? resultado.bloqueos[0] : undefined
  return (
    <section className="sello" data-tono="rojo" aria-live="polite">
      <span className="sello-icono">
        <IconoBloqueo tam={20} strokeWidth={1.8} />
      </span>
      <div className="sello-texto">
        <p className="sello-rotulo">{resultado.tipo === "bloqueada" ? "Bloqueada, no se creó" : "No se pudo crear"}</p>
        <p className="sello-titulo">{bloqueo?.titulo ?? resultado.error}</p>
        {bloqueo && <p className="sello-detalle">{bloqueo.accion_sugerida}</p>}
      </div>
    </section>
  )
}
