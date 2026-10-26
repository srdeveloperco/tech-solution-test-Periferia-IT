/** Autenticación con Amazon Cognito: InitiateAuth (USER_PASSWORD_AUTH) + verificación del ID token. */
import type { RespuestaLogin, UsuarioDto } from "@oc/contracts"
import { CognitoJwtVerifier } from "aws-jwt-verify"
import type { Autenticador } from "./tipos"

export type ConfigCognito = { region: string; userPoolId: string; clientId: string }

type RespuestaInitiateAuth = {
  AuthenticationResult?: { IdToken?: string; ExpiresIn?: number }
  ChallengeName?: string
  __type?: string
  message?: string
}

const MENSAJES: Record<string, string> = {
  NotAuthorizedException: "Usuario o contraseña incorrectos.",
  UserNotFoundException: "Usuario o contraseña incorrectos.",
  UserNotConfirmedException: "Tu usuario aún no está confirmado. Pide al administrador que lo confirme.",
  PasswordResetRequiredException: "Debes restablecer tu contraseña. Pide al administrador que te asigne una nueva.",
  TooManyRequestsException: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  LimitExceededException: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  InvalidParameterException: "Revisa el usuario y la contraseña.",
  InvalidUserPoolConfigurationException:
    "El inicio de sesión no está bien configurado (Cognito). Avísale al administrador.",
}

const MENSAJE_RETO =
  "Tu usuario tiene una contraseña temporal. El administrador debe fijar una contraseña permanente " +
  "(admin-set-user-password --permanent) antes de entrar."

function tipoError(tipo: string | undefined): string {
  return (tipo ?? "").split("#").pop() ?? ""
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null
}

/** Datos visibles del usuario a partir del payload verificado del ID token. */
export function usuarioDesdePayload(payload: Record<string, unknown>): UsuarioDto {
  const email = texto(payload.email) ?? texto(payload["cognito:username"]) ?? texto(payload.sub) ?? "usuario"
  const grupos = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : []
  const rol = grupos.includes("admin") ? "admin" : "analista"
  return { email, nombre: texto(payload.name) ?? texto(payload.given_name), rol }
}

export function crearAutenticadorCognito(config: ConfigCognito): Autenticador {
  const verificador = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: "id",
    clientId: config.clientId,
  })
  const endpoint = `https://cognito-idp.${config.region}.amazonaws.com/`

  async function verificar(token: string): Promise<UsuarioDto | null> {
    try {
      const payload = await verificador.verify(token)
      return usuarioDesdePayload(payload as Record<string, unknown>)
    } catch {
      return null
    }
  }

  async function iniciarSesion(usuario: string, clave: string): Promise<RespuestaInitiateAuth> {
    const respuesta = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
      },
      body: JSON.stringify({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: config.clientId,
        AuthParameters: { USERNAME: usuario, PASSWORD: clave },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    return (await respuesta.json()) as RespuestaInitiateAuth
  }

  async function login(usuario: string, clave: string): Promise<RespuestaLogin> {
    let datos: RespuestaInitiateAuth
    try {
      datos = await iniciarSesion(usuario, clave)
    } catch {
      return { ok: false, error: "No pude conectar con el servicio de inicio de sesión. Intenta de nuevo." }
    }
    if (datos.ChallengeName) return { ok: false, error: MENSAJE_RETO }
    const idToken = datos.AuthenticationResult?.IdToken
    if (!idToken) {
      const tipo = tipoError(datos.__type)
      return { ok: false, error: MENSAJES[tipo] ?? "No fue posible iniciar sesión. Intenta de nuevo." }
    }
    const perfil = await verificar(idToken)
    if (!perfil) return { ok: false, error: "No pude validar tu sesión. Intenta de nuevo." }
    const expiraEn = Date.now() + (datos.AuthenticationResult?.ExpiresIn ?? 3600) * 1000
    return { ok: true, token: idToken, expiraEn, usuario: perfil }
  }

  return { login, verificar }
}
