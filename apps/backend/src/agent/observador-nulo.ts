import type { PresupuestoDto } from "@oc/contracts"
import type { Observador, PermisoGasto } from "../observabilidad/tipos"

/**
 * Observador en memoria (Null Object): respeta el presupuesto pero no persiste nada.
 * Útil para scripts locales; en el servidor se inyecta el observador SQLite.
 */
export function crearObservadorEnMemoria(limiteUsd: number): Observador {
  let gastado = 0
  const presupuesto = (): PresupuestoDto => ({
    limiteUsd,
    gastadoUsd: gastado,
    restanteUsd: Math.max(0, limiteUsd - gastado),
    bloqueado: gastado >= limiteUsd,
  })
  return {
    iniciarInteraccion: () => crypto.randomUUID(),
    registrarRuta: () => {},
    registrarLlamadaLlm: (d) => {
      gastado += d.costoUsd
    },
    registrarHerramienta: () => {},
    cerrarInteraccion: () => {},
    puedeGastar: (estimado): PermisoGasto =>
      gastado + estimado <= limiteUsd
        ? { permitido: true }
        : { permitido: false, motivo: "Se alcanzó el límite de gasto en IA de esta cuenta de prueba." },
    presupuesto,
    resumen: () => ({
      presupuesto: presupuesto(),
      totales: {
        interacciones: 0,
        llamadasLlm: 0,
        tokensEntrada: 0,
        tokensSalida: 0,
        costoUsd: gastado,
        costoPromedioInteraccionUsd: 0,
        latenciaP50Ms: 0,
        latenciaP95Ms: 0,
      },
      porModelo: [],
      porAgente: [],
      prompts: [],
    }),
    interacciones: () => [],
    interaccion: () => null,
  }
}
