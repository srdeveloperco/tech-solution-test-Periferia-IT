import { join, resolve } from "node:path"
import { cargarConfig, crearOrquestador, crearProveedor } from "./agent"
import { crearAuth, soloAdmin } from "./auth"
import { crearObservador, rutasObservatorio } from "./observabilidad"
import { AlmacenSesionesSqlite, abrirBaseDatos } from "./persistencia"
import { crearApp } from "./server/app"

/** Punto de entrada: compone dependencias (proveedor, observador, auth) y levanta el servidor HTTP. */
const raiz = resolve(import.meta.dir, "..", "..", "..")
const env = process.env
const config = cargarConfig(env)
const llm = crearProveedor(config, env)
// Una sola conexión SQLite (<out>/oc.db, migraciones al día) compartida por observatorio y sesiones.
const db = abrirBaseDatos(raiz)
const observador = crearObservador(raiz, { db })
const almacen = new AlmacenSesionesSqlite(db)
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
