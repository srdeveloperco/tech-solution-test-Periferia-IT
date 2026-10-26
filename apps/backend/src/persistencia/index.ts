/** Persistencia de aplicación: una base SQLite (`<out>/oc.db`) con migraciones versionadas. */
export { abrirBaseDatos, migrar } from "./base"
export { MIGRACIONES, type Migracion } from "./migraciones"
export { AlmacenSesionesSqlite } from "./sesiones"
