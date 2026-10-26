import type { CasoResumen, UsuarioDto } from "@oc/contracts"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { descargar } from "../../api/http"
import type { Lienzo as EstadoLienzo, EtapaId } from "../../estado/lienzo"
import { IconoAtras, IconoBandeja, IconoDescarga, IconoPulso, IconoSalir } from "../Iconos"
import { Bandeja } from "./Bandeja"
import { ControlesVista } from "./ControlesVista"
import { EvidenciaVista } from "./EvidenciaVista"
import { OrdenVista } from "./OrdenVista"
import { PaqueteVista } from "./PaqueteVista"
import { Riel } from "./Riel"
import { Sello } from "./Sello"

type Props = {
  lienzo: EstadoLienzo
  casos: CasoResumen[] | null
  vista: "caso" | "bandeja"
  ocupado: boolean
  usuario: UsuarioDto | null
  esAdmin: boolean
  onVista: (vista: "caso" | "bandeja") => void
  onProcesar: (caso: string) => void
  onSalir: (() => void) | null
}

function Seccion(props: { id: EtapaId; titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className="seccion" data-seccion={props.id} aria-labelledby={`seccion-${props.id}`}>
      <header className="seccion-cabecera">
        <h3 id={`seccion-${props.id}`}>{props.titulo}</h3>
        {props.nota}
      </header>
      {props.children}
    </section>
  )
}

function Esqueleto({ lineas = 3 }: { lineas?: number }) {
  return (
    <div className="esqueleto" aria-hidden="true">
      {Array.from({ length: lineas }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: líneas decorativas sin identidad
        <span key={i} style={{ width: `${92 - i * 17}%` }} />
      ))}
    </div>
  )
}

function ErrorEtapa({ mensaje }: { mensaje: string }) {
  return <p className="error-etapa">{mensaje}</p>
}

const ETAPAS_VACIAS = {
  paquete: "pendiente",
  validar: "pendiente",
  orden: "pendiente",
  evidencia: "pendiente",
  crear: "pendiente",
} as const

function EstadoVacio({ casos, ocupado, onProcesar }: Pick<Props, "casos" | "ocupado" | "onProcesar">) {
  return (
    <div className="lienzo-vacio">
      <div className="lienzo-vacio-intro">
        <h2>Aquí verás el trabajo del agente</h2>
        <p>
          Cuando proceses una solicitud, este lienzo arma la orden paso a paso: lee el paquete, valida los diez
          controles y te muestra la OC tal como quedaría en SAP, con la fuente de cada valor.
        </p>
        <Riel etapas={ETAPAS_VACIAS} fantasma />
      </div>
      <section className="seccion" aria-labelledby="titulo-bandeja">
        <header className="seccion-cabecera">
          <h3 id="titulo-bandeja">Solicitudes en bandeja</h3>
          {casos && <span className="seccion-nota num">{casos.length}</span>}
        </header>
        <Bandeja casos={casos} ocupado={ocupado} onProcesar={onProcesar} />
      </section>
    </div>
  )
}

