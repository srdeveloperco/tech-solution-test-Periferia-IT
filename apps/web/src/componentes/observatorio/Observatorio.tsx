import type { InteraccionDetalle, InteraccionResumen, ObservatorioResumen } from "@oc/contracts"
import { type CSSProperties, useCallback, useEffect, useState } from "react"
import { apiJson, ErrorApi } from "../../api/http"
import { duracion, hora, nombreAgente, nombreIntencion, nombreModelo, numero, tokens, usd } from "../../util/formato"
import { IconoAtras, IconoEscudo, IconoGiro } from "../Iconos"
import { PresupuestoAmplio } from "../Presupuesto"
import { Detalle } from "./Detalle"

const RESULTADOS: Record<InteraccionResumen["resultado"], { texto: string; tono?: "verde" | "ambar" | "rojo" }> = {
  ok: { texto: "Respondida", tono: "verde" },
  confirmacion: { texto: "Pidió confirmación", tono: "ambar" },
  error: { texto: "Error", tono: "rojo" },
  bloqueado_presupuesto: { texto: "Sin presupuesto", tono: "rojo" },
}

function Volver() {
  return (
    <a className="boton boton-fantasma boton-chico" href="#/">
      <IconoAtras tam={14} /> Conversación
    </a>
  )
}

function SinAcceso({ mensaje }: { mensaje: string }) {
  return (
    <div className="observatorio">
      <header className="obs-cabecera">
        <Volver />
      </header>
      <div className="obs-sin-acceso">
        <IconoEscudo tam={22} />
        <h1>No tienes acceso al observatorio</h1>
        <p>{mensaje}</p>
      </div>
    </div>
  )
}

