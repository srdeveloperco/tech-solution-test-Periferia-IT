import type { ConversacionResumen } from "@oc/contracts"
import { useEffect, useRef, useState } from "react"
import { apiJson } from "../../api/http"
import { fechaRelativa, usd } from "../../util/formato"
import { IconoGiro } from "../Iconos"

type Props = {
  actual: string | null
  onElegir: (sessionId: string) => Promise<void>
  onCerrar: () => void
}

/** Conversaciones recientes: panel plegable bajo la cabecera del chat, sin modal. */
export function Historial({ actual, onElegir, onCerrar }: Props) {
  const [lista, setLista] = useState<ConversacionResumen[] | null>(null)
  const [cargando, setCargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    apiJson<ConversacionResumen[]>("/api/sessions")
      .then(setLista)
      .catch((e: unknown) => {
        setLista([])
        setError(e instanceof Error ? e.message : "No pude cargar el historial.")
      })
  }, [])

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar()
    }
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [onCerrar])

  const elegir = async (id: string) => {
    setCargando(id)
    setError(null)
    try {
      await onElegir(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude abrir esa conversación.")
    } finally {
      setCargando(null)
    }
  }

  return (
    <section className="historial-panel" ref={panel} tabIndex={-1} aria-labelledby="historial-panel-titulo">
      <p className="historial-panel-titulo" id="historial-panel-titulo">
        Recientes
      </p>
      {error && (
        <p className="error-linea" role="alert">
          {error}
        </p>
      )}
      {lista === null ? (
        <div className="esqueleto" aria-hidden="true">
          <span style={{ width: "80%" }} />
          <span style={{ width: "64%" }} />
          <span style={{ width: "72%" }} />
        </div>
      ) : lista.length === 0 ? (
        !error && <p className="seccion-nota">Aún no tienes conversaciones guardadas.</p>
      ) : (
        <ul className="historial-lista">
          {lista.map((c) => (
            <li key={c.sessionId}>
              <button
                type="button"
                className="historial-fila"
                aria-current={c.sessionId === actual || undefined}
                disabled={cargando !== null}
                onClick={() => void elegir(c.sessionId)}
              >
                <span className="historial-titulo">{c.titulo || "Conversación sin título"}</span>
                <span className="historial-meta num">
                  {fechaRelativa(c.actualizada)} · {c.mensajes} mensajes
                  {c.casos.length > 0 && <span className="mono"> · {c.casos.join(", ")}</span>}
                </span>
                <span className="historial-costo num">
                  {cargando === c.sessionId ? <IconoGiro tam={12} /> : usd(c.costoUsd)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
