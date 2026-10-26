import type { EventoChat, PeticionChat } from "@oc/contracts"
import { type Context, Hono, type MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import type { Orquestador } from "../agent"
import type { EntornoAuth } from "../auth"
import type { Observador } from "../observabilidad/tipos"
import { casoValido, leerControlCsv, listarCasos, rutaEvidencia } from "../tools"
import { servirEstatico } from "./estaticos"
import { LimitePorIp } from "./limite"

type Entorno = EntornoAuth

export type OpcionesApp = {
  directory: string
  orquestador: Orquestador
  observador: Observador
  distWeb: string
  /** Autenticación obligatoria: rutas públicas (/api/auth), middleware que pone `usuario` y guarda de rol admin. */
  auth: { rutas: Hono<Entorno>; middleware: MiddlewareHandler<Entorno>; soloAdmin: MiddlewareHandler<Entorno> }
  /** Rutas del observatorio (/api/observatorio), solo para administradores. */
  observatorio: Hono
}

const PeticionChatEsquema = z.object({
  sessionId: z.string().max(64).optional(),
  message: z.string().trim().min(1, "El mensaje está vacío").max(4000, "El mensaje es demasiado largo"),
  confirmar: z.object({ caso: z.string().max(64) }).optional(),
})

const RUTAS_PUBLICAS = ["/api/health", "/api/auth"]

export function crearApp(o: OpcionesApp): Hono<Entorno> {
  const app = new Hono<Entorno>()
  const limite = new LimitePorIp(30, 60_000)

  app.onError((error, c) => {
    console.error("[api] error no controlado", error)
    return c.json({ ok: false, error: "Error interno del servidor." }, 500)
  })

  // Públicas: salud y login. Todo lo demás bajo /api exige sesión (falla cerrado).
  app.get("/api/health", (c) => c.json(o.orquestador.salud()))
  app.route("/api/auth", o.auth.rutas)
  app.use("/api/*", async (c, next) => {
    if (RUTAS_PUBLICAS.some((r) => c.req.path === r || c.req.path.startsWith(`${r}/`))) return next()
    return o.auth.middleware(c, next)
  })

  app.post("/api/chat", bodyLimit({ maxSize: 64 * 1024 }), (c) => chat(c, o, limite))
  app.get("/api/sessions", (c) => c.json(o.orquestador.conversaciones(c.get("usuario")?.email ?? null)))
  app.get("/api/sessions/:id", (c) => {
    const sesion = o.orquestador.sesion(c.req.param("id"), c.get("usuario")?.email ?? null)
    return sesion ? c.json(sesion) : c.json({ ok: false, error: "Sesión no encontrada" }, 404)
  })
  app.get("/api/casos", async (c) => c.json(await listarCasos(o.directory)))
  app.get("/api/control", async (c) => {
    c.header("Content-Type", "text/csv; charset=utf-8")
    c.header("Content-Disposition", 'attachment; filename="control.csv"')
    return c.body(await leerControlCsv(o.directory))
  })
  app.get("/api/evidencia/:caso", (c) => evidencia(c, o.directory))
  app.get("/api/presupuesto", (c) => c.json(o.observador.presupuesto()))
  app.use("/api/observatorio/*", o.auth.soloAdmin)
  app.route("/api/observatorio", o.observatorio)

  app.all("/api/*", (c) => c.json({ ok: false, error: "Ruta no encontrada" }, 404))
  app.get(
    "*",
    (c) => servirEstatico(o.distWeb, c.req.path) ?? c.text("Front no compilado. Ejecuta bun run build.", 404),
  )
  return app
}

function ipDe(c: Context<Entorno>): string {
  const reenviada = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  return reenviada || c.req.header("x-real-ip") || "local"
}

async function chat(c: Context<Entorno>, o: OpcionesApp, limite: LimitePorIp) {
  if (!limite.permitir(ipDe(c))) {
    return c.json({ ok: false, error: "Demasiados mensajes seguidos. Espera un minuto e inténtalo de nuevo." }, 429)
  }
  const cuerpo = PeticionChatEsquema.safeParse(await c.req.json().catch(() => null))
  if (!cuerpo.success) {
    return c.json({ ok: false, error: cuerpo.error.issues[0]?.message ?? "Petición inválida" }, 400)
  }
  const peticion: PeticionChat = cuerpo.data
  const usuario = c.get("usuario") ?? null
  const aceptaJson = (c.req.header("accept") ?? "").includes("application/json")
  if (aceptaJson) return c.json(await o.orquestador.procesarTurno(peticion, usuario, () => {}))
  c.header("X-Accel-Buffering", "no")
  return streamSSE(c, async (stream) => {
    let cola = Promise.resolve()
    const emitir = (evento: EventoChat) => {
      cola = cola.then(() => stream.writeSSE({ data: JSON.stringify(evento) })).catch(() => {})
    }
    const latido = setInterval(() => {
      cola = cola
        .then(() => stream.write(": latido\n\n"))
        .then(() => {})
        .catch(() => {})
    }, 10_000)
    try {
      await o.orquestador.procesarTurno(peticion, usuario, emitir)
    } finally {
      clearInterval(latido)
      await cola
    }
  })
}

async function evidencia(c: Context<Entorno>, directory: string) {
  const caso = c.req.param("caso")
  const formato = c.req.query("formato") === "txt" ? "txt" : "pdf"
  if (!casoValido(caso)) return c.json({ ok: false, error: "Caso inválido" }, 400)
  const ruta = await rutaEvidencia(directory, caso, formato)
  if (!ruta) return c.json({ ok: false, error: "La evidencia de ese caso aún no se ha generado" }, 404)
  const tipo = formato === "pdf" ? "application/pdf" : "text/plain; charset=utf-8"
  return new Response(Bun.file(ruta), {
    headers: { "Content-Type": tipo, "Content-Disposition": `inline; filename="aprobacion-${caso}.${formato}"` },
  })
}
