/** Conexión única a la base de aplicación (bun:sqlite) con migraciones versionadas. */
import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { rutas } from "../tools/rutas"
import { MIGRACIONES, type Migracion } from "./migraciones"

const conexiones = new Map<string, Database>()

function versionActual(db: Database): number {
  const fila = db.query<{ v: number | null }, []>("SELECT MAX(version) AS v FROM migraciones").get()
  return fila?.v ?? 0
}

/** Aplica en orden las migraciones pendientes; cada una en su transacción. Idempotente. */
export function migrar(db: Database, migraciones: readonly Migracion[] = MIGRACIONES): number[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS migraciones (version INTEGER PRIMARY KEY, nombre TEXT NOT NULL, aplicada TEXT NOT NULL)",
  )
  const desde = versionActual(db)
  const aplicadas: number[] = []
  for (const m of [...migraciones].sort((a, b) => a.version - b.version)) {
    if (m.version <= desde) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.query<unknown, Record<string, string | number>>(
        "INSERT INTO migraciones (version, nombre, aplicada) VALUES ($version, $nombre, $aplicada)",
      ).run({ version: m.version, nombre: m.nombre, aplicada: new Date().toISOString() })
    })()
    aplicadas.push(m.version)
  }
  return aplicadas
}

/**
 * Abre (o reutiliza) la base `<out>/oc.db`: WAL, claves foráneas activas y migraciones al día.
 * La misma ruta devuelve siempre la misma conexión (observatorio y sesiones la comparten).
 */
export function abrirBaseDatos(directory: string, archivo?: string): Database {
  const ruta = archivo ?? join(rutas(directory).out, "oc.db")
  const clave = ruta === ":memory:" ? ruta : resolve(ruta)
  const existente = ruta === ":memory:" ? undefined : conexiones.get(clave)
  if (existente) return existente
  if (ruta !== ":memory:") mkdirSync(dirname(clave), { recursive: true })
  const db = new Database(clave, { create: true, strict: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA foreign_keys = ON")
  db.run("PRAGMA busy_timeout = 3000")
  const aplicadas = migrar(db)
  if (aplicadas.length > 0) console.log(`[db] migraciones aplicadas en ${clave}: ${aplicadas.join(", ")}`)
  if (ruta !== ":memory:") conexiones.set(clave, db)
  return db
}
