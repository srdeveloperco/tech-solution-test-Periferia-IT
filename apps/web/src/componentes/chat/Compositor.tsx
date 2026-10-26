import { type FormEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from "react"
import { IconoEnviar } from "../Iconos"

type Props = {
  ocupado: boolean
  bloqueado: boolean
  onEnviar: (texto: string) => void
  onDetener: () => void
}

const ALTURA_MAXIMA = 168

export function Compositor({ ocupado, bloqueado, onEnviar, onDetener }: Props) {
  const [texto, setTexto] = useState("")
  const campo = useRef<HTMLTextAreaElement>(null)

  // El campo crece con el texto hasta un tope; después hace scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se recalcula a propósito cada vez que cambia el texto
  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA)}px`
  }, [texto])

  const enviar = (e?: FormEvent) => {
    e?.preventDefault()
    const limpio = texto.trim()
    if (!limpio || ocupado || bloqueado) return
    onEnviar(limpio)
    setTexto("")
  }

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <form className="compositor" data-bloqueado={bloqueado} onSubmit={enviar}>
      <label className="solo-lector" htmlFor="compositor-campo">
        Mensaje para el agente
      </label>
      <textarea
        id="compositor-campo"
        ref={campo}
        rows={1}
        value={texto}
        disabled={bloqueado}
        placeholder={bloqueado ? "El agente está en pausa" : "Por ejemplo: procesa sol-004"}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={alTeclear}
      />
      {ocupado ? (
        <button type="button" className="compositor-boton detener" aria-label="Detener respuesta" onClick={onDetener}>
          <span className="cuadro" aria-hidden="true" />
        </button>
      ) : (
        <button type="submit" className="compositor-boton" aria-label="Enviar" disabled={!texto.trim() || bloqueado}>
          <IconoEnviar tam={16} strokeWidth={1.9} />
        </button>
      )}
    </form>
  )
}
