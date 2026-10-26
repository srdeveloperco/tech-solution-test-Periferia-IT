import type { ConfigAuth, RespuestaLogin, UsuarioDto } from "@oc/contracts"

export type ModoAuth = ConfigAuth["modo"]

/** Variables de Hono que deja el middleware: `c.get("usuario")`. */
export type VariablesAuth = { usuario: UsuarioDto | null }
export type EntornoAuth = { Variables: VariablesAuth }

/** Estrategia de autenticación (Cognito o local). */
export interface Autenticador {
  login(usuario: string, clave: string): Promise<RespuestaLogin>
  /** Devuelve el usuario si el token es válido; null si no lo es. Nunca lanza. */
  verificar(token: string): Promise<UsuarioDto | null>
}
