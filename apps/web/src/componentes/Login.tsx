import type { PeticionLogin, RespuestaLogin, UsuarioDto } from "@oc/contracts"
import { type FormEvent, useState } from "react"
import { almacen, apiFetch, CLAVES, guardarToken } from "../api/http"
import { IconoAlerta, IconoGiro } from "./Iconos"

type Props = { expirada: boolean; onEntrar: (usuario: UsuarioDto) => void }

function esRespuestaLogin(valor: unknown): valor is RespuestaLogin {
  return typeof valor === "object" && valor !== null && "ok" in valor && typeof valor.ok === "boolean"
}

export function Login({ expirada, onEntrar }: Props) {
  const [usuario, setUsuario] = useState("")
  const [clave, setClave] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (!usuario.trim() || !clave) {
      setError("Escribe tu correo y tu contraseña.")
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const cuerpo: PeticionLogin = { usuario: usuario.trim(), clave }
      const respuesta = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      })
      const datos: unknown = await respuesta.json().catch(() => null)
      if (esRespuestaLogin(datos) && datos.ok) {
        guardarToken(datos.token)
        almacen.escribir(CLAVES.usuario, JSON.stringify(datos.usuario))
        onEntrar(datos.usuario)
        return
      }
      if (esRespuestaLogin(datos) && !datos.ok) setError(datos.error)
      else if (respuesta.status === 429) setError("Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.")
      else setError("No pude iniciar sesión. Intenta de nuevo.")
    } catch {
      setError("No pude conectar con el servidor. Revisa tu conexión e intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <div className="login-caja">
        <span className="marca-sello marca-sello-grande" aria-hidden="true" />
        <h1>Órdenes de compra</h1>
        <p className="login-sub">Inicia sesión para continuar.</p>
        {expirada && (
          <p className="login-aviso" role="status">
            Tu sesión expiró. Vuelve a entrar.
          </p>
        )}
        <form className="login-form" onSubmit={entrar} noValidate>
          <label className="campo-form">
            <span>Correo</span>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nombre@empresa.com"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              aria-invalid={error !== null || undefined}
            />
          </label>
          <label className="campo-form">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              aria-invalid={error !== null || undefined}
            />
          </label>
          {error && (
            <p className="login-error" role="alert">
              <IconoAlerta tam={15} />
              {error}
            </p>
          )}
          <button type="submit" className="boton boton-primario login-boton" disabled={enviando}>
            {enviando ? (
              <>
                <IconoGiro tam={15} /> Entrando
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>
    </main>
  )
}
