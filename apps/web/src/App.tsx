import type { ConfigAuth, UsuarioDto } from "@oc/contracts"
import { useEffect, useState } from "react"
import { alExpirarSesion, almacen, apiJson, CLAVES, guardarToken, hayToken } from "./api/http"
import { Espacio } from "./componentes/Espacio"
import { Login } from "./componentes/Login"
import { Observatorio } from "./componentes/observatorio/Observatorio"

type Modo = ConfigAuth["modo"]
type Acceso = { fase: "cargando" } | { fase: "login"; expirada: boolean } | { fase: "dentro"; modo: Modo }

function leerUsuario(): UsuarioDto | null {
  const crudo = almacen.leer(CLAVES.usuario)
  if (!crudo) return null
  try {
    const valor: unknown = JSON.parse(crudo)
    return typeof valor === "object" && valor !== null && "email" in valor ? (valor as UsuarioDto) : null
  } catch {
    return null
  }
}

function rutaActual(): "chat" | "observatorio" {
  return window.location.hash.startsWith("#/observatorio") ? "observatorio" : "chat"
}

function useRuta() {
  const [ruta, setRuta] = useState(rutaActual)
  useEffect(() => {
    const alCambiar = () => setRuta(rutaActual())
    window.addEventListener("hashchange", alCambiar)
    return () => window.removeEventListener("hashchange", alCambiar)
  }, [])
  return ruta
}

export function App() {
  const [acceso, setAcceso] = useState<Acceso>({ fase: "cargando" })
  const [modo, setModo] = useState<Modo>("local")
  const [usuario, setUsuario] = useState<UsuarioDto | null>(leerUsuario)
  const ruta = useRuta()

  // El acceso es obligatorio: solo el modo "abierto" (desarrollo) salta el login. Si la config falla, se pide login.
  useEffect(() => {
    apiJson<ConfigAuth>("/api/auth/config")
      .then((config) => {
        setModo(config.modo)
        setAcceso(
          config.modo === "abierto" || hayToken()
            ? { fase: "dentro", modo: config.modo }
            : { fase: "login", expirada: false },
        )
      })
      .catch(() => setAcceso(hayToken() ? { fase: "dentro", modo: "local" } : { fase: "login", expirada: false }))
  }, [])

  useEffect(
    () =>
      alExpirarSesion(() => {
        almacen.borrar(CLAVES.usuario)
        setUsuario(null)
        setAcceso({ fase: "login", expirada: true })
      }),
    [],
  )

  const salir = () => {
    guardarToken(null)
    almacen.borrar(CLAVES.usuario)
    almacen.borrar(CLAVES.sesion)
    setUsuario(null)
    setAcceso({ fase: "login", expirada: false })
    window.location.hash = ""
  }

  if (acceso.fase === "cargando") return <div className="arranque" aria-busy="true" />

  if (acceso.fase === "login") {
    return (
      <Login
        expirada={acceso.expirada}
        onEntrar={(u) => {
          setUsuario(u)
          setAcceso({ fase: "dentro", modo })
        }}
      />
    )
  }

  const esAdmin = acceso.modo === "abierto" || usuario?.rol === "admin"
  return (
    <>
      <Espacio
        usuario={usuario}
        esAdmin={esAdmin}
        oculto={ruta === "observatorio"}
        onSalir={acceso.modo === "abierto" ? null : salir}
      />
      {ruta === "observatorio" && <Observatorio esAdmin={esAdmin} />}
    </>
  )
}
