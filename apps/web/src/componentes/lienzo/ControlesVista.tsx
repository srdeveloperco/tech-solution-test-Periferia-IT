import type { Validacion } from "@oc/contracts"
import type { CSSProperties } from "react"
import { type EstadoVisual, IconoEstado, tonoDe } from "../Estado"

const NOMBRES: Record<string, string> = {
  RC1: "Proveedor activo en el maestro",
  RC2: "Aprobación válida para el centro",
  RC3: "Monto dentro del tope del aprobador",
  RC4: "Subárea del centro de costo",
  RC5: "Cotización cuadra con la solicitud",
  RC6: "Indicador de IVA",
  RC7: "Condiciones de pago",
  RC8: "Factura anterior a la solicitud",
  RC9: "Aprobación posterior a la solicitud",
  RC10: "Cantidad por precio igual al total",
}

type EstadoControl = Validacion["controles"][number]["estado"]

const VISUAL: Record<EstadoControl, { estado: EstadoVisual; texto: string }> = {
  ok: { estado: "ok", texto: "Cumple" },
  bloqueo: { estado: "bloqueo", texto: "Bloquea" },
  confirmacion: { estado: "atencion", texto: "Por confirmar" },
  derivado: { estado: "derivado", texto: "Derivado" },
  no_aplica: { estado: "no_aplica", texto: "No aplica" },
}

const CAMPOS: Record<string, string> = {
  condiciones_pago: "Condiciones de pago",
  indicador_iva: "Indicador de IVA",
  unidad: "Unidad",
  descripcion_corta: "Texto breve (40 car.)",
}

function resumen(controles: Validacion["controles"]): string {
  const cuenta = (e: EstadoControl) => controles.filter((c) => c.estado === e).length
  const partes = [
    [cuenta("ok"), "cumplen"],
    [cuenta("confirmacion"), "por confirmar"],
    [cuenta("bloqueo"), cuenta("bloqueo") === 1 ? "bloquea" : "bloquean"],
    [cuenta("derivado"), "derivados"],
    [cuenta("no_aplica"), "no aplican"],
  ] as const
  return partes
    .filter(([n]) => n > 0)
    .map(([n, t]) => `${n} ${t}`)
    .join(" · ")
}

export function ControlesVista({ validacion }: { validacion: Validacion }) {
  const derivados = Object.entries(validacion.derivados)
  return (
    <div className="controles">
      <p className="seccion-nota num">{resumen(validacion.controles)}</p>
      <ol className="controles-lista">
        {validacion.controles.map((c, i) => {
          const visual = VISUAL[c.estado]
          return (
            <li key={c.codigo} className="control" data-estado={c.estado} style={{ "--i": i } as CSSProperties}>
              <span className="control-codigo mono">{c.codigo}</span>
              <div className="control-texto">
                <p className="control-nombre">{NOMBRES[c.codigo] ?? c.codigo}</p>
                {c.detalle && <p className="control-detalle">{c.detalle}</p>}
              </div>
              <span className="etiqueta control-estado" data-tono={tonoDe(visual.estado)}>
                <IconoEstado estado={visual.estado} tam={12} />
                {visual.texto}
              </span>
            </li>
          )
        })}
      </ol>
      {derivados.length > 0 && (
        <div className="derivados">
          <p className="derivados-titulo">Completado por el agente</p>
          <ul>
            {derivados.map(([campo, d]) => (
              <li key={campo}>
                <span className="derivado-campo">{CAMPOS[campo] ?? campo}</span>
                <span className="derivado-valor">{d.valor}</span>
                <span className="derivado-motivo">{d.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
