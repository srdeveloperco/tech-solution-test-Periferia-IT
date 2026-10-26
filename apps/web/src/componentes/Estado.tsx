import type { ToolCallVisible } from "@oc/contracts"
import { comoCrear, comoValidacion } from "../api/guards"
import type { EstadoEtapa } from "../estado/lienzo"
import { IconoAlerta, IconoBloqueo, IconoCheck, IconoCirculo, IconoGiro, IconoGuion, IconoPausa } from "./Iconos"

export type EstadoVisual = EstadoEtapa | "derivado" | "no_aplica"

const TONO: Partial<Record<EstadoVisual, "verde" | "ambar" | "rojo">> = {
  ok: "verde",
  atencion: "ambar",
  bloqueo: "rojo",
  error: "rojo",
}

export function tonoDe(estado: EstadoVisual): "verde" | "ambar" | "rojo" | undefined {
  return TONO[estado]
}

export function IconoEstado({ estado, tam = 16 }: { estado: EstadoVisual; tam?: number }) {
  switch (estado) {
    case "en_curso":
      return <IconoGiro tam={tam} />
    case "ok":
      return <IconoCheck tam={tam} />
    case "atencion":
      return <IconoPausa tam={tam} />
    case "bloqueo":
      return <IconoBloqueo tam={tam} />
    case "error":
      return <IconoAlerta tam={tam} />
    case "derivado":
      return <IconoGuion tam={tam} />
    default:
      return <IconoCirculo tam={tam} />
  }
}

/** Estado visual de una llamada a herramienta en la conversación. */
export function estadoLlamada(llamada: ToolCallVisible): EstadoVisual {
  if (llamada.ok === null) return "en_curso"
  if (llamada.ok && llamada.nombre === "oc_validar") {
    const v = comoValidacion(llamada.resultado)
    if (v && (!v.apta || v.bloqueos.length > 0)) return "bloqueo"
    if (v && v.confirmaciones.length > 0) return "atencion"
  }
  if (llamada.ok) return "ok"
  const crear = llamada.nombre === "oc_crear" ? comoCrear(llamada.resultado) : null
  if (crear?.tipo === "pendiente") return "atencion"
  if (crear?.tipo === "bloqueada" || /bloque/i.test(llamada.resumen)) return "bloqueo"
  return "error"
}
