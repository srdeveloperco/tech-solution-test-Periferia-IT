import type { CSSProperties, ReactNode } from "react"
import type { PaqueteVista as Paquete } from "../../api/guards"
import { dinero, fecha, fechaHora, numero } from "../../util/formato"
import { IconoCheck, IconoDocumento } from "../Iconos"

function Hoja(props: { area: string; tipo: string; archivo: string; orden: number; children: ReactNode }) {
  const estilo = { gridArea: props.area, "--i": props.orden } as CSSProperties
  return (
    <section className="hoja" style={estilo} aria-label={props.tipo}>
      <header className="hoja-cabecera">
        <span className="hoja-tipo">{props.tipo}</span>
        <span className="hoja-archivo mono">{props.archivo}</span>
      </header>
      {props.children}
    </section>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Faltante({ nombre, area, orden }: { nombre: string; area: string; orden: number }) {
  const estilo = { gridArea: area, "--i": orden } as CSSProperties
  return (
    <section className="hoja hoja-faltante" style={estilo}>
      <IconoDocumento tam={18} />
      <p>
        Falta <span className="mono">{nombre}</span>
      </p>
    </section>
  )
}

const faltaAlgo = (faltantes: string[], clave: string) => faltantes.find((f) => f.toLowerCase().includes(clave))

export function PaqueteVista({ paquete }: { paquete: Paquete }) {
  const { solicitud: s, cotizacion: c, aprobacion: a, correo, factura, faltantes } = paquete
  return (
    <div className={factura ? "hojas con-factura" : "hojas"}>
      <Hoja area="sol" tipo="Solicitud" archivo="solicitud.json" orden={0}>
        <p className="hoja-titulo">{s.descripcion}</p>
        <dl className="datos">
          <Dato etiqueta="Solicitante">{s.solicitante}</Dato>
          <Dato etiqueta="Proveedor">
            {s.proveedor_nombre}
            {s.proveedor_nit && <span className="secundario num"> · NIT {s.proveedor_nit}</span>}
          </Dato>
          <Dato etiqueta="Centro de costo">
            {s.centro_costo} <span className="secundario">· {s.subarea}</span>
          </Dato>
          <Dato etiqueta="Cantidad">
            <span className="num">
              {numero(s.cantidad)} × {dinero(s.valor_unitario, s.moneda)}
            </span>
          </Dato>
          <Dato etiqueta="IVA y pago">
            {s.indicador_iva ?? <span className="ausente">sin IVA</span>}
            <span className="secundario"> · </span>
            {s.condiciones_pago ?? <span className="ausente">sin condiciones</span>}
          </Dato>
          <Dato etiqueta="Fecha">{fecha(s.fecha_solicitud)}</Dato>
        </dl>
        <p className="hoja-total">
          <span>Total</span>
          <span className="num">{dinero(s.valor_total, s.moneda)}</span>
        </p>
      </Hoja>

      {c ? (
        <Hoja area="cot" tipo="Cotización" archivo="cotizacion.txt" orden={1}>
          <p className="hoja-referencia mono">{c.numero ?? "Sin número"}</p>
          <dl className="datos">
            <Dato etiqueta="NIT">
              <span className="num">{c.nit ?? "No informado"}</span>
            </Dato>
            <Dato etiqueta="Válida hasta">{c.validez_hasta ? fecha(c.validez_hasta) : "No indica"}</Dato>
          </dl>
          <p className="hoja-total">
            <span>Total</span>
            <span className="num">{dinero(c.total, c.moneda)}</span>
          </p>
        </Hoja>
      ) : (
        <Faltante nombre={faltaAlgo(faltantes, "cotiz") ?? "cotizacion.txt"} area="cot" orden={1} />
      )}

      {a ? (
        <Hoja area="apr" tipo="Aprobación" archivo="aprobacion.json" orden={2}>
          <dl className="datos">
            <Dato etiqueta="De">{a.de}</Dato>
            <Dato etiqueta="Fecha">{fechaHora(a.fecha)}</Dato>
          </dl>
          <blockquote className="hoja-cita">{a.texto.split("\n")[0]}</blockquote>
          <p className="etiqueta" data-tono={a.aprobado ? "verde" : "rojo"}>
            {a.aprobado ? (
              <>
                <IconoCheck tam={12} /> Dice «Aprobado»
              </>
            ) : (
              "No dice «Aprobado»"
            )}
          </p>
        </Hoja>
      ) : (
        <Faltante nombre={faltaAlgo(faltantes, "aprob") ?? "aprobacion.json"} area="apr" orden={2} />
      )}

      <Hoja area="cor" tipo="Correo" archivo="correo.json" orden={3}>
        <dl className="datos">
          <Dato etiqueta="De">{correo.de}</Dato>
          <Dato etiqueta="Asunto">
            <span className="recortado">{correo.asunto}</span>
          </Dato>
          <Dato etiqueta="Recibido">{fechaHora(correo.fecha)}</Dato>
        </dl>
      </Hoja>

      {factura && (
        <Hoja area="fac" tipo="Factura" archivo="factura.txt" orden={4}>
          <p className="hoja-referencia mono">{factura.numero}</p>
          <dl className="datos">
            <Dato etiqueta="Fecha">{fecha(factura.fecha)}</Dato>
          </dl>
          <p className="hoja-total">
            <span>Total</span>
            <span className="num">{dinero(factura.total, s.moneda)}</span>
          </p>
        </Hoja>
      )}
    </div>
  )
}
