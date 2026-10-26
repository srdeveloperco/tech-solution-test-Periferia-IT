import type { PresupuestoDto, SaludDto } from "@oc/contracts"
import { useLayoutEffect, useRef, useState } from "react"
import type { EstadoChat } from "../../estado/chat"
import { nombreModelo } from "../../util/formato"
import { IconoNuevo, IconoReloj } from "../Iconos"
import { MedidorPresupuesto } from "../Presupuesto"
import { Bienvenida } from "./Bienvenida"
import { Compositor } from "./Compositor"
import { Historial } from "./Historial"
import { HojaConfirmacion } from "./HojaConfirmacion"
import { BurbujaUsuario, MensajeDelAgente } from "./Mensaje"

type Props = {
  estado: EstadoChat
  salud: SaludDto | null
  presupuesto: PresupuestoDto | null
  onEnviar: (texto: string) => void
  onConfirmar: (caso: string) => void
  onPosponer: () => void
  onDetener: () => void
  onReintentar: () => void
  onNueva: () => void
  onAbrirConversacion: (sessionId: string) => Promise<void>
}

function lineaEstado(salud: SaludDto | null): string {
  if (!salud) return "Conectando…"
  if (salud.provider === "guion") return "Modo sin modelo, determinista"
  if (salud.provider === "demo") return "Demostración con datos grabados"
  return `${nombreModelo(salud.modelos.operador)} y ${nombreModelo(salud.modelos.router)}`
}

export function Conversacion(p: Props) {
  const historial = useRef<HTMLDivElement>(null)
  const pegado = useRef(true)
  const [verHistorial, setVerHistorial] = useState(false)
  const { mensajes, ocupado, pendiente } = p.estado
  const bloqueado = p.presupuesto?.bloqueado ?? false
  const ultimoAgente = mensajes.findLast((m) => m.rol === "agente")

  // Sigue el final de la conversación solo si la persona no subió a leer algo anterior.
  useLayoutEffect(() => {
    const el = historial.current
    if (el && pegado.current) el.scrollTop = el.scrollHeight
  })

  const alDesplazar = () => {
    const el = historial.current
    if (el) pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  return (
    <section className="panel-chat" aria-label="Conversación">
      <header className="chat-cabecera">
        <div className="marca">
          <span className="marca-sello" aria-hidden="true" />
          <div>
            <h1>Órdenes de compra</h1>
            <p>{lineaEstado(p.salud)}</p>
          </div>
        </div>
        <div className="chat-cabecera-acciones">
          {p.presupuesto && <MedidorPresupuesto presupuesto={p.presupuesto} />}
          <button
            type="button"
            className="boton boton-fantasma boton-icono"
            onClick={() => setVerHistorial((v) => !v)}
            aria-expanded={verHistorial}
            aria-label="Conversaciones recientes"
            title="Conversaciones recientes"
          >
            <IconoReloj tam={16} />
          </button>
          <button
            type="button"
            className="boton boton-fantasma boton-icono"
            onClick={() => {
              setVerHistorial(false)
              p.onNueva()
            }}
            disabled={ocupado || mensajes.length === 0}
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <IconoNuevo tam={16} />
          </button>
        </div>
      </header>

      {verHistorial && (
        <Historial
          actual={p.estado.sessionId}
          onCerrar={() => setVerHistorial(false)}
          onElegir={async (id) => {
            await p.onAbrirConversacion(id)
            setVerHistorial(false)
          }}
        />
      )}

      <div className="historial" ref={historial} onScroll={alDesplazar}>
        {mensajes.length === 0 ? (
          <Bienvenida onElegir={p.onEnviar} />
        ) : (
          <div className="mensajes">
            {mensajes.map((m) =>
              m.rol === "usuario" ? (
                <BurbujaUsuario key={m.id} mensaje={m} />
              ) : (
                <MensajeDelAgente
                  key={m.id}
                  mensaje={m}
                  onReintentar={m === ultimoAgente && m.error && !ocupado ? p.onReintentar : null}
                />
              ),
            )}
          </div>
        )}
      </div>

      <footer className="chat-pie">
        {pendiente && !ocupado && (
          <HojaConfirmacion
            key={pendiente.caso}
            confirmacion={pendiente}
            ocupado={ocupado}
            onConfirmar={() => p.onConfirmar(pendiente.caso)}
            onPosponer={p.onPosponer}
          />
        )}
        {bloqueado && (
          <p className="aviso-pausa" role="status">
            Se alcanzó el límite de gasto en IA de la cuenta de prueba. El agente queda en pausa; tus conversaciones
            siguen disponibles.
          </p>
        )}
        <Compositor ocupado={ocupado} bloqueado={bloqueado} onEnviar={p.onEnviar} onDetener={p.onDetener} />
      </footer>
    </section>
  )
}
