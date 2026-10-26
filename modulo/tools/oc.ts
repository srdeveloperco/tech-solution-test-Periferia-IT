/**
 * Herramientas del agente de órdenes de compra, importables sin el servidor HTTP.
 * Son exactamente las de la aplicación (reexport, no copia): oc_leer_paquete, oc_validar,
 * oc_construir_payload, oc_generar_evidencia y oc_crear. Contrato: execute(args, { directory, sessionId }).
 */
export * from "../../apps/backend/src/tools/oc"
export type { ToolContext, ToolDef } from "../../apps/backend/src/tools/tipos"
