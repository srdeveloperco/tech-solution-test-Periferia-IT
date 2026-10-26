/**
 * Repositorio de sesiones sobre SQLite: conversaciones, mensajes, memoria por caso y rastro de
 * confirmaciones humanas. Caché en memoria por sesión; si la base falla, el turno sigue en memoria.
 */
import type { Database } from "bun:sqlite"
import type { ConversacionResumen, Hallazgo, MensajeVisible, ToolCallVisible, UsuarioDto } from "@oc/contracts"
import type { MemoriaCaso, RepositorioSesiones, Sesion } from "../agent/sesiones"
import { resumirConversacion } from "../agent/sesiones"

type Valor = string | number | null
type Params = Record<string, Valor>

const ID_VALIDO = /^[a-zA-Z0-9_-]{8,64}$/
const RESULTADOS_CASO = new Set(["creada", "idempotente", "bloqueada", "pendiente", "validado", "error"])
const ahora = () => new Date().toISOString()

type FilaConversacion = {
  id: string
  usuario_id: string | null
  creada: string
  tokens_usados: number
  costo_usd: number
}
type FilaMensaje = {
  rol: string
  texto: string
  ts: string
  ruta: string | null
  confirmacion: string | null
  tool_calls: string | null
}
type FilaCaso = {
  caso: string
  resultado: string | null
  numero_oc: string | null
  apta: number | null
  retroactiva: number
  bloqueos: string
  confirmaciones: string
  orden: string | null
  evidencia_pdf: string | null
}
type FilaConfirmacion = { id: string; caso: string; estado: "pendiente" | "otorgada"; hallazgos: string }
type FilaListado = {
  id: string
  titulo: string
  creada: string
  actualizada: string
  costo_usd: number
  mensajes: number
  casos: string | null
}

function idUsuario(usuario: string | null): string | null {
  const limpio = usuario?.trim().toLowerCase()
  return limpio ? limpio : null
}

function json<T>(texto: string | null, porDefecto: T): T {
  if (texto === null) return porDefecto
  try {
    return JSON.parse(texto) as T
  } catch {
    return porDefecto
  }
}

const aJson = (valor: unknown): string | null => (valor === null || valor === undefined ? null : JSON.stringify(valor))

function aMensaje(f: FilaMensaje): MensajeVisible {
  if (f.rol === "usuario") return { rol: "usuario", texto: f.texto, ts: f.ts }
  return {
    rol: "agente",
    texto: f.texto,
    ts: f.ts,
    toolCalls: json<ToolCallVisible[]>(f.tool_calls, []),
    confirmacion: json<{ caso: string; confirmaciones: Hallazgo[] } | null>(f.confirmacion, null),
    ruta: json<Extract<MensajeVisible, { rol: "agente" }>["ruta"]>(f.ruta, null),
  }
}

function aMemoria(f: FilaCaso): MemoriaCaso {
  return {
    resultado: (f.resultado as MemoriaCaso["resultado"]) ?? null,
    numero_oc: f.numero_oc,
    apta: f.apta === null ? null : f.apta === 1,
    retroactiva: f.retroactiva === 1,
    bloqueos: json<string[]>(f.bloqueos, []),
    confirmaciones: json<Hallazgo[]>(f.confirmaciones, []),
    orden: json<MemoriaCaso["orden"]>(f.orden, null),
    evidencia_pdf: f.evidencia_pdf,
  }
}

export class AlmacenSesionesSqlite implements RepositorioSesiones {
  private readonly cache = new Map<string, Sesion>()
  private readonly enCurso = new Set<string>()

  constructor(private readonly db: Database) {}

