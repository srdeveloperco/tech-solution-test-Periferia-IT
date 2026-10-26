import type { EjecucionHerramientaDto, InteraccionDetalle, LlamadaLlmDto } from "@oc/contracts"
import type { ReactNode } from "react"
import {
  duracion,
  fechaHora,
  hora,
  infoHerramienta,
  nombreAgente,
  nombreIntencion,
  nombreModelo,
  tokens,
  usd,
} from "../../util/formato"
import { IconoAlerta, IconoCheck } from "../Iconos"

function json(valor: unknown): string {
  if (valor === null || valor === undefined) return "Sin datos"
  if (typeof valor === "string") return valor
  return JSON.stringify(valor, null, 2) ?? String(valor)
}

/** Pliegue nativo (<details>): accesible por teclado y sin reinventar el control. */
function Pliegue({ titulo, meta, children }: { titulo: string; meta?: string; children: ReactNode }) {
  return (
    <details className="pliegue">
      <summary>
        <span>{titulo}</span>
        {meta && <span className="pliegue-meta mono">{meta}</span>}
      </summary>
      {children}
    </details>
  )
}

function Codigo({ valor }: { valor: unknown }) {
  return <pre className="codigo codigo-alto">{json(valor)}</pre>
}

type Paso =
  | { tipo: "llm"; ts: string; llamada: LlamadaLlmDto }
  | { tipo: "herramienta"; ts: string; ejecucion: EjecucionHerramientaDto }

function PasoLlm({ llamada }: { llamada: LlamadaLlmDto }) {
  return (
    <li className="traza-paso" data-tipo="llm" data-error={llamada.error !== null || undefined}>
      <details>
        <summary className="traza-resumen">
          <span className="traza-tipo">LLM</span>
          <span className="traza-nombre">
            {nombreAgente(llamada.agente)} <span className="secundario">· {nombreModelo(llamada.modelo)}</span>
          </span>
          <span className="traza-cifras num">
            {tokens(llamada.tokensEntrada)} → {tokens(llamada.tokensSalida)}
          </span>
          <span className="traza-cifras num">{usd(llamada.costoUsd)}</span>
          <span className="traza-cifras num">{duracion(llamada.ms)}</span>
          <span className="traza-hora num">{hora(llamada.ts)}</span>
        </summary>
        <div className="traza-cuerpo">
          <dl className="traza-meta">
            <div>
              <dt>Proveedor</dt>
              <dd>{llamada.proveedor}</dd>
            </div>
            <div>
              <dt>Fin</dt>
              <dd className="mono">{llamada.stopReason ?? "Sin dato"}</dd>
            </div>
            <div>
              <dt>Caché leída</dt>
              <dd className="num">{tokens(llamada.tokensCacheLectura)}</dd>
            </div>
            <div>
              <dt>Caché escrita</dt>
              <dd className="num">{tokens(llamada.tokensCacheEscritura)}</dd>
            </div>
            <div>
              <dt>Herramientas ofrecidas</dt>
              <dd>{llamada.herramientas.length > 0 ? llamada.herramientas.join(", ") : "Ninguna"}</dd>
            </div>
          </dl>
          {llamada.error && (
            <p className="error-linea" role="alert">
              {llamada.error}
            </p>
          )}
          <Pliegue titulo="System prompt" meta={`versión ${llamada.promptHash}`}>
            <pre className="codigo codigo-alto prosa">{llamada.sistema}</pre>
          </Pliegue>
          <Pliegue titulo="Variables dinámicas">
            <Codigo valor={llamada.variables} />
          </Pliegue>
          <Pliegue titulo="Mensajes enviados">
            <Codigo valor={llamada.mensajes} />
          </Pliegue>
          <Pliegue titulo="Respuesta cruda">
            <Codigo valor={llamada.respuesta} />
          </Pliegue>
        </div>
      </details>
    </li>
  )
}

