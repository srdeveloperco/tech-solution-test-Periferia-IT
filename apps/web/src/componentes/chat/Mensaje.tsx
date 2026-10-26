import type { RutaTurno } from "@oc/contracts"
import { memo } from "react"
import type { MensajeAgente, MensajeUsuario } from "../../estado/chat"
import { infoHerramienta, nombreAgente, nombreModelo, usd } from "../../util/formato"
import { IconoAlerta, IconoCheck } from "../Iconos"
import { FilaHerramienta } from "./FilaHerramienta"
import { Markdown } from "./Markdown"

export const BurbujaUsuario = memo(function BurbujaUsuario({ mensaje }: { mensaje: MensajeUsuario }) {
  return (
    <div className="mensaje-usuario">
      <p>{mensaje.texto}</p>
    </div>
  )
})

function ChipRuta({ ruta }: { ruta: RutaTurno }) {
  const sinCosto = ruta.enrutador === "reglas"
  return (
    <p className="ruta" title={ruta.motivo}>
      <span className="ruta-agente">{nombreAgente(ruta.agente)}</span>
      <span className="ruta-sep" aria-hidden="true">
        ·
      </span>
      <span>{nombreModelo(ruta.modelo)}</span>
      <span className="ruta-sep" aria-hidden="true">
        ·
      </span>
      <span className="ruta-enrutador">
        {sinCosto ? "enrutado por reglas, sin costo" : `enrutó ${nombreModelo(ruta.enrutador)}`}
      </span>
    </p>
  )
}

function Pensando({ mensaje }: { mensaje: MensajeAgente }) {
  const enCurso = mensaje.toolCalls.find((t) => t.ok === null)
  const etiqueta = enCurso
    ? infoHerramienta(enCurso.nombre).actividad
    : mensaje.toolCalls.length > 0
      ? "Redactando la respuesta"
      : "Pensando"
  return (
    <p className="pensando" role="status">
      <span className="pensando-puntos" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {etiqueta}
    </p>
  )
}

type Props = { mensaje: MensajeAgente; onReintentar: (() => void) | null }

export const MensajeDelAgente = memo(function MensajeDelAgente({ mensaje, onReintentar }: Props) {
  const texto = mensaje.texto || mensaje.borrador
  const escribiendo = mensaje.enCurso && !mensaje.texto && mensaje.borrador.length > 0
  return (
    <article className="mensaje-agente" aria-busy={mensaje.enCurso}>
      {mensaje.ruta && <ChipRuta ruta={mensaje.ruta} />}
      {mensaje.toolCalls.length > 0 && (
        <ol className="herramientas" aria-label="Herramientas usadas">
          {mensaje.toolCalls.map((llamada) => (
            <FilaHerramienta key={llamada.id} llamada={llamada} />
          ))}
        </ol>
      )}
      {mensaje.enCurso && !texto && <Pensando mensaje={mensaje} />}
      {texto && (
        <div className={escribiendo ? "texto-agente escribiendo" : "texto-agente"}>
          <Markdown texto={texto} />
        </div>
      )}
      {mensaje.error && (
        <div className="error-turno" role="alert">
          <IconoAlerta tam={15} />
          <p>{mensaje.error}</p>
          {onReintentar && (
            <button type="button" className="boton boton-chico boton-secundario" onClick={onReintentar}>
              Reintentar
            </button>
          )}
        </div>
      )}
      {!mensaje.enCurso && (mensaje.costoUsd !== null || mensaje.verificacion) && (
        <p className="pie-mensaje">
          {mensaje.verificacion && (
            <span className="verificacion" data-ok={mensaje.verificacion.ok} title={mensaje.verificacion.detalle}>
              {mensaje.verificacion.ok ? <IconoCheck tam={12} /> : <IconoAlerta tam={12} />}
              {mensaje.verificacion.ok ? "Cifras verificadas" : "Revisa las cifras"}
            </span>
          )}
          {mensaje.costoUsd !== null && <span className="num">{usd(mensaje.costoUsd)}</span>}
        </p>
      )}
    </article>
  )
})