  private run(sql: string, params: Params): void {
    this.db.query<unknown, Params>(sql).run(params)
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────

  registrarUsuario(usuario: UsuarioDto): void {
    const id = idUsuario(usuario.email)
    if (!id) return
    try {
      this.run(
        `INSERT INTO usuarios (id, nombre, rol, creado, ultimo_acceso) VALUES ($id, $nombre, $rol, $ts, $ts)
         ON CONFLICT (id) DO UPDATE SET nombre = COALESCE(excluded.nombre, usuarios.nombre), rol = excluded.rol,
           ultimo_acceso = excluded.ultimo_acceso`,
        { id, nombre: usuario.nombre, rol: usuario.rol === "admin" ? "admin" : "analista", ts: ahora() },
      )
    } catch (e) {
      this.avisar("registrar usuario", e)
    }
  }

  private asegurarUsuario(id: string | null): void {
    if (!id) return
    this.run(
      `INSERT OR IGNORE INTO usuarios (id, nombre, rol, creado, ultimo_acceso) VALUES ($id, NULL, 'analista', $ts, $ts)`,
      { id, ts: ahora() },
    )
  }

  // ── Ciclo de vida de la sesión ────────────────────────────────────────────

  crear(usuario: string | null): Sesion {
    const sesion: Sesion = {
      id: crypto.randomUUID(),
      creada: ahora(),
      usuario,
      visibles: [],
      casos: {},
      pendientes: [],
      confirmacionesOtorgadas: [],
      tokensUsados: 0,
      costoUsd: 0,
    }
    this.cache.set(sesion.id, sesion)
    try {
      const usuarioId = idUsuario(usuario)
      this.db.transaction(() => {
        this.asegurarUsuario(usuarioId)
        this.run(
          `INSERT INTO conversaciones (id, usuario_id, titulo, creada, actualizada) VALUES ($id, $usuario, '', $ts, $ts)`,
          { id: sesion.id, usuario: usuarioId, ts: sesion.creada },
        )
      })()
    } catch (e) {
      this.avisar("crear conversación", e)
    }
    return sesion
  }

  obtener(id: string, usuario: string | null): Sesion | null {
    if (!ID_VALIDO.test(id)) return null
    const sesion = this.cache.get(id) ?? this.cargar(id)
    return sesion && idUsuario(sesion.usuario) === idUsuario(usuario) ? sesion : null
  }

  /** Evita dos turnos simultáneos en la misma sesión. */
  bloquear(id: string): boolean {
    if (this.enCurso.has(id)) return false
    this.enCurso.add(id)
    return true
  }

  liberar(id: string): void {
    this.enCurso.delete(id)
  }

  /** Upsert diferencial en una sola transacción. Si falla, la sesión sigue viva en memoria. */
  guardar(sesion: Sesion): void {
    this.cache.set(sesion.id, sesion)
    try {
      const usuarioId = idUsuario(sesion.usuario)
      this.db.transaction(() => {
        this.asegurarUsuario(usuarioId)
        this.guardarConversacion(sesion, usuarioId)
        const interaccion = this.ultimaInteraccion(sesion.id)
        this.guardarMensajes(sesion, interaccion)
        this.guardarCasos(sesion)
        this.sincronizarConfirmaciones(sesion, usuarioId, interaccion)
        this.run(
          `UPDATE interacciones SET conversacion_id = $id, usuario_id = $usuario
           WHERE session_id = $id AND conversacion_id IS NULL`,
          { id: sesion.id, usuario: usuarioId },
        )
      })()
    } catch (e) {
      this.avisar("guardar sesión", e)
    }
  }

  listar(usuario: string | null): ConversacionResumen[] {
    try {
      return this.db
        .query<FilaListado, Params>(
          `SELECT c.id, c.titulo, c.creada, c.actualizada, c.costo_usd,
             (SELECT COUNT(*) FROM mensajes m WHERE m.conversacion_id = c.id) AS mensajes,
             (SELECT group_concat(k.caso, ',') FROM casos_conversacion k WHERE k.conversacion_id = c.id) AS casos
           FROM conversaciones c
           WHERE c.estado = 'activa'
             AND (c.usuario_id = $usuario OR ($usuario IS NULL AND c.usuario_id IS NULL))
             AND EXISTS (SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id)
           ORDER BY c.actualizada DESC LIMIT 100`,
        )
        .all({ usuario: idUsuario(usuario) })
        .map((f) => ({
          sessionId: f.id,
          titulo: f.titulo || "Conversación nueva",
          creada: f.creada,
          actualizada: f.actualizada,
          mensajes: f.mensajes,
          casos: (f.casos ?? "").split(",").filter(Boolean).sort(),
          costoUsd: f.costo_usd,
        }))
    } catch (e) {
      this.avisar("listar conversaciones", e)
      return [...this.cache.values()]
        .filter((s) => idUsuario(s.usuario) === idUsuario(usuario) && s.visibles.length > 0)
        .map(resumirConversacion)
        .sort((a, b) => b.actualizada.localeCompare(a.actualizada))
    }
  }

  // ── Escritura ─────────────────────────────────────────────────────────────

  private guardarConversacion(sesion: Sesion, usuarioId: string | null): void {
    const resumen = resumirConversacion(sesion)
    this.run(
      `INSERT INTO conversaciones (id, usuario_id, titulo, creada, actualizada, tokens_usados, costo_usd)
       VALUES ($id, $usuario, $titulo, $creada, $actualizada, $tokens, $costo)
       ON CONFLICT (id) DO UPDATE SET titulo = excluded.titulo, actualizada = excluded.actualizada,
         tokens_usados = excluded.tokens_usados, costo_usd = excluded.costo_usd`,
      {
        id: sesion.id,
        usuario: usuarioId,
        titulo: sesion.visibles.some((m) => m.rol === "usuario") ? resumen.titulo : "",
        creada: sesion.creada,
        actualizada: resumen.actualizada,
        tokens: Math.max(0, Math.round(sesion.tokensUsados)),
        costo: Math.max(0, sesion.costoUsd),
      },
    )
  }

  private ultimaInteraccion(conversacionId: string): string | null {
    const fila = this.db
      .query<{ id: string }, Params>("SELECT id FROM interacciones WHERE session_id = $id ORDER BY ts DESC LIMIT 1")
      .get({ id: conversacionId })
    return fila?.id ?? null
  }

  /** Reescribe el último mensaje ya guardado (pudo cambiar) e inserta los nuevos por secuencia. */
  private guardarMensajes(sesion: Sesion, interaccion: string | null): void {
    const fila = this.db
      .query<{ n: number | null }, Params>("SELECT MAX(secuencia) AS n FROM mensajes WHERE conversacion_id = $id")
      .get({ id: sesion.id })
    const desde = Math.max(0, fila?.n ?? 0)
    for (let secuencia = desde; secuencia < sesion.visibles.length; secuencia++) {
      const m = sesion.visibles[secuencia]
      if (m) this.guardarMensaje(sesion.id, secuencia, m, interaccion)
    }
  }

  private guardarMensaje(
    conversacionId: string,
    secuencia: number,
    m: MensajeVisible,
    interaccion: string | null,
  ): void {
    const agente = m.rol === "agente" ? m : null
    this.run(
      `INSERT INTO mensajes (id, conversacion_id, secuencia, rol, texto, ts, interaccion_id, ruta, confirmacion, tool_calls)
       VALUES ($id, $conversacion, $secuencia, $rol, $texto, $ts, $interaccion, $ruta, $confirmacion, $tool_calls)
       ON CONFLICT (conversacion_id, secuencia) DO UPDATE SET texto = excluded.texto, ts = excluded.ts,
         ruta = excluded.ruta, confirmacion = excluded.confirmacion, tool_calls = excluded.tool_calls,
         interaccion_id = COALESCE(mensajes.interaccion_id, excluded.interaccion_id)`,
      {
        id: crypto.randomUUID(),
        conversacion: conversacionId,
        secuencia,
        rol: m.rol,
        texto: m.texto,
        ts: m.ts,
        interaccion,
        ruta: aJson(agente?.ruta),
        confirmacion: aJson(agente?.confirmacion),
        tool_calls: aJson(agente?.toolCalls),
      },
    )
  }

  private guardarCasos(sesion: Sesion): void {
    for (const [caso, m] of Object.entries(sesion.casos)) {
      this.run(
        `INSERT INTO casos_conversacion (conversacion_id, caso, resultado, numero_oc, apta, retroactiva, bloqueos,
           confirmaciones, orden, evidencia_pdf, actualizado)
         VALUES ($conversacion, $caso, $resultado, $numero_oc, $apta, $retroactiva, $bloqueos, $confirmaciones,
           $orden, $evidencia_pdf, $ts)
         ON CONFLICT (conversacion_id, caso) DO UPDATE SET resultado = excluded.resultado,
           numero_oc = excluded.numero_oc, apta = excluded.apta, retroactiva = excluded.retroactiva,
           bloqueos = excluded.bloqueos, confirmaciones = excluded.confirmaciones, orden = excluded.orden,
           evidencia_pdf = excluded.evidencia_pdf, actualizado = excluded.actualizado`,
        {
          conversacion: sesion.id,
          caso,
          resultado: m.resultado && RESULTADOS_CASO.has(m.resultado) ? m.resultado : null,
          numero_oc: m.numero_oc,
          apta: m.apta === null ? null : m.apta ? 1 : 0,
          retroactiva: m.retroactiva ? 1 : 0,
          bloqueos: JSON.stringify(m.bloqueos),
          confirmaciones: JSON.stringify(m.confirmaciones),
          orden: aJson(m.orden),
          evidencia_pdf: m.evidencia_pdf,
          ts: ahora(),
        },
      )
    }
  }

  /**
   * Refleja el estado de la sesión en el rastro de auditoría:
   * pendiente → otorgada (el usuario confirmó) → consumida (se creó la OC), o pendiente → descartada.
   */
  private sincronizarConfirmaciones(sesion: Sesion, usuarioId: string | null, interaccion: string | null): void {
    const vivas = this.db
      .query<FilaConfirmacion, Params>(
        `SELECT id, caso, estado, hallazgos FROM confirmaciones
         WHERE conversacion_id = $id AND estado IN ('pendiente', 'otorgada')`,
      )
      .all({ id: sesion.id })
    const pendientes = new Map(sesion.pendientes.map((p) => [p.caso, p]))
    const otorgadas = new Set(sesion.confirmacionesOtorgadas)
    const siguenVivas = new Set<string>()
    const ts = ahora()

    for (const fila of vivas) {
      const estado = this.nuevoEstado(fila, sesion, pendientes.has(fila.caso), otorgadas.has(fila.caso))
      if (estado === "pendiente" || estado === "otorgada") siguenVivas.add(fila.caso)
      const hallazgos = pendientes.get(fila.caso)?.confirmaciones
      this.run(
        `UPDATE confirmaciones SET estado = $estado,
           hallazgos = COALESCE($hallazgos, hallazgos),
           resuelta = CASE WHEN $estado = 'pendiente' THEN NULL ELSE COALESCE(resuelta, $ts) END,
           resuelta_por = CASE WHEN $estado IN ('otorgada', 'consumida') OR ($estado = 'descartada' AND $sistema = 0)
             THEN COALESCE(resuelta_por, $usuario) ELSE resuelta_por END
         WHERE id = $fila`,
        {
          fila: fila.id,
          estado,
          hallazgos: hallazgos ? JSON.stringify(hallazgos) : null,
          ts,
          usuario: usuarioId,
          sistema: sesion.casos[fila.caso]?.resultado === "bloqueada" ? 1 : 0,
        },
      )
    }
    for (const p of sesion.pendientes) {
      if (!siguenVivas.has(p.caso))
        this.insertarConfirmacion(sesion.id, p.caso, p.confirmaciones, otorgadas, usuarioId, interaccion)
    }
    for (const caso of otorgadas) {
      if (!pendientes.has(caso) && !siguenVivas.has(caso)) {
        this.insertarConfirmacion(sesion.id, caso, [], otorgadas, usuarioId, interaccion)
      }
    }
  }

  private nuevoEstado(
    fila: FilaConfirmacion,
    sesion: Sesion,
    enPendientes: boolean,
    enOtorgadas: boolean,
  ): "pendiente" | "otorgada" | "consumida" | "descartada" {
    if (fila.estado === "otorgada") return enOtorgadas ? "otorgada" : "consumida"
    if (enOtorgadas) return "otorgada"
    if (enPendientes) return "pendiente"
    // Confirmada y consumida en el mismo turno: la OC quedó creada.
    const resultado = sesion.casos[fila.caso]?.resultado
    return resultado === "creada" || resultado === "idempotente" ? "consumida" : "descartada"
  }

  private insertarConfirmacion(
    conversacionId: string,
    caso: string,
    hallazgos: Hallazgo[],
    otorgadas: Set<string>,
    usuarioId: string | null,
    interaccion: string | null,
  ): void {
    const otorgada = otorgadas.has(caso)
    const ts = ahora()
    this.run(
      `INSERT INTO confirmaciones (id, conversacion_id, caso, estado, hallazgos, solicitada, resuelta, resuelta_por,
         interaccion_id)
       VALUES ($id, $conversacion, $caso, $estado, $hallazgos, $ts, $resuelta, $resuelta_por, $interaccion)`,
      {
        id: crypto.randomUUID(),
        conversacion: conversacionId,
        caso,
        estado: otorgada ? "otorgada" : "pendiente",
        hallazgos: JSON.stringify(hallazgos),
        ts,
        resuelta: otorgada ? ts : null,
        resuelta_por: otorgada ? usuarioId : null,
        interaccion,
      },
    )
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  /** Reconstruye la sesión completa desde las tablas. */
  private cargar(id: string): Sesion | null {
    try {
      const p = { id }
      const conv = this.db
        .query<FilaConversacion, Params>(
          "SELECT id, usuario_id, creada, tokens_usados, costo_usd FROM conversaciones WHERE id = $id",
        )
        .get(p)
      if (!conv) return null
      const mensajes = this.db
        .query<FilaMensaje, Params>(
          "SELECT rol, texto, ts, ruta, confirmacion, tool_calls FROM mensajes WHERE conversacion_id = $id ORDER BY secuencia",
        )
        .all(p)
      const casos = this.db
        .query<FilaCaso, Params>("SELECT * FROM casos_conversacion WHERE conversacion_id = $id")
        .all(p)
      const vivas = this.db
        .query<FilaConfirmacion, Params>(
          `SELECT id, caso, estado, hallazgos FROM confirmaciones
           WHERE conversacion_id = $id AND estado IN ('pendiente', 'otorgada') ORDER BY solicitada, rowid`,
        )
        .all(p)
      const sesion: Sesion = {
        id: conv.id,
        creada: conv.creada,
        usuario: conv.usuario_id,
        visibles: mensajes.map(aMensaje),
        casos: Object.fromEntries(casos.map((f) => [f.caso, aMemoria(f)])),
        pendientes: vivas.map((f) => ({ caso: f.caso, confirmaciones: json<Hallazgo[]>(f.hallazgos, []) })),
        confirmacionesOtorgadas: vivas.filter((f) => f.estado === "otorgada").map((f) => f.caso),
        tokensUsados: conv.tokens_usados,
        costoUsd: conv.costo_usd,
      }
      this.cache.set(id, sesion)
      return sesion
    } catch (e) {
      this.avisar("cargar sesión", e)
      return null
    }
  }

  private avisar(accion: string, e: unknown): void {
    console.error(`[persistencia] no se pudo ${accion}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
