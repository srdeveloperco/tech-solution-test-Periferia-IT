/** Límite simple de intentos de login por IP (ventana fija en memoria). */

export type Limitador = { permitir(clave: string): boolean; reiniciar(clave: string): void }

export function crearLimitador(maximo = 10, ventanaMs = 5 * 60 * 1000): Limitador {
  const intentos = new Map<string, { conteo: number; desde: number }>()

  function limpiar(ahora: number): void {
    if (intentos.size < 1000) return
    for (const [clave, registro] of intentos) {
      if (ahora - registro.desde > ventanaMs) intentos.delete(clave)
    }
  }

  return {
    permitir(clave) {
      const ahora = Date.now()
      limpiar(ahora)
      const registro = intentos.get(clave)
      if (!registro || ahora - registro.desde > ventanaMs) {
        intentos.set(clave, { conteo: 1, desde: ahora })
        return true
      }
      registro.conteo += 1
      return registro.conteo <= maximo
    },
    reiniciar(clave) {
      intentos.delete(clave)
    },
  }
}
