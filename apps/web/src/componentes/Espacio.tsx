import type { CasoResumen, PeticionChat, PresupuestoDto, SaludDto, SesionDto, UsuarioDto } from "@oc/contracts"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { transporte } from "../api/chat"
import { almacen, apiJson, CLAVES, ErrorApi, modoDemo, parametro } from "../api/http"
import { estadoInicial, reducirChat } from "../estado/chat"
import { derivarLienzo } from "../estado/lienzo"
import { Conversacion } from "./chat/Conversacion"
import { IconoPulso, IconoSalir } from "./Iconos"
import { Lienzo } from "./lienzo/Lienzo"

type Props = {
  usuario: UsuarioDto | null
  esAdmin: boolean
  oculto: boolean
  onSalir: (() => void) | null
}

const MENSAJES_DEMO: Record<string, string> = {
  "sol-004":
    'Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.',
  "sol-001": "Procesa la solicitud sol-001",
  "sol-002": "Procesa la solicitud sol-002",
}

function mensajeDeError(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") return "Detuviste la respuesta."
  if (e instanceof ErrorApi) return e.estado === 401 ? "Tu sesión expiró. Vuelve a entrar." : e.message
  if (e instanceof TypeError) return "No pude conectar con el servidor. Revisa tu conexión e intenta de nuevo."
  return e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo."
}

