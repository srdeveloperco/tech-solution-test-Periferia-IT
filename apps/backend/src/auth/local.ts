/** Autenticación local (desarrollo o respaldo): un usuario en variables de entorno y token HMAC-SHA256. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { RespuestaLogin, UsuarioDto } from "@oc/contracts"
import type { Autenticador } from "./tipos"

export type ConfigLocal = { usuario: string; clave: string; secreto?: string; nombre?: string }

const DURACION_MS = 8 * 60 * 60 * 1000

type CargaToken = { email: string; nombre: string | null; exp: number }

const b64url = (dato: Buffer | string) => Buffer.from(dato).toString("base64url")

/** Igualdad en tiempo constante (compara digests de igual longitud). */
function iguales(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

function esCarga(valor: unknown): valor is CargaToken {
  if (typeof valor !== "object" || valor === null) return false
  const v = valor as Record<string, unknown>
  return typeof v.email === "string" && typeof v.exp === "number" && (v.nombre === null || typeof v.nombre === "string")
}

export function crearAutenticadorLocal(config: ConfigLocal): Autenticador {
  const secreto = config.secreto && config.secreto.length >= 16 ? config.secreto : randomBytes(32).toString("hex")
  const firmar = (carga: string) => createHmac("sha256", secreto).update(carga).digest("base64url")

  function emitir(usuario: UsuarioDto): { token: string; expiraEn: number } {
    const expiraEn = Date.now() + DURACION_MS
    const carga = b64url(JSON.stringify({ email: usuario.email, nombre: usuario.nombre, exp: expiraEn }))
    return { token: `${carga}.${firmar(carga)}`, expiraEn }
  }

  async function verificar(token: string): Promise<UsuarioDto | null> {
    const [carga, firma] = token.split(".")
    if (!carga || !firma || !iguales(firma, firmar(carga))) return null
    try {
      const datos: unknown = JSON.parse(Buffer.from(carga, "base64url").toString("utf8"))
      if (!esCarga(datos) || datos.exp < Date.now()) return null
      return { email: datos.email, nombre: datos.nombre, rol: "admin" }
    } catch {
      return null
    }
  }

  async function login(usuario: string, clave: string): Promise<RespuestaLogin> {
    const usuarioOk = iguales(usuario.trim().toLowerCase(), config.usuario.trim().toLowerCase())
    const claveOk = iguales(clave, config.clave)
    if (!usuarioOk || !claveOk) return { ok: false, error: "Usuario o contraseña incorrectos." }
    const perfil: UsuarioDto = { email: config.usuario, nombre: config.nombre ?? null, rol: "admin" }
    return { ok: true, ...emitir(perfil), usuario: perfil }
  }

  return { login, verificar }
}
