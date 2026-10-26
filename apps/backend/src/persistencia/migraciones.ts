/**
 * Migraciones versionadas de la base de aplicación (SQLite). Solo se agregan al final:
 * una migración aplicada nunca se edita. Cada una corre en su propia transacción.
 */
export type Migracion = { version: number; nombre: string; sql: string }

const OBSERVATORIO = `
CREATE TABLE interacciones (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  usuario TEXT,
  ts TEXT NOT NULL,
  mensaje_usuario TEXT NOT NULL,
  ruta TEXT CHECK (ruta IS NULL OR json_valid(ruta)),
  agente TEXT,
  intencion TEXT,
  caso TEXT,
  respuesta TEXT,
  resultado TEXT CHECK (resultado IS NULL OR resultado IN ('ok', 'error', 'confirmacion', 'bloqueado_presupuesto')),
  ms INTEGER CHECK (ms IS NULL OR ms >= 0)
);
CREATE INDEX idx_interacciones_ts ON interacciones (ts);
CREATE INDEX idx_interacciones_sesion ON interacciones (session_id);

CREATE TABLE prompts (
  hash TEXT PRIMARY KEY,
  agente TEXT NOT NULL,
  texto TEXT NOT NULL,
  primera_vez TEXT NOT NULL
);

CREATE TABLE llamadas_llm (
  id TEXT PRIMARY KEY,
  interaccion_id TEXT NOT NULL REFERENCES interacciones (id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  agente TEXT NOT NULL,
  proveedor TEXT NOT NULL,
  modelo TEXT NOT NULL,
  prompt_hash TEXT NOT NULL REFERENCES prompts (hash),
  mensajes TEXT,
  herramientas TEXT,
  variables TEXT,
  respuesta TEXT,
  stop_reason TEXT,
  tokens_entrada INTEGER NOT NULL DEFAULT 0 CHECK (tokens_entrada >= 0),
  tokens_salida INTEGER NOT NULL DEFAULT 0 CHECK (tokens_salida >= 0),
  tokens_cache_lectura INTEGER NOT NULL DEFAULT 0 CHECK (tokens_cache_lectura >= 0),
  tokens_cache_escritura INTEGER NOT NULL DEFAULT 0 CHECK (tokens_cache_escritura >= 0),
  costo_usd REAL NOT NULL DEFAULT 0 CHECK (costo_usd >= 0),
  ms INTEGER NOT NULL DEFAULT 0 CHECK (ms >= 0),
  error TEXT
);
CREATE INDEX idx_llamadas_interaccion ON llamadas_llm (interaccion_id);
CREATE INDEX idx_llamadas_ts ON llamadas_llm (ts);
CREATE INDEX idx_llamadas_prompt ON llamadas_llm (prompt_hash);

CREATE TABLE ejecuciones_herramienta (
  id TEXT PRIMARY KEY,
  interaccion_id TEXT NOT NULL REFERENCES interacciones (id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  agente TEXT NOT NULL,
  nombre TEXT NOT NULL,
  args TEXT,
  resultado TEXT,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  ms INTEGER NOT NULL DEFAULT 0 CHECK (ms >= 0)
);
CREATE INDEX idx_herramientas_interaccion ON ejecuciones_herramienta (interaccion_id);
CREATE INDEX idx_herramientas_ts ON ejecuciones_herramienta (ts);
`