function Totales({ r }: { r: ObservatorioResumen }) {
  const t = r.totales
  const filas: Array<[string, string]> = [
    ["Interacciones", numero(t.interacciones)],
    ["Llamadas al modelo", numero(t.llamadasLlm)],
    ["Tokens de entrada", tokens(t.tokensEntrada)],
    ["Tokens de salida", tokens(t.tokensSalida)],
    ["Costo total", usd(t.costoUsd)],
    ["Costo por interacción", usd(t.costoPromedioInteraccionUsd)],
    ["Latencia p50", duracion(t.latenciaP50Ms)],
    ["Latencia p95", duracion(t.latenciaP95Ms)],
  ]
  return (
    <dl className="obs-totales">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta}>
          <dt>{etiqueta}</dt>
          <dd className="num">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function Desgloses({ r }: { r: ObservatorioResumen }) {
  const maximo = Math.max(...r.porAgente.map((a) => a.costoUsd), 0.000001)
  return (
    <div className="obs-desgloses">
      <section className="obs-bloque">
        <h2>Por modelo</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Modelo</th>
              <th scope="col" className="derecha">
                Llamadas
              </th>
              <th scope="col" className="derecha">
                Tokens
              </th>
              <th scope="col" className="derecha">
                Costo
              </th>
            </tr>
          </thead>
          <tbody>
            {r.porModelo.map((m) => (
              <tr key={m.modelo}>
                <td>{nombreModelo(m.modelo)}</td>
                <td className="derecha num">{numero(m.llamadas)}</td>
                <td className="derecha num">
                  {tokens(m.tokensEntrada)} → {tokens(m.tokensSalida)}
                </td>
                <td className="derecha num">{usd(m.costoUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="obs-bloque">
        <h2>Por agente</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Agente</th>
              <th scope="col" className="derecha">
                Llamadas
              </th>
              <th scope="col">Peso en el costo</th>
              <th scope="col" className="derecha">
                Costo
              </th>
            </tr>
          </thead>
          <tbody>
            {r.porAgente.map((a) => (
              <tr key={a.agente}>
                <td>{nombreAgente(a.agente)}</td>
                <td className="derecha num">{numero(a.llamadas)}</td>
                <td>
                  <span
                    className="barra-peso"
                    style={{ "--fraccion": a.costoUsd / maximo } as CSSProperties}
                    aria-hidden="true"
                  />
                </td>
                <td className="derecha num">{usd(a.costoUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="obs-bloque">
        <h2>Versiones de prompt</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Agente</th>
              <th scope="col">Versión</th>
              <th scope="col" className="derecha">
                Usos
              </th>
              <th scope="col" className="derecha">
                Desde
              </th>
            </tr>
          </thead>
          <tbody>
            {r.prompts.map((p) => (
              <tr key={`${p.agente}-${p.hash}`}>
                <td>{nombreAgente(p.agente)}</td>
                <td className="mono">{p.hash.slice(0, 8)}</td>
                <td className="derecha num">{numero(p.usos)}</td>
                <td className="derecha num">{hora(p.primeraVez)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Lista(props: { lista: InteraccionResumen[]; seleccion: string | null; onElegir: (id: string) => void }) {
  if (props.lista.length === 0) {
    return <p className="seccion-nota obs-vacio">Aún no hay interacciones. Escríbele al agente y vuelve aquí.</p>
  }
  return (
    <ol className="obs-lista">
      {props.lista.map((i) => {
        const r = RESULTADOS[i.resultado]
        return (
          <li key={i.id}>
            <button
              type="button"
              className="obs-fila"
              aria-current={props.seleccion === i.id || undefined}
              onClick={() => props.onElegir(i.id)}
            >
              <span className="obs-fila-hora num">{hora(i.ts)}</span>
              <span className="obs-fila-texto">
                <span className="obs-fila-mensaje">{i.mensajeUsuario}</span>
                <span className="obs-fila-ruta">
                  {i.agente ? nombreAgente(i.agente) : "Sin agente"}
                  {i.intencion && ` · ${nombreIntencion(i.intencion)}`}
                  {i.caso && <span className="mono"> · {i.caso}</span>}
                </span>
              </span>
              <span className="obs-fila-cifras num">
                <span>{usd(i.costoUsd)}</span>
                <span className="secundario">{duracion(i.ms)}</span>
              </span>
              <span className="etiqueta" data-tono={r.tono}>
                {r.texto}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function Observatorio({ esAdmin }: { esAdmin: boolean }) {
  const [resumen, setResumen] = useState<ObservatorioResumen | null>(null)
  const [lista, setLista] = useState<InteraccionResumen[] | null>(null)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<InteraccionDetalle | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<ErrorApi | null>(null)
  const [actualizado, setActualizado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [r, l] = await Promise.all([
        apiJson<ObservatorioResumen>("/api/observatorio/resumen"),
        apiJson<InteraccionResumen[]>("/api/observatorio/interacciones?limite=50"),
      ])
      setResumen(r)
      setLista(l)
      setError(null)
      setActualizado(new Date().toISOString())
      setSeleccion((actual) => actual ?? l[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof ErrorApi ? e : new ErrorApi(0, "No pude conectar con el servidor."))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (esAdmin) void cargar()
  }, [esAdmin, cargar])

  useEffect(() => {
    if (!seleccion) return
    let vigente = true
    setDetalle(null)
    apiJson<InteraccionDetalle>(`/api/observatorio/interacciones/${encodeURIComponent(seleccion)}`)
      .then((d) => vigente && setDetalle(d))
      .catch(() => vigente && setDetalle(null))
    return () => {
      vigente = false
    }
  }, [seleccion])

  if (!esAdmin || error?.estado === 403) {
    return (
      <SinAcceso mensaje="El observatorio muestra costos, prompts y trazas completas, por eso solo lo ven los administradores. Si lo necesitas, pide a un administrador que cambie tu rol." />
    )
  }

  return (
    <div className="observatorio">
      <header className="obs-cabecera">
        <Volver />
        <h1>Observatorio</h1>
        <p className="obs-actualizado">
          {cargando ? (
            <>
              <IconoGiro tam={12} /> Actualizando
            </>
          ) : (
            actualizado && `Actualizado a las ${hora(actualizado)}`
          )}
        </p>
        <button type="button" className="boton boton-secundario boton-chico" onClick={cargar} disabled={cargando}>
          Actualizar
        </button>
      </header>

      {error && (
        <p className="error-linea obs-error" role="alert">
          {error.message}
        </p>
      )}

      <div className="obs-cuerpo">
        {resumen ? (
          <>
            <section className="obs-resumen" aria-label="Resumen">
              <div className="obs-presupuesto">
                <h2>Presupuesto de IA</h2>
                <PresupuestoAmplio presupuesto={resumen.presupuesto} />
              </div>
              <Totales r={resumen} />
            </section>
            <Desgloses r={resumen} />
          </>
        ) : (
          !error && <div className="esqueleto obs-esqueleto" aria-hidden="true" />
        )}

        <section className="obs-interacciones" aria-labelledby="obs-titulo-interacciones">
          <h2 id="obs-titulo-interacciones">Interacciones</h2>
          <div className="obs-maestro-detalle">
            <div className="obs-columna-lista">
              {lista ? (
                <Lista lista={lista} seleccion={seleccion} onElegir={setSeleccion} />
              ) : (
                <div className="esqueleto" aria-hidden="true" />
              )}
            </div>
            <div className="obs-columna-detalle">
              {detalle ? (
                <Detalle detalle={detalle} />
              ) : seleccion ? (
                <div className="esqueleto" aria-hidden="true">
                  <span style={{ width: "60%" }} />
                  <span style={{ width: "90%" }} />
                  <span style={{ width: "75%" }} />
                </div>
              ) : (
                <p className="seccion-nota">Elige una interacción para ver su traza.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