export function Lienzo(p: Props) {
  const { lienzo } = p
  const cuerpo = useRef<HTMLDivElement>(null)
  const siguiendo = useRef(true)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)
  const verCaso = p.vista === "caso" && lienzo.caso !== null
  const numeroOc =
    lienzo.crear && (lienzo.crear.tipo === "creada" || lienzo.crear.tipo === "idempotente")
      ? lienzo.crear.numero_oc
      : null

  // Mientras el agente trabaja, el lienzo sigue la sección que acaba de aparecer; al terminar, sube al resultado.
  useEffect(() => {
    const el = cuerpo.current
    if (!el || !siguiendo.current || lienzo.avance === 0) return
    if (lienzo.crear) {
      el.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const secciones = el.querySelectorAll<HTMLElement>("[data-seccion]")
    secciones[secciones.length - 1]?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [lienzo.avance, lienzo.crear])

  useEffect(() => {
    if (p.ocupado) siguiendo.current = true
  }, [p.ocupado])

  const alInteractuar = () => {
    siguiendo.current = false
  }

  const bajarControl = () => {
    setErrorDescarga(null)
    descargar("/api/control", "control.csv").catch((e: unknown) =>
      setErrorDescarga(e instanceof Error ? e.message : "No se pudo descargar"),
    )
  }

  const visto = (etapa: EtapaId) => lienzo.etapas[etapa] !== "pendiente"
  const enCurso = (etapa: EtapaId) => lienzo.etapas[etapa] === "en_curso"

  return (
    <section className="panel-lienzo" aria-label="Lienzo en vivo">
      <header className="lienzo-cabecera">
        <div className="lienzo-titulo">
          {verCaso ? (
            <>
              <span className="lienzo-caso mono">{lienzo.caso}</span>
              <span className="lienzo-descripcion">
                {lienzo.paquete?.solicitud.descripcion ?? "Leyendo el paquete…"}
              </span>
            </>
          ) : (
            <span className="lienzo-caso">Lienzo</span>
          )}
        </div>
        <nav className="lienzo-acciones" aria-label="Acciones del lienzo">
          {lienzo.caso && (
            <button
              type="button"
              className="boton boton-fantasma boton-chico"
              onClick={() => p.onVista(p.vista === "caso" ? "bandeja" : "caso")}
            >
              {p.vista === "caso" ? (
                <>
                  <IconoBandeja tam={14} /> Bandeja
                </>
              ) : (
                <>
                  <IconoAtras tam={14} /> Volver al caso
                </>
              )}
            </button>
          )}
          <button type="button" className="boton boton-fantasma boton-chico" onClick={bajarControl}>
            <IconoDescarga tam={14} /> control.csv
          </button>
          {p.esAdmin && (
            <a className="boton boton-fantasma boton-chico" href="#/observatorio">
              <IconoPulso tam={14} /> Observatorio
            </a>
          )}
          {p.onSalir && (
            <button
              type="button"
              className="boton boton-fantasma boton-chico usuario"
              onClick={p.onSalir}
              title="Cerrar sesión"
            >
              <span className="usuario-correo">{p.usuario?.email ?? "Sesión"}</span>
              <IconoSalir tam={14} />
            </button>
          )}
        </nav>
      </header>
      {errorDescarga && (
        <p className="error-linea lienzo-error" role="alert">
          {errorDescarga}
        </p>
      )}

      {verCaso && (
        <div className="lienzo-riel">
          <Riel etapas={lienzo.etapas} />
        </div>
      )}

      <div className="lienzo-cuerpo" ref={cuerpo} onWheel={alInteractuar} onTouchMove={alInteractuar}>
        {verCaso ? (
          <div className="lienzo-contenido">
            {lienzo.crear && <Sello resultado={lienzo.crear} retroactiva={lienzo.validacion?.retroactiva ?? false} />}

            {visto("paquete") && (
              <Seccion id="paquete" titulo="Paquete recibido">
                {lienzo.paquete ? (
                  <PaqueteVista paquete={lienzo.paquete} />
                ) : enCurso("paquete") ? (
                  <Esqueleto />
                ) : (
                  <ErrorEtapa mensaje={lienzo.errores.paquete ?? "No se pudo leer el paquete."} />
                )}
              </Seccion>
            )}

            {visto("validar") && (
              <Seccion id="validar" titulo="Controles">
                {lienzo.validacion ? (
                  <ControlesVista validacion={lienzo.validacion} />
                ) : enCurso("validar") ? (
                  <Esqueleto lineas={5} />
                ) : (
                  <ErrorEtapa mensaje={lienzo.errores.validar ?? "No se pudo validar."} />
                )}
              </Seccion>
            )}

            {visto("orden") && (
              <Seccion
                id="orden"
                titulo="Orden de compra"
                nota={
                  lienzo.orden && <span className="seccion-nota">Pasa el cursor por un valor para ver su fuente</span>
                }
              >
                {lienzo.orden ? (
                  <OrdenVista datos={lienzo.orden} numeroOc={numeroOc} />
                ) : enCurso("orden") ? (
                  <Esqueleto lineas={4} />
                ) : (
                  <ErrorEtapa mensaje={lienzo.errores.orden ?? "No se pudo construir la orden."} />
                )}
              </Seccion>
            )}

            {visto("evidencia") && (
              <Seccion id="evidencia" titulo="Evidencia de aprobación">
                {lienzo.evidencia && lienzo.caso ? (
                  <EvidenciaVista caso={lienzo.caso} evidencia={lienzo.evidencia} />
                ) : enCurso("evidencia") ? (
                  <Esqueleto lineas={2} />
                ) : (
                  <ErrorEtapa mensaje={lienzo.errores.evidencia ?? "No se pudo generar la evidencia."} />
                )}
              </Seccion>
            )}

            {enCurso("crear") && (
              <Seccion id="crear" titulo="Creando en SAP">
                <Esqueleto lineas={1} />
              </Seccion>
            )}
          </div>
        ) : (
          <EstadoVacio casos={p.casos} ocupado={p.ocupado} onProcesar={p.onProcesar} />
        )}
      </div>
    </section>
  )
}
