/** Consultas del observatorio. El DDL vive en persistencia/migraciones.ts (migración 1). */

/** Agregados por interacción, reutilizado por la lista y el detalle. */
export const SELECT_INTERACCION = `
SELECT i.id, i.session_id, i.usuario, i.ts, i.mensaje_usuario, i.agente, i.intencion, i.caso,
       i.respuesta, i.resultado, i.ms, i.ruta,
       COALESCE(l.llamadas, 0) AS llamadas,
       COALESCE(l.tokens_entrada, 0) AS tokens_entrada,
       COALESCE(l.tokens_salida, 0) AS tokens_salida,
       COALESCE(l.costo, 0) AS costo,
       COALESCE(h.herramientas, 0) AS herramientas
FROM interacciones i
LEFT JOIN (
  SELECT interaccion_id, COUNT(*) AS llamadas, SUM(tokens_entrada) AS tokens_entrada,
         SUM(tokens_salida) AS tokens_salida, SUM(costo_usd) AS costo
  FROM llamadas_llm GROUP BY interaccion_id
) l ON l.interaccion_id = i.id
LEFT JOIN (
  SELECT interaccion_id, COUNT(*) AS herramientas FROM ejecuciones_herramienta GROUP BY interaccion_id
) h ON h.interaccion_id = i.id
`
