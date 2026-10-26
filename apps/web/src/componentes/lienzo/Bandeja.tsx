import type { CasoResumen } from "@oc/contracts"
import { dinero } from "../../util/formato"
import { IconoChevron } from "../Iconos"

const ESTADOS: Record<string, { texto: string; tono: "verde" | "ambar" | "rojo" }> = {
  creada: { texto: "Creada", tono: "verde" },
  idempotente: { texto: "Creada", tono: "verde" },
  pendiente: { texto: "Por confirmar", tono: "ambar" },
  bloqueada: { texto: "Bloqueada", tono: "rojo" },
}

type Props = { casos: CasoResumen[] | null; ocupado: boolean; onProcesar: (caso: string) => void }

export function Bandeja({ casos, ocupado, onProcesar }: Props) {
  if (casos === null) {
    return (
      <ul className="bandeja" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bandeja-esqueleto" />
        ))}
      </ul>
    )
  }
  if (casos.length === 0) return <p className="seccion-nota">No hay solicitudes en la bandeja.</p>
  return (
    <ul className="bandeja">
      {casos.map((c) => {
        const estado = c.estado ? ESTADOS[c.estado] : undefined
        return (
          <li key={c.caso}>
            <button type="button" className="bandeja-fila" disabled={ocupado} onClick={() => onProcesar(c.caso)}>
              <span className="bandeja-caso mono">{c.caso}</span>
              <span className="bandeja-texto">
                <span className="bandeja-descripcion">{c.descripcion ?? c.solicitud_id ?? "Sin descripción"}</span>
                <span className="bandeja-proveedor">{c.proveedor ?? "Proveedor no informado"}</span>
              </span>
              <span className="bandeja-valor num">
                {c.valor_total !== null ? dinero(c.valor_total, c.moneda ?? "COP") : ""}
              </span>
              <span className="bandeja-estado">
                {estado ? (
                  <span className="etiqueta" data-tono={estado.tono}>
                    {c.numero_oc && estado.tono === "verde" ? `OC ${c.numero_oc}` : estado.texto}
                  </span>
                ) : (
                  <span className="bandeja-nuevo">Sin procesar</span>
                )}
              </span>
              <IconoChevron tam={14} className="bandeja-chevron" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
