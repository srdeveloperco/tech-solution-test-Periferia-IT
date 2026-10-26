import type {
  ConfigAuth,
  ConversacionResumen,
  PresupuestoDto,
  RespuestaLogin,
  SaludDto,
  SesionDto,
} from "@oc/contracts"
import { BANDEJA_DEMO, CASOS_DEMO, presupuestoDemo } from "./datos"
import { turnoConfirmar, turnoProcesar, visibleDeTurno } from "./grabaciones"
import { detalleDemo, INTERACCIONES_DEMO, resumenDemo } from "./observatorio"

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } })

const pausa = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

function presupuesto(): PresupuestoDto {
  const { limiteUsd, gastadoUsd } = presupuestoDemo
  return { limiteUsd, gastadoUsd, restanteUsd: Math.max(0, limiteUsd - gastadoUsd), bloqueado: gastadoUsd >= limiteUsd }
}

function evidenciaTxt(caso: string): string {
  const d = CASOS_DEMO[caso]
  if (!d?.paquete.aprobacion) return "Sin evidencia"
  const a = d.paquete.aprobacion
  return `De: ${a.de}\nFecha: ${a.fecha}\nAsunto: RE: Solicitud de orden de compra ${d.paquete.solicitud.solicitud_id}\n\n${a.texto}\n\nsha256: ${d.evidencia.sha256}\n`
}

const CONVERSACIONES_DEMO: ConversacionResumen[] = [
  {
    sessionId: "ses_demo_004",
    titulo: "Procesa la solicitud sol-004 y no la crees hasta que confirme",
    creada: new Date(Date.now() - 50 * 60_000).toISOString(),
    actualizada: new Date(Date.now() - 46 * 60_000).toISOString(),
    mensajes: 4,
    casos: ["sol-004"],
    costoUsd: 0.053,
  },
  {
    sessionId: "ses_demo_001",
    titulo: "Procesa la solicitud sol-001",
    creada: new Date(Date.now() - 26 * 3600_000).toISOString(),
    actualizada: new Date(Date.now() - 26 * 3600_000).toISOString(),
    mensajes: 2,
    casos: ["sol-001"],
    costoUsd: 0.0318,
  },
]

function sesionDemo(id: string): SesionDto | null {
  if (id === "ses_demo_001") {
    const t = turnoProcesar("sol-001")
    return t
      ? {
          sessionId: id,
          mensajes: visibleDeTurno("Procesa la solicitud sol-001", t, CONVERSACIONES_DEMO[1]?.creada ?? ""),
        }
      : null
  }
  if (id === "ses_demo_004") {
    const a = turnoProcesar("sol-004")
    const b = turnoConfirmar("sol-004")
    if (!a || !b) return null
    const ts = CONVERSACIONES_DEMO[0]?.creada ?? ""
    return {
      sessionId: id,
      mensajes: [
        ...visibleDeTurno("Procesa la solicitud sol-004 y no la crees hasta que confirme", a, ts),
        ...visibleDeTurno("Confirmo", b, ts),
      ],
    }
  }
  return null
}

function rolDemo(): string | null {
  try {
    const crudo = window.localStorage.getItem("oc.usuario")
    const valor: unknown = crudo ? JSON.parse(crudo) : null
    return typeof valor === "object" && valor !== null && "rol" in valor ? String(valor.rol) : null
  } catch {
    return null
  }
}

/** API simulada del modo demostración: mismas rutas y formas que el backend real. */
export async function demoFetch(ruta: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(ruta, window.location.origin)
  const camino = url.pathname
  const metodo = (init.method ?? "GET").toUpperCase()
  const parametros = new URLSearchParams(window.location.search)

  if (camino === "/api/auth/config") {
    const config: ConfigAuth = { modo: parametros.has("login") ? "local" : "abierto" }
    return json(config)
  }
  if (camino === "/api/auth/login" && metodo === "POST") {
    await pausa(700)
    const cuerpo: unknown = typeof init.body === "string" ? JSON.parse(init.body) : {}
    const clave = typeof cuerpo === "object" && cuerpo !== null && "clave" in cuerpo ? String(cuerpo.clave) : ""
    const usuario = typeof cuerpo === "object" && cuerpo !== null && "usuario" in cuerpo ? String(cuerpo.usuario) : ""
    const respuesta: RespuestaLogin =
      clave === "error" || clave.length < 4
        ? { ok: false, error: "El usuario o la contraseña no coinciden." }
        : {
            ok: true,
            token: "demo-token",
            expiraEn: Date.now() + 8 * 3600_000,
            usuario: { email: usuario, nombre: null, rol: usuario.includes("analista") ? "analista" : "admin" },
          }
    return json(respuesta, respuesta.ok ? 200 : 401)
  }
  if (camino === "/api/health") {
    const salud: SaludDto = {
      ok: true,
      provider: "demo",
      model: "claude-sonnet-5-5",
      modelos: { router: "claude-haiku-5-5", operador: "claude-sonnet-5-5", asesor: "claude-haiku-5-5" },
    }
    return json(salud)
  }
  if (camino === "/api/casos") return json(BANDEJA_DEMO)
  if (camino === "/api/presupuesto") return json(presupuesto())
  if (camino.startsWith("/api/observatorio") && rolDemo() === "analista") {
    return json({ error: "Solo los administradores pueden ver el observatorio." }, 403)
  }
  if (camino === "/api/observatorio/resumen") return json(resumenDemo(presupuesto()))
  if (camino === "/api/observatorio/interacciones") return json(INTERACCIONES_DEMO)
  if (camino.startsWith("/api/observatorio/interacciones/")) {
    const detalle = detalleDemo(decodeURIComponent(camino.split("/").at(-1) ?? ""))
    return detalle ? json(detalle) : json({ error: "No existe esa interacción" }, 404)
  }
  if (camino === "/api/control") {
    const csv =
      "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts\nSOL-2026-001,creada,4500000001,false,,,2026-10-26T15:34:05-05:00\nSOL-2026-002,bloqueada,,false,RC1,,2026-10-26T15:36:20-05:00\n"
    return new Response(csv, { headers: { "content-type": "text/csv" } })
  }
  if (camino.startsWith("/api/evidencia/")) {
    const caso = decodeURIComponent(camino.split("/").at(-1) ?? "")
    return new Response(evidenciaTxt(caso), { headers: { "content-type": "text/plain" } })
  }
  if (camino === "/api/sessions") return json(CONVERSACIONES_DEMO)
  if (camino.startsWith("/api/sessions/")) {
    const sesion = sesionDemo(decodeURIComponent(camino.split("/").at(-1) ?? ""))
    return sesion ? json(sesion) : json({ error: "Sesión no encontrada" }, 404)
  }
  return json({ error: `Ruta no disponible en la demostración: ${camino}` }, 404)
}
