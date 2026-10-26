/**
 * Autenticación del backend. Modos (AUTH_MODO):
 * - "cognito": Amazon Cognito (COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID).
 * - "local": un usuario en env (AUTH_USUARIO, AUTH_CLAVE, AUTH_SECRETO opcional) con token HMAC de 8 h.
 * - "abierto": sin login; solo si se pide explícitamente y NODE_ENV no es production.
 * Falla cerrado: si el modo pedido está incompleto, nadie entra (nunca degrada a "abierto").
 */
import type { ConfigAuth, RespuestaLogin, UsuarioDto } from "@oc/contracts"
import type { Context, MiddlewareHandler } from "hono"
import { Hono } from "hono"
import { crearAutenticadorCognito } from "./cognito"
import { crearLimitador } from "./limitador"
import { crearAutenticadorLocal } from "./local"
import type { Autenticador, EntornoAuth, ModoAuth } from "./tipos"

export type { Autenticador, EntornoAuth, ModoAuth, VariablesAuth } from "./tipos"

type Entorno = Record<string, string | undefined>

export type Auth = {
  modo: ModoAuth
  /** Montar en /api/auth: GET /config, POST /login, GET /yo. */
  rutas: Hono<EntornoAuth>
  /** Aplicar a /api/* excepto /api/health y /api/auth/*. Deja `c.get("usuario")`. */
  middleware: MiddlewareHandler<EntornoAuth>
}

const MAX_CAMPO = 256

/** Autenticador que nunca deja entrar: se usa cuando el login pedido no está configurado (falla cerrado). */
function autenticadorCerrado(motivo: string): Autenticador {
  return {
    login: async () => ({
      ok: false,
      error: `El inicio de sesión no está disponible: ${motivo}. Avísale al administrador.`,
    }),
    verificar: async () => null,
  }
}

/**
 * Elige el modo de login. Nunca degrada a "abierto": si el modo pedido está incompleto, falla cerrado
 * (nadie entra) y lo avisa. "abierto" solo existe si se pide explícitamente y fuera de producción.
 */
function elegirAutenticador(env: Entorno): { modo: ModoAuth; autenticador: Autenticador | null } {
  const pedido = (env.AUTH_MODO ?? "").trim().toLowerCase()
  const region = env.COGNITO_REGION ?? env.AWS_REGION
  const cognitoListo = Boolean(region && env.COGNITO_USER_POOL_ID && env.COGNITO_CLIENT_ID)
  const localListo = Boolean(env.AUTH_USUARIO && env.AUTH_CLAVE)
  const produccion = env.NODE_ENV === "production"

  if (pedido === "abierto" && !produccion) return { modo: "abierto", autenticador: null }
  if ((pedido === "cognito" || pedido === "") && cognitoListo && region) {
    const config = { region, userPoolId: env.COGNITO_USER_POOL_ID ?? "", clientId: env.COGNITO_CLIENT_ID ?? "" }
    return { modo: "cognito", autenticador: crearAutenticadorCognito(config) }
  }
  if ((pedido === "local" || pedido === "") && localListo) {
    const config = { usuario: env.AUTH_USUARIO ?? "", clave: env.AUTH_CLAVE ?? "", secreto: env.AUTH_SECRETO }
    return { modo: "local", autenticador: crearAutenticadorLocal(config) }
  }
  const motivo =
    pedido === "abierto"
      ? "AUTH_MODO=abierto no se permite en producción"
      : pedido === "cognito"
        ? "faltan COGNITO_REGION, COGNITO_USER_POOL_ID o COGNITO_CLIENT_ID"
        : pedido === "local"
          ? "faltan AUTH_USUARIO o AUTH_CLAVE"
          : "no hay AUTH_MODO configurado"
  console.error(`[auth] ${motivo}. Login cerrado: nadie puede entrar hasta corregir la configuración.`)
  return { modo: pedido === "cognito" ? "cognito" : "local", autenticador: autenticadorCerrado(motivo) }
}

function ipCliente(c: Context): string {
  const reenviada = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  return reenviada || c.req.header("x-real-ip") || "desconocida"
}

function tokenDe(c: Context): string | null {
  const cabecera = c.req.header("authorization")
  const m = cabecera ? /^Bearer\s+(.+)$/i.exec(cabecera.trim()) : null
  if (m?.[1]) return m[1].trim()
  // Respaldo para descargas por enlace (GET): ?token=...
  return c.req.method === "GET" ? (c.req.query("token") ?? null) : null
}

async function leerCredenciales(c: Context): Promise<{ usuario: string; clave: string } | null> {
  try {
    const cuerpo: unknown = await c.req.json()
    if (typeof cuerpo !== "object" || cuerpo === null) return null
    const { usuario, clave } = cuerpo as Record<string, unknown>
    if (typeof usuario !== "string" || typeof clave !== "string") return null
    if (!usuario.trim() || !clave || usuario.length > MAX_CAMPO || clave.length > MAX_CAMPO) return null
    return { usuario: usuario.trim(), clave }
  } catch {
    return null
  }
}

function crearRutas(modo: ModoAuth, autenticador: Autenticador | null): Hono<EntornoAuth> {
  const rutas = new Hono<EntornoAuth>()
  const limitador = crearLimitador()

  rutas.get("/config", (c) => c.json<ConfigAuth>({ modo }))

  rutas.post("/login", async (c) => {
    if (!autenticador) {
      return c.json<RespuestaLogin>({ ok: false, error: "Este entorno no requiere inicio de sesión." }, 400)
    }
    const ip = ipCliente(c)
    if (!limitador.permitir(ip)) {
      return c.json<RespuestaLogin>({ ok: false, error: "Demasiados intentos. Espera unos minutos." }, 429)
    }
    const credenciales = await leerCredenciales(c)
    if (!credenciales) return c.json<RespuestaLogin>({ ok: false, error: "Escribe tu usuario y contraseña." }, 400)
    const respuesta = await autenticador.login(credenciales.usuario, credenciales.clave)
    if (respuesta.ok) limitador.reiniciar(ip)
    return c.json<RespuestaLogin>(respuesta, respuesta.ok ? 200 : 401)
  })

  rutas.get("/yo", async (c) => {
    if (!autenticador) return c.json<{ ok: true; usuario: UsuarioDto | null }>({ ok: true, usuario: null })
    const token = tokenDe(c)
    const usuario = token ? await autenticador.verificar(token) : null
    if (!usuario) return c.json({ ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401)
    return c.json({ ok: true, usuario })
  })

  return rutas
}

function crearMiddleware(autenticador: Autenticador | null): MiddlewareHandler<EntornoAuth> {
  return async (c, next) => {
    if (!autenticador) {
      c.set("usuario", null)
      return next()
    }
    const token = tokenDe(c)
    if (!token) return c.json({ ok: false, error: "Inicia sesión para continuar." }, 401)
    const usuario = await autenticador.verificar(token)
    if (!usuario) return c.json({ ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401)
    c.set("usuario", usuario)
    return next()
  }
}

/** Restringe una ruta al rol "admin" (observatorio, costos, prompts). En modo abierto (solo desarrollo) deja pasar. */
export const soloAdmin: MiddlewareHandler<EntornoAuth> = async (c, next) => {
  const usuario = c.get("usuario")
  if (usuario && usuario.rol !== "admin") {
    return c.json({ ok: false, error: "Esta sección es solo para administradores." }, 403)
  }
  return next()
}

export function crearAuth(env: Entorno): Auth {
  const { modo, autenticador } = elegirAutenticador(env)
  return { modo, rutas: crearRutas(modo, autenticador), middleware: crearMiddleware(autenticador) }
}
