import type { ToolCallVisible } from "@oc/contracts"
import { useId, useState } from "react"
import { duracion, infoHerramienta } from "../../util/formato"
import { estadoLlamada, IconoEstado, tonoDe } from "../Estado"
import { IconoChevron } from "../Iconos"

const LIMITE = 8000

function json(valor: unknown): string {
  if (valor === null || valor === undefined) return "Sin datos"
  const texto = JSON.stringify(valor, null, 2) ?? String(valor)
  return texto.length > LIMITE ? `${texto.slice(0, LIMITE)}\n… (${texto.length - LIMITE} caracteres más)` : texto
}

/** Una llamada a herramienta: fila compacta que se despliega para ver argumentos y resultado. */
export function FilaHerramienta({ llamada }: { llamada: ToolCallVisible }) {
  const [abierta, setAbierta] = useState(false)
  const idDetalle = useId()
  const info = infoHerramienta(llamada.nombre)
  const estado = estadoLlamada(llamada)

  return (
    <li className="herramienta" data-estado={estado} data-tono={tonoDe(estado)}>
      <button
        type="button"
        className="herramienta-fila"
        aria-expanded={abierta}
        aria-controls={idDetalle}
        onClick={() => setAbierta((a) => !a)}
      >
        <span className="herramienta-icono">
          <IconoEstado estado={estado} tam={14} />
        </span>
        <span className="herramienta-nombre">{info.etiqueta}</span>
        <span className="herramienta-resumen">{llamada.ok === null ? `${info.actividad}…` : llamada.resumen}</span>
        <span className="herramienta-ms num">{llamada.ms !== null ? duracion(llamada.ms) : ""}</span>
        <IconoChevron className="herramienta-chevron" tam={12} />
      </button>
      {abierta && (
        <div className="herramienta-detalle" id={idDetalle}>
          <p className="herramienta-tecnico">
            <span className="mono">{llamada.nombre}</span>
          </p>
          <p className="herramienta-rotulo">Argumentos</p>
          <pre className="codigo">{json(llamada.args)}</pre>
          <p className="herramienta-rotulo">Resultado</p>
          <pre className="codigo">{llamada.ok === null ? "En curso…" : json(llamada.resultado)}</pre>
        </div>
      )}
    </li>
  )
}