const CONVERSACIONAL = `
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY CHECK (length(id) > 0 AND id = lower(id)),
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'analista' CHECK (rol IN ('admin', 'analista')),
  creado TEXT NOT NULL,
  ultimo_acceso TEXT
);

CREATE TABLE conversaciones (
  id TEXT PRIMARY KEY,
  usuario_id TEXT REFERENCES usuarios (id) ON DELETE SET NULL,
  titulo TEXT NOT NULL DEFAULT '',
  creada TEXT NOT NULL,
  actualizada TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'archivada')),
  tokens_usados INTEGER NOT NULL DEFAULT 0 CHECK (tokens_usados >= 0),
  costo_usd REAL NOT NULL DEFAULT 0 CHECK (costo_usd >= 0)
);
CREATE INDEX idx_conversaciones_usuario ON conversaciones (usuario_id, actualizada DESC);

CREATE TABLE mensajes (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES conversaciones (id) ON DELETE CASCADE,
  secuencia INTEGER NOT NULL CHECK (secuencia >= 0),
  rol TEXT NOT NULL CHECK (rol IN ('usuario', 'agente')),
  texto TEXT NOT NULL,
  ts TEXT NOT NULL,
  interaccion_id TEXT REFERENCES interacciones (id) ON DELETE SET NULL,
  ruta TEXT CHECK (ruta IS NULL OR json_valid(ruta)),
  confirmacion TEXT CHECK (confirmacion IS NULL OR json_valid(confirmacion)),
  tool_calls TEXT CHECK (tool_calls IS NULL OR json_valid(tool_calls)),
  UNIQUE (conversacion_id, secuencia)
);
CREATE INDEX idx_mensajes_interaccion ON mensajes (interaccion_id);

CREATE TABLE casos_conversacion (
  conversacion_id TEXT NOT NULL REFERENCES conversaciones (id) ON DELETE CASCADE,
  caso TEXT NOT NULL,
  resultado TEXT CHECK (
    resultado IS NULL OR resultado IN ('creada', 'idempotente', 'bloqueada', 'pendiente', 'validado', 'error')
  ),
  numero_oc TEXT,
  apta INTEGER CHECK (apta IS NULL OR apta IN (0, 1)),
  retroactiva INTEGER NOT NULL DEFAULT 0 CHECK (retroactiva IN (0, 1)),
  bloqueos TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(bloqueos)),
  confirmaciones TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(confirmaciones)),
  orden TEXT CHECK (orden IS NULL OR json_valid(orden)),
  evidencia_pdf TEXT,
  actualizado TEXT NOT NULL,
  PRIMARY KEY (conversacion_id, caso)
);
CREATE INDEX idx_casos_caso ON casos_conversacion (caso);
CREATE INDEX idx_casos_numero_oc ON casos_conversacion (numero_oc) WHERE numero_oc IS NOT NULL;

CREATE TABLE confirmaciones (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES conversaciones (id) ON DELETE CASCADE,
  caso TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'otorgada', 'consumida', 'descartada')),
  hallazgos TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hallazgos)),
  solicitada TEXT NOT NULL,
  resuelta TEXT,
  resuelta_por TEXT REFERENCES usuarios (id) ON DELETE SET NULL,
  interaccion_id TEXT REFERENCES interacciones (id) ON DELETE SET NULL,
  CHECK ((estado = 'pendiente') = (resuelta IS NULL))
);
-- A lo sumo una confirmación viva (pendiente u otorgada) por caso y conversación.
CREATE UNIQUE INDEX uq_confirmacion_viva ON confirmaciones (conversacion_id, caso)
  WHERE estado IN ('pendiente', 'otorgada');
CREATE INDEX idx_confirmaciones_estado ON confirmaciones (estado, solicitada);

ALTER TABLE interacciones ADD COLUMN conversacion_id TEXT REFERENCES conversaciones (id) ON DELETE SET NULL;
ALTER TABLE interacciones ADD COLUMN usuario_id TEXT REFERENCES usuarios (id) ON DELETE SET NULL;
CREATE INDEX idx_interacciones_conversacion ON interacciones (conversacion_id);
CREATE INDEX idx_interacciones_usuario ON interacciones (usuario_id, ts);
`

export const MIGRACIONES: readonly Migracion[] = [
  { version: 1, nombre: "observatorio", sql: OBSERVATORIO },
  { version: 2, nombre: "modelo_conversacional", sql: CONVERSACIONAL },
]
