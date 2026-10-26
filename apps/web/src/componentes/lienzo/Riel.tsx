import { type EstadoEtapa, ETAPAS, type EtapaId } from "../../estado/lienzo"
import { IconoEstado, tonoDe } from "../Estado"

const DESCRIPCION: Record<EstadoEtapa, string> = {
  pendiente: "pendiente",
  en_curso: "en curso",
  ok: "lista",
  atencion: "requiere atención",
  bloqueo: "bloqueada",
  error: "con error",
}

export function Riel({ etapas, fantasma = false }: { etapas: Record<EtapaId, EstadoEtapa>; fantasma?: boolean }) {
  return (
    <ol className="riel" data-fantasma={fantasma || undefined} aria-label="Etapas del proceso">
      {ETAPAS.map((etapa) => {
        const estado = etapas[etapa.id]
        return (
          <li key={etapa.id} className="riel-paso" data-estado={estado} data-tono={tonoDe(estado)}>
            <span className="riel-nodo">
              <IconoEstado estado={estado} tam={12} />
            </span>
            <span className="riel-etiqueta">{etapa.etiqueta}</span>
            <span className="solo-lector">{DESCRIPCION[estado]}</span>
          </li>
        )
      })}
    </ol>
  )
}
