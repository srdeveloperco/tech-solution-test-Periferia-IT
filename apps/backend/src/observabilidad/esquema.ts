/** DDL del observatorio (SQLite). Idempotente: se ejecuta en cada arranque. */
export const ESQUEMA = `
CREATE TABLE IF NOT EXISTS interacciones (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  usuario TEXT,
  ts TEXT NOT NULL,
  mensaje_usuario TEXT NOT NULL,
  ruta TEXT,
  agente TEXT,
  intencion TEXT,
  caso TEXT,
  respuesta TEXT,
  resultado TEXT,
  ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_interacciones_ts ON interacciones (ts);
CREATE INDEX IF NOT EXISTS idx_interacciones_sesion ON interacciones (session_id);

CREATE TABLE IF NOT EXISTS prompts (
  hash TEXT PRIMARY KEY,
  agente TEXT NOT NULL,
  texto TEXT NOT NULL,
  primera_vez TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llamadas_llm (
  id TEXT PRIMARY KEY,
  interaccion_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  agente TEXT NOT NULL,
  proveedor TEXT NOT NULL,
  modelo TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  mensajes TEXT,
  herramientas TEXT,
  variables TEXT,
  respuesta TEXT,
  stop_reason TEXT,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida INTEGER NOT NULL DEFAULT 0,
  tokens_cache_lectura INTEGER NOT NULL DEFAULT 0,
  tokens_cache_escritura INTEGER NOT NULL DEFAULT 0,
  costo_usd REAL NOT NULL DEFAULT 0,
  ms INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_llamadas_interaccion ON llamadas_llm (interaccion_id);
CREATE INDEX IF NOT EXISTS idx_llamadas_ts ON llamadas_llm (ts);

CREATE TABLE IF NOT EXISTS ejecuciones_herramienta (
  id TEXT PRIMARY KEY,
  interaccion_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  agente TEXT NOT NULL,
  nombre TEXT NOT NULL,
  args TEXT,
  resultado TEXT,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_herramientas_interaccion ON ejecuciones_herramienta (interaccion_id);
CREATE INDEX IF NOT EXISTS idx_herramientas_ts ON ejecuciones_herramienta (ts);
`

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
