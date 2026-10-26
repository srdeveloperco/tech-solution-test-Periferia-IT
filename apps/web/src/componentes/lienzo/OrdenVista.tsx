import { createContext, type ReactNode, useContext } from "react"
import type { OrdenVista as Orden, Traza } from "../../api/guards"
import { dinero, fechaHora, numero, shaCorto } from "../../util/formato"

const ContextoTraza = createContext<Traza>({})

/** Acepta "posiciones[0].x" y "posiciones.0.x": el lienzo no depende del formato exacto de la clave. */
function fuenteDe(traza: Traza, ruta: string): string | null {
  const alternativa = ruta.replace(/\[(\d+)\]/g, ".$1")
  return traza[ruta]?.fuente ?? traza[alternativa]?.fuente ?? null
}

const FUENTES: Record<string, string> = {
  solicitud: "Fuente: solicitud",
  cotizacion: "Fuente: cotización",
  correo: "Fuente: correo",
  aprobacion: "Fuente: aprobación",
  derivado: "Derivado por el agente",
  constante: "Valor fijo de SAP",
}

function textoFuente(fuente: string): string {
  if (fuente.startsWith("maestro.")) return `Fuente: maestro de ${fuente.slice(8).replace(/-/g, " ")}`
  return FUENTES[fuente] ?? `Fuente: ${fuente}`
}

/** Un valor del documento; al pasar el cursor (o con foco) muestra de dónde salió. */
function Campo({ ruta, children, etiqueta }: { ruta: string; children: ReactNode; etiqueta?: string }) {
  const fuente = fuenteDe(useContext(ContextoTraza), ruta)
  const contenido = (
    <>
      {children}
      {fuente && (
        <span className="campo-fuente" role="tooltip">
          {textoFuente(fuente)}
        </span>
      )}
    </>
  )
  if (etiqueta === undefined) {
    return (
      <span className="campo" tabIndex={fuente ? 0 : undefined} data-fuente={fuente ?? undefined}>
        {contenido}
      </span>
    )
  }
  return (
    <div className="campo campo-bloque" tabIndex={fuente ? 0 : undefined} data-fuente={fuente ?? undefined}>
      <dt>{etiqueta}</dt>
      <dd>{contenido}</dd>
    </div>
  )
}

const CONDICIONES: Record<string, string> = {
  Z000: "Pago inmediato",
  Z015: "15 días fecha factura",
  Z030: "30 días fecha factura",
  Z060: "60 días fecha factura",
}

export function OrdenVista({ datos, numeroOc }: { datos: Orden; numeroOc: string | null }) {
  const o = datos.orden
  const total = o.posiciones.reduce((suma, p) => suma + p.cantidad * p.precio_unitario, 0)
  return (
    <ContextoTraza.Provider value={datos.trazabilidad}>
      <article className="orden" data-creada={numeroOc !== null}>
        <header className="orden-cabecera">
          <div>
            <p className="orden-tipo">Orden de compra</p>
            <p className="orden-numero num">{numeroOc ? `N.º ${numeroOc}` : "Borrador"}</p>
          </div>
          <p className="orden-org">
            <Campo ruta="sociedad">
              Sociedad <b className="num">{o.sociedad}</b>
            </Campo>
            <Campo ruta="organizacion_compras">
              Org. compras <b className="num">{o.organizacion_compras}</b>
            </Campo>
          </p>
        </header>

        <dl className="orden-campos">
          <Campo etiqueta="Proveedor" ruta="proveedor.nombre">
            {o.proveedor.nombre}
            <span className="secundario num"> · Cód. SAP {o.proveedor.codigo_sap}</span>
          </Campo>
          <Campo etiqueta="NIT" ruta="proveedor.nit">
            <span className="num">{o.proveedor.nit}</span>
          </Campo>
          <Campo etiqueta="Moneda" ruta="moneda">
            {o.moneda}
          </Campo>
          <Campo etiqueta="Condiciones de pago" ruta="condiciones_pago">
            <span className="mono">{o.condiciones_pago}</span>
            {CONDICIONES[o.condiciones_pago] && (
              <span className="secundario"> · {CONDICIONES[o.condiciones_pago]}</span>
            )}
          </Campo>
          <Campo etiqueta="Solicitud" ruta="referencia.solicitud_id">
            <span className="mono">{o.referencia.solicitud_id}</span>
          </Campo>
          <Campo etiqueta="Cotización" ruta="referencia.cotizacion_ref">
            <span className="mono">{o.referencia.cotizacion_ref ?? "Sin cotización"}</span>
          </Campo>
        </dl>

        <div className="orden-tabla-marco">
          <table className="orden-tabla">
            <thead>
              <tr>
                <th scope="col">Pos.</th>
                <th scope="col">Descripción</th>
                <th scope="col" className="derecha">
                  Cant.
                </th>
                <th scope="col" className="derecha">
                  Precio unit.
                </th>
                <th scope="col">IVA</th>
                <th scope="col" className="derecha">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {o.posiciones.map((p, i) => (
                <tr key={p.numero}>
                  <td className="num">{p.numero}</td>
                  <td>
                    <Campo ruta={`posiciones[${i}].descripcion`}>{p.descripcion}</Campo>
                    <span className="orden-imputacion">
                      <Campo ruta={`posiciones[${i}].centro_costo`}>{p.centro_costo}</Campo>
                      {" · "}
                      <Campo ruta={`posiciones[${i}].subarea`}>{p.subarea}</Campo>
                    </span>
                  </td>
                  <td className="derecha num">
                    <Campo ruta={`posiciones[${i}].cantidad`}>{numero(p.cantidad)}</Campo>{" "}
                    <Campo ruta={`posiciones[${i}].unidad`}>{p.unidad}</Campo>
                  </td>
                  <td className="derecha num">
                    <Campo ruta={`posiciones[${i}].precio_unitario`}>{dinero(p.precio_unitario, o.moneda)}</Campo>
                  </td>
                  <td>
                    <Campo ruta={`posiciones[${i}].indicador_iva`}>
                      <span className="mono">{p.indicador_iva}</span>
                    </Campo>
                  </td>
                  <td className="derecha num">{dinero(p.cantidad * p.precio_unitario, o.moneda)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5}>
                  Total
                </th>
                <td className="derecha num">{dinero(total, o.moneda)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <dl className="orden-pie">
          <Campo etiqueta="Aprobó" ruta="aprobador.email">
            {o.aprobador.email}
            <span className="secundario"> · {fechaHora(o.aprobador.fecha_aprobacion)}</span>
          </Campo>
          <Campo etiqueta="Evidencia" ruta="aprobador.evidencia_sha256">
            <span className="mono" title={o.aprobador.evidencia_sha256}>
              sha256 {shaCorto(o.aprobador.evidencia_sha256)}
            </span>
          </Campo>
        </dl>

        {o.excepciones.length > 0 && (
          <div className="orden-excepciones">
            <p className="orden-excepciones-titulo">Excepciones</p>
            <ul>
              {o.excepciones.map((e) => (
                <li key={e.codigo}>
                  <span className="mono">{e.codigo}</span>
                  <span>{e.detalle}</span>
                  <span className="secundario">
                    {e.confirmado_por
                      ? `Confirmó ${e.confirmado_por}`
                      : numeroOc
                        ? "Confirmada al crear"
                        : "Por confirmar"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </ContextoTraza.Provider>
  )
}
