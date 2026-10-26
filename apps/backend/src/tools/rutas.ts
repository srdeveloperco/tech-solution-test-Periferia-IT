import { join } from "node:path"

const CASO_VALIDO = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Evita rutas arbitrarias: el caso es un nombre de carpeta simple. */
export function casoValido(caso: string): boolean {
  return CASO_VALIDO.test(caso)
}

export function rutas(directory: string) {
  const fixtures = join(directory, "fixtures", "reto-03")
  const out = process.env.OUT_DIR ? process.env.OUT_DIR : join(directory, "out")
  return {
    fixtures,
    maestros: join(fixtures, "maestros"),
    solicitudes: join(fixtures, "solicitudes"),
    caso: (caso: string) => join(fixtures, "solicitudes", caso),
    out,
    outCaso: (caso: string) => join(out, caso),
    sap: join(out, "sap"),
    control: join(out, "control.csv"),
    log: join(out, "log.jsonl"),
  }
}