function PasoHerramienta({ ejecucion }: { ejecucion: EjecucionHerramientaDto }) {
  return (
    <li className="traza-paso" data-tipo="herramienta" data-error={!ejecucion.ok || undefined}>
      <details>
        <summary className="traza-resumen">
          <span className="traza-tipo">Tool</span>
          <span className="traza-nombre">
            {infoHerramienta(ejecucion.nombre).etiqueta} <span className="secundario mono">· {ejecucion.nombre}</span>
          </span>
          <span className="traza-cifras traza-ok" data-ok={ejecucion.ok}>
            {ejecucion.ok ? <IconoCheck tam={12} /> : <IconoAlerta tam={12} />}
            {ejecucion.ok ? "ok" : "falló"}
          </span>
          <span className="traza-cifras" />
          <span className="traza-cifras num">{duracion(ejecucion.ms)}</span>
          <span className="traza-hora num">{hora(ejecucion.ts)}</span>
        </summary>
        <div className="traza-cuerpo">
          <Pliegue titulo="Argumentos">
            <Codigo valor={ejecucion.args} />
          </Pliegue>
          <Pliegue titulo="Resultado">
            <Codigo valor={ejecucion.resultado} />
          </Pliegue>
        </div>
      </details>
    </li>
  )
}

export function Detalle({ detalle }: { detalle: InteraccionDetalle }) {
  const pasos: Paso[] = [
    ...detalle.llamadas.map((llamada): Paso => ({ tipo: "llm", ts: llamada.ts, llamada })),
    ...detalle.herramientasEjecutadas.map((ejecucion): Paso => ({ tipo: "herramienta", ts: ejecucion.ts, ejecucion })),
  ].sort((a, b) => a.ts.localeCompare(b.ts))

  return (
    <article className="obs-detalle-contenido">
      <header className="obs-detalle-cabecera">
        <p className="secundario num">
          {fechaHora(detalle.ts)}
          {detalle.usuario && ` · ${detalle.usuario}`}
        </p>
        <h3>«{detalle.mensajeUsuario}»</h3>
      </header>

      <dl className="obs-ficha">
        <div>
          <dt>Agente</dt>
          <dd>{detalle.ruta ? nombreAgente(detalle.ruta.agente) : "Sin ruta"}</dd>
        </div>
        <div>
          <dt>Intención</dt>
          <dd>{detalle.ruta ? nombreIntencion(detalle.ruta.intencion) : "Sin dato"}</dd>
        </div>
        <div>
          <dt>Caso</dt>
          <dd className="mono">{detalle.caso ?? "Ninguno"}</dd>
        </div>
        <div>
          <dt>Enrutó</dt>
          <dd>{detalle.ruta ? nombreModelo(detalle.ruta.enrutador) : "Sin dato"}</dd>
        </div>
        <div>
          <dt>Costo</dt>
          <dd className="num">{usd(detalle.costoUsd)}</dd>
        </div>
        <div>
          <dt>Tiempo</dt>
          <dd className="num">{duracion(detalle.ms)}</dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd className="num">
            {tokens(detalle.tokensEntrada)} → {tokens(detalle.tokensSalida)}
          </dd>
        </div>
        <div>
          <dt>Llamadas</dt>
          <dd className="num">
            {detalle.llamadasLlm} LLM · {detalle.herramientas} herramientas
          </dd>
        </div>
      </dl>
      {detalle.ruta && <p className="obs-motivo">Motivo de la ruta: {detalle.ruta.motivo}</p>}

      <section className="obs-bloque">
        <h4>Respuesta al usuario</h4>
        <p className="obs-respuesta">{detalle.respuesta}</p>
      </section>

      <section className="obs-bloque">
        <h4>Traza</h4>
        {pasos.length === 0 ? (
          <p className="seccion-nota">Sin llamadas registradas.</p>
        ) : (
          <ol className="traza">
            {pasos.map((paso) =>
              paso.tipo === "llm" ? (
                <PasoLlm key={paso.llamada.id} llamada={paso.llamada} />
              ) : (
                <PasoHerramienta key={paso.ejecucion.id} ejecucion={paso.ejecucion} />
              ),
            )}
          </ol>
        )}
      </section>
    </article>
  )
}
