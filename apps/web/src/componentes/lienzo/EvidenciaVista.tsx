import { useState } from "react"
import type { EvidenciaVista as Evidencia } from "../../api/guards"
import { descargar } from "../../api/http"
import { IconoDescarga, IconoDocumento } from "../Iconos"

export function EvidenciaVista({ caso, evidencia }: { caso: string; evidencia: Evidencia }) {
  const [error, setError] = useState<string | null>(null)
  const bajar = (formato: "pdf" | "txt") => {
    setError(null)
    descargar(`/api/evidencia/${encodeURIComponent(caso)}?formato=${formato}`, `${caso}-aprobacion.${formato}`).catch(
      (e: unknown) => setError(e instanceof Error ? e.message : "No se pudo descargar"),
    )
  }
  return (
    <div className="evidencia">
      <div className="evidencia-archivos">
        {evidencia.ruta_pdf && (
          <button type="button" className="archivo" onClick={() => bajar("pdf")}>
            <IconoDocumento tam={18} />
            <span>
              <span className="archivo-nombre">aprobacion.pdf</span>
              <span className="archivo-meta">Correo de aprobación, listo para adjuntar</span>
            </span>
            <IconoDescarga tam={15} />
          </button>
        )}
        <button type="button" className="archivo" onClick={() => bajar("txt")}>
          <IconoDocumento tam={18} />
          <span>
            <span className="archivo-nombre">aprobacion.txt</span>
            <span className="archivo-meta">Encabezados, cuerpo y huella</span>
          </span>
          <IconoDescarga tam={15} />
        </button>
      </div>
      <p className="evidencia-huella">
        <span className="evidencia-rotulo">SHA-256</span>
        <span className="mono">{evidencia.sha256}</span>
      </p>
      {error && (
        <p className="error-linea" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
