import { join, resolve } from "node:path"
import { AlmacenSesiones, cargarConfig, crearOrquestador, crearProveedor } from "./agent"
import { crearAuth, soloAdmin } from "./auth"
import { crearObservador, rutasObservatorio } from "./observabilidad"
import { crearApp } from "./server/app"
import { rutas } from "./tools"

/** Punto de entrada: compone dependencias (proveedor, observador, auth) y levanta el servidor HTTP. */
const raiz = resolve(import.meta.dir, "..", "..", "..")
const env = process.env
const config = cargarConfig(env)
const llm = crearProveedor(config, env)
const observador = crearObservador(raiz)
// Único lugar donde se crea el almacén de sesiones (aquí se conecta la implementación SQLite).
const almacen = new AlmacenSesiones(() => rutas(raiz).out)
const orquestador = crearOrquestador({ directory: raiz, llm, config, observador, almacen })
const auth = crearAuth(env)

const app = crearApp({
  directory: raiz,
  orquestador,
  observador,
  distWeb: join(raiz, "apps", "web", "dist"),
  auth: { rutas: auth.rutas, middleware: auth.middleware, soloAdmin },
  observatorio: rutasObservatorio(observador),
})

const puerto = Number(env.PORT ?? 8080)
Bun.serve({ port: puerto, fetch: app.fetch, idleTimeout: 255 })
console.log(
  `[api] escuchando en :${puerto} · proveedor=${llm.proveedor} · operador=${config.modelos.operador} · router=${config.modelos.router} · auth=${auth.modo}`,
)