export function Espacio({ usuario, esAdmin, oculto, onSalir }: Props) {
  const [estado, despachar] = useReducer(reducirChat, estadoInicial)
  const [casos, setCasos] = useState<CasoResumen[] | null>(null)
  const [presupuesto, setPresupuesto] = useState<PresupuestoDto | null>(null)
  const [salud, setSalud] = useState<SaludDto | null>(null)
  const [panel, setPanel] = useState<"chat" | "lienzo">("chat")
  const [actividad, setActividad] = useState(false)
  const [vista, setVista] = useState<"caso" | "bandeja">("caso")

  const enviarCon = useRef(transporte())
  const controlador = useRef<AbortController | null>(null)
  const sesion = useRef<string | null>(null)
  const ocupado = useRef(false)
  const panelActual = useRef(panel)
  panelActual.current = panel

  const llamadas = useMemo(
    () => estado.mensajes.flatMap((m) => (m.rol === "agente" ? m.toolCalls : [])),
    [estado.mensajes],
  )
  const lienzo = useMemo(() => derivarLienzo(llamadas), [llamadas])

  const cargarCasos = useCallback(() => {
    apiJson<CasoResumen[]>("/api/casos")
      .then(setCasos)
      .catch(() => setCasos((actual) => actual ?? []))
  }, [])

  useEffect(() => {
    cargarCasos()
    apiJson<PresupuestoDto>("/api/presupuesto")
      .then(setPresupuesto)
      .catch(() => undefined)
    apiJson<SaludDto>("/api/health")
      .then(setSalud)
      .catch(() => undefined)
  }, [cargarCasos])

  // Al recargar, retoma la conversación guardada.
  useEffect(() => {
    if (modoDemo()) return
    const id = almacen.leer(CLAVES.sesion)
    if (!id) return
    apiJson<SesionDto>(`/api/sessions/${encodeURIComponent(id)}`)
      .then((s) => {
        sesion.current = s.sessionId
        despachar({ tipo: "restaurar", sessionId: s.sessionId, mensajes: s.mensajes })
      })
      .catch(() => almacen.borrar(CLAVES.sesion))
  }, [])

  const enviar = useCallback(
    async (texto: string, confirmar?: { caso: string }) => {
      if (ocupado.current) return
      ocupado.current = true
      despachar({ tipo: "enviar", texto })
      setVista("caso")
      const c = new AbortController()
      controlador.current = c
      const peticion: PeticionChat = {
        message: texto,
        ...(sesion.current ? { sessionId: sesion.current } : {}),
        ...(confirmar ? { confirmar } : {}),
      }
      try {
        await enviarCon.current(
          peticion,
          (evento) => {
            despachar({ tipo: "evento", evento })
            if (evento.tipo === "sesion") {
              sesion.current = evento.sessionId
              almacen.escribir(CLAVES.sesion, evento.sessionId)
            }
            if (evento.tipo === "herramienta_inicio" && panelActual.current === "chat") setActividad(true)
            if (evento.tipo === "fin") setPresupuesto(evento.respuesta.presupuesto)
          },
          c.signal,
        )
      } catch (e) {
        despachar({ tipo: "fallo", mensaje: mensajeDeError(e) })
      } finally {
        despachar({ tipo: "cerrar" })
        ocupado.current = false
        controlador.current = null
        cargarCasos()
      }
    },
    [cargarCasos],
  )

  // Demostración: ?demo=sol-004&auto=1 arranca sola.
  useEffect(() => {
    const demo = modoDemo()
    if (!demo || !parametro("auto")) return
    const t = window.setTimeout(() => void enviar(MENSAJES_DEMO[demo] ?? `Procesa la solicitud ${demo}`), 450)
    return () => window.clearTimeout(t)
  }, [enviar])

  const ultimoUsuario = estado.mensajes.findLast((m) => m.rol === "usuario")

  const nueva = () => {
    controlador.current?.abort()
    sesion.current = null
    almacen.borrar(CLAVES.sesion)
    despachar({ tipo: "nueva" })
    setVista("caso")
  }

  const abrirConversacion = async (id: string) => {
    if (ocupado.current) return
    const s = await apiJson<SesionDto>(`/api/sessions/${encodeURIComponent(id)}`)
    sesion.current = s.sessionId
    almacen.escribir(CLAVES.sesion, s.sessionId)
    despachar({ tipo: "restaurar", sessionId: s.sessionId, mensajes: s.mensajes })
    setVista("caso")
  }

  const cambiarPanel = (siguiente: "chat" | "lienzo") => {
    setPanel(siguiente)
    if (siguiente === "lienzo") setActividad(false)
  }

  return (
    <div className="espacio" data-panel={panel} hidden={oculto}>
      <nav className="conmutador" aria-label="Vista">
        <div className="conmutador-segmentos" role="tablist">
          <button type="button" role="tab" aria-selected={panel === "chat"} onClick={() => cambiarPanel("chat")}>
            Conversación
          </button>
          <button type="button" role="tab" aria-selected={panel === "lienzo"} onClick={() => cambiarPanel("lienzo")}>
            Lienzo
            {actividad && (
              <>
                <span className="punto-actividad" aria-hidden="true" />
                <span className="solo-lector">, hay actividad nueva</span>
              </>
            )}
          </button>
        </div>
        <div className="conmutador-acciones">
          {esAdmin && (
            <a className="boton boton-fantasma boton-icono" href="#/observatorio" aria-label="Observatorio">
              <IconoPulso tam={16} />
            </a>
          )}
          {onSalir && (
            <button
              type="button"
              className="boton boton-fantasma boton-icono"
              aria-label="Cerrar sesión"
              onClick={onSalir}
            >
              <IconoSalir tam={16} />
            </button>
          )}
        </div>
      </nav>

      <Conversacion
        estado={estado}
        salud={salud}
        presupuesto={presupuesto}
        onEnviar={(t) => void enviar(t)}
        onConfirmar={(caso) => void enviar("Confirmo", { caso })}
        onPosponer={() => void enviar("Ahora no, déjala pendiente.")}
        onDetener={() => controlador.current?.abort()}
        onReintentar={() => ultimoUsuario && void enviar(ultimoUsuario.texto)}
        onNueva={nueva}
        onAbrirConversacion={abrirConversacion}
      />

      <Lienzo
        lienzo={lienzo}
        casos={casos}
        vista={vista}
        ocupado={estado.ocupado}
        usuario={usuario}
        esAdmin={esAdmin}
        onVista={setVista}
        onProcesar={(caso) => {
          void enviar(`Procesa la solicitud ${caso}`)
          if (panelActual.current === "lienzo") setPanel("lienzo")
        }}
        onSalir={onSalir}
      />
    </div>
  )
}
