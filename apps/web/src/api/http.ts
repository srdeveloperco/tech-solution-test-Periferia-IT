import { demoFetch } from "../demo/api"

// ── Almacenamiento local tolerante a fallos (modo privado, cookies bloqueadas) ──

export const almacen = {
  leer(clave: string): string | null {
    try {
      return window.localStorage.getItem(clave)
    } catch {
      return null
    }
  },
  escribir(clave: string, valor: string): void {
    try {
      window.localStorage.setItem(clave, valor)
    } catch {
      // sin almacenamiento: la app sigue funcionando en memoria
    }
  },
  borrar(clave: string): void {
    try {
      window.localStorage.removeItem(clave)
    } catch {
      // idem
    }
  },
}

export const CLAVES = { token: "oc.token", usuario: "oc.usuario", sesion: "oc.sessionId" } as const

// ── Modo demo (?demo=sol-004): todo se sirve desde datos grabados, sin backend ──

const parametros = new URLSearchParams(window.location.search)
const demo = parametros.get("demo")

export function modoDemo(): string | null {
  return demo
}

export function parametro(nombre: string): string | null {
  return parametros.get(nombre)
}

// ── Token y sesión expirada ──

let token: string | null = almacen.leer(CLAVES.token)
const oyentesExpiracion = new Set<() => void>()

export function guardarToken(nuevo: string | null): void {
  token = nuevo
  if (nuevo) almacen.escribir(CLAVES.token, nuevo)
  else almacen.borrar(CLAVES.token)
}

export function hayToken(): boolean {
  return token !== null
}

export function alExpirarSesion(oyente: () => void): () => void {
  oyentesExpiracion.add(oyente)
  return () => oyentesExpiracion.delete(oyente)
}

export class ErrorApi extends Error {
  readonly estado: number
  constructor(estado: number, mensaje: string) {
    super(mensaje)
    this.estado = estado
  }
}

async function mensajeDeError(respuesta: Response): Promise<string> {
  try {
    const cuerpo: unknown = await respuesta.json()
    if (typeof cuerpo === "object" && cuerpo !== null && "error" in cuerpo && typeof cuerpo.error === "string") {
      return cuerpo.error
    }
  } catch {
    // cuerpo no JSON
  }
  if (respuesta.status === 429) return "Demasiadas solicitudes seguidas. Espera un momento."
  if (respuesta.status >= 500) return "El servidor tuvo un problema. Intenta de nuevo."
  return `La solicitud falló (${respuesta.status}).`
}

/** fetch con `Authorization: Bearer` en todas las rutas /api. Ante 401 avisa para volver al login. */
export async function apiFetch(ruta: string, init: RequestInit = {}): Promise<Response> {
  if (demo) return demoFetch(ruta, init)
  const cabeceras = new Headers(init.headers)
  if (token) cabeceras.set("Authorization", `Bearer ${token}`)
  const respuesta = await fetch(ruta, { ...init, headers: cabeceras })
  if (respuesta.status === 401 && !ruta.startsWith("/api/auth/")) {
    guardarToken(null)
    for (const oyente of oyentesExpiracion) oyente()
  }
  return respuesta
}

export async function apiJson<T>(ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await apiFetch(ruta, init)
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, await mensajeDeError(respuesta))
  return (await respuesta.json()) as T
}

export async function errorDe(respuesta: Response): Promise<ErrorApi> {
  return new ErrorApi(respuesta.status, await mensajeDeError(respuesta))
}

/** Descarga autenticada: fetch + blob, para no exponer el token en la URL. */
export async function descargar(ruta: string, nombreArchivo: string): Promise<void> {
  const respuesta = await apiFetch(ruta)
  if (!respuesta.ok) throw await errorDe(respuesta)
  const blob = await respuesta.blob()
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
