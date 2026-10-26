/** Rutas HTTP de solo lectura del observatorio (se montan en /api/observatorio). */
import { Hono } from "hono"
import type { Observador } from "./tipos"

const LIMITE_POR_DEFECTO = 50
const LIMITE_MAXIMO = 200

function leerLimite(valor: string | undefined): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return LIMITE_POR_DEFECTO
  return Math.min(LIMITE_MAXIMO, Math.floor(n))
}

export function rutasObservatorio(observador: Observador): Hono {
  const app = new Hono()

  app.get("/resumen", (c) => c.json(observador.resumen()))

  app.get("/interacciones", (c) => c.json(observador.interacciones(leerLimite(c.req.query("limite")))))

  app.get("/interacciones/:id", (c) => {
    const detalle = observador.interaccion(c.req.param("id"))
    if (!detalle) return c.json({ ok: false, error: "No encontré esa interacción en el observatorio." }, 404)
    return c.json(detalle)
  })

  app.onError((error, c) => {
    console.error("[observatorio]", error instanceof Error ? error.message : String(error))
    return c.json({ ok: false, error: "El observatorio no pudo responder. Intenta de nuevo en unos segundos." }, 500)
  })

  return app
}
