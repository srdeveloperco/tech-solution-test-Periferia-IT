/** Observador sobre SQLite (bun:sqlite). Síncrono, un archivo, sin dependencias externas. */
import type { Database } from "bun:sqlite"
import { createHash, randomUUID } from "node:crypto"
import type {
  EjecucionHerramientaDto,
  InteraccionDetalle,
  InteraccionResumen,
  LlamadaLlmDto,
  ObservatorioResumen,
  PresupuestoDto,
  ResultadoInteraccion,
  RutaTurno,
} from "@oc/contracts"
import { SELECT_INTERACCION } from "./esquema"
import { aJson, deJson, textoSeguro } from "./redactar"
import type { Observador, PermisoGasto } from "./tipos"

type Valor = string | number | null
type Params = Record<string, Valor>

type FilaInteraccion = {
  id: string
  session_id: string
  usuario: string | null
  ts: string
  mensaje_usuario: string
  agente: string | null
  intencion: string | null
  caso: string | null
  respuesta: string | null
  resultado: string | null
  ms: number | null
  ruta: string | null
  llamadas: number
  tokens_entrada: number
  tokens_salida: number
  costo: number
  herramientas: number
}

type FilaLlamada = {
  id: string
  interaccion_id: string
  ts: string
  agente: string
  proveedor: string
  modelo: string
  prompt_hash: string
  texto: string | null
  mensajes: string | null
  herramientas: string | null
  variables: string | null
  respuesta: string | null
  stop_reason: string | null
  tokens_entrada: number
  tokens_salida: number
  tokens_cache_lectura: number
  tokens_cache_escritura: number
  costo_usd: number
  ms: number
  error: string | null
}

type FilaHerramienta = {
  id: string
  interaccion_id: string
  ts: string
  agente: string
  nombre: string
  args: string | null
  resultado: string | null
  ok: number
  ms: number
}

const RESULTADOS: ReadonlySet<string> = new Set(["ok", "error", "confirmacion", "bloqueado_presupuesto"])

const redondear = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000
const ahora = () => new Date().toISOString()

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)
  return ordenados[Math.max(0, indice)] ?? 0
}

function aResultado(valor: string | null): ResultadoInteraccion {
  return valor !== null && RESULTADOS.has(valor) ? (valor as ResultadoInteraccion) : "ok"
}

function aRuta(texto: string | null): RutaTurno | null {
  const valor = deJson(texto)
  return typeof valor === "object" && valor !== null ? (valor as RutaTurno) : null
}

function aResumen(f: FilaInteraccion): InteraccionResumen {
  return {
    id: f.id,
    sessionId: f.session_id,
    usuario: f.usuario,
    ts: f.ts,
    mensajeUsuario: f.mensaje_usuario,
    agente: f.agente,
    intencion: f.intencion,
    caso: f.caso,
    llamadasLlm: f.llamadas,
    herramientas: f.herramientas,
    tokensEntrada: f.tokens_entrada,
    tokensSalida: f.tokens_salida,
    costoUsd: redondear(f.costo),
    ms: f.ms ?? 0,
    resultado: aResultado(f.resultado),
  }
}

function aLlamada(f: FilaLlamada): LlamadaLlmDto {
  const herramientas = deJson(f.herramientas)
  const variables = deJson(f.variables)
  return {
    id: f.id,
    interaccionId: f.interaccion_id,
    ts: f.ts,
    agente: f.agente,
    proveedor: f.proveedor,
    modelo: f.modelo,
    sistema: f.texto ?? "",
    promptHash: f.prompt_hash,
    mensajes: deJson(f.mensajes),
    herramientas: Array.isArray(herramientas) ? herramientas.map(String) : [],
    variables: typeof variables === "object" && variables !== null ? (variables as Record<string, unknown>) : {},
    respuesta: deJson(f.respuesta),
    stopReason: f.stop_reason,
    tokensEntrada: f.tokens_entrada,
    tokensSalida: f.tokens_salida,
    tokensCacheLectura: f.tokens_cache_lectura,
    tokensCacheEscritura: f.tokens_cache_escritura,
    costoUsd: redondear(f.costo_usd),
    ms: f.ms,
    error: f.error,
  }
}

function aHerramienta(f: FilaHerramienta): EjecucionHerramientaDto {
  return {
    id: f.id,
    interaccionId: f.interaccion_id,
    ts: f.ts,
    agente: f.agente,
    nombre: f.nombre,
    args: deJson(f.args),
    resultado: deJson(f.resultado),
    ok: f.ok === 1,
    ms: f.ms,
  }
}

const numero = (n: number) => (Number.isFinite(n) ? n : 0)

export class ObservadorSqlite implements Observador {
  /** Recibe la conexión compartida ya migrada (ver persistencia/abrirBaseDatos). */
  constructor(
    private readonly db: Database,
    private readonly limiteUsd: number,
  ) {}

  /** Escritura best-effort: un fallo de la base se registra en consola y no tumba el turno. */
  private ejecutar(sql: string, params: Params): void {
    try {
      this.db.query<unknown, Params>(sql).run(params)
    } catch (e) {
      console.error(`[observatorio] no se pudo escribir: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  iniciarInteraccion(d: { sessionId: string; usuario: string | null; mensaje: string }): string {
    const id = randomUUID()
    this.ejecutar(
      `INSERT INTO interacciones (id, session_id, usuario, ts, mensaje_usuario, conversacion_id, usuario_id)
       VALUES ($id, $session_id, $usuario, $ts, $mensaje,
         (SELECT id FROM conversaciones WHERE id = $session_id),
         (SELECT id FROM usuarios WHERE id = lower($usuario)))`,
      { id, session_id: d.sessionId, usuario: d.usuario, ts: ahora(), mensaje: textoSeguro(d.mensaje) },
    )
    return id
  }

  registrarRuta(interaccionId: string, ruta: RutaTurno): void {
    this.ejecutar(
      `UPDATE interacciones SET ruta = $ruta, agente = $agente, intencion = $intencion, caso = $caso WHERE id = $id`,
      { id: interaccionId, ruta: aJson(ruta), agente: ruta.agente, intencion: ruta.intencion, caso: ruta.caso },
    )
  }

  private guardarPrompt(hash: string, agente: string, texto: string): void {
    this.ejecutar(
      `INSERT OR IGNORE INTO prompts (hash, agente, texto, primera_vez) VALUES ($hash, $agente, $texto, $ts)`,
      { hash, agente, texto: textoSeguro(texto), ts: ahora() },
    )
  }

  registrarLlamadaLlm(d: Omit<LlamadaLlmDto, "id" | "ts">): void {
    const hash = d.promptHash || createHash("sha256").update(d.sistema).digest("hex")
    this.guardarPrompt(hash, d.agente, d.sistema)
    this.ejecutar(
      `INSERT INTO llamadas_llm (id, interaccion_id, ts, agente, proveedor, modelo, prompt_hash, mensajes, herramientas,
         variables, respuesta, stop_reason, tokens_entrada, tokens_salida, tokens_cache_lectura, tokens_cache_escritura,
         costo_usd, ms, error)
       VALUES ($id, $interaccion_id, $ts, $agente, $proveedor, $modelo, $prompt_hash, $mensajes, $herramientas,
         $variables, $respuesta, $stop_reason, $tokens_entrada, $tokens_salida, $tokens_cache_lectura,
         $tokens_cache_escritura, $costo_usd, $ms, $error)`,
      {
        id: randomUUID(),
        interaccion_id: d.interaccionId,
        ts: ahora(),
        agente: d.agente,
        proveedor: d.proveedor,
        modelo: d.modelo,
        prompt_hash: hash,
        mensajes: aJson(d.mensajes),
        herramientas: aJson(d.herramientas),
        variables: aJson(d.variables),
        respuesta: aJson(d.respuesta),
        stop_reason: d.stopReason,
        tokens_entrada: numero(d.tokensEntrada),
        tokens_salida: numero(d.tokensSalida),
        tokens_cache_lectura: numero(d.tokensCacheLectura),
        tokens_cache_escritura: numero(d.tokensCacheEscritura),
        costo_usd: numero(d.costoUsd),
        ms: Math.round(numero(d.ms)),
        error: d.error === null ? null : textoSeguro(d.error),
      },
    )
  }

  registrarHerramienta(d: Omit<EjecucionHerramientaDto, "id" | "ts">): void {
    this.ejecutar(
      `INSERT INTO ejecuciones_herramienta (id, interaccion_id, ts, agente, nombre, args, resultado, ok, ms)
       VALUES ($id, $interaccion_id, $ts, $agente, $nombre, $args, $resultado, $ok, $ms)`,
      {
        id: randomUUID(),
        interaccion_id: d.interaccionId,
        ts: ahora(),
        agente: d.agente,
        nombre: d.nombre,
        args: aJson(d.args),
        resultado: aJson(d.resultado),
        ok: d.ok ? 1 : 0,
        ms: Math.round(numero(d.ms)),
      },
    )
  }

  cerrarInteraccion(id: string, d: { respuesta: string; resultado: ResultadoInteraccion; ms: number }): void {
    this.ejecutar(`UPDATE interacciones SET respuesta = $respuesta, resultado = $resultado, ms = $ms WHERE id = $id`, {
      id,
      respuesta: textoSeguro(d.respuesta),
      resultado: d.resultado,
      ms: Math.round(numero(d.ms)),
    })
  }

  private gastado(): number {
    const fila = this.db.query<{ total: number | null }, []>("SELECT SUM(costo_usd) AS total FROM llamadas_llm").get()
    return fila?.total ?? 0
  }

  presupuesto(): PresupuestoDto {
    const gastado = redondear(this.gastado())
    const restante = redondear(Math.max(0, this.limiteUsd - gastado))
    return {
      limiteUsd: this.limiteUsd,
      gastadoUsd: gastado,
      restanteUsd: restante,
      bloqueado: gastado >= this.limiteUsd,
    }
  }

  /** Falla cerrado: si no se puede leer el gasto, no se autoriza la llamada al modelo. */
  puedeGastar(estimadoUsd: number): PermisoGasto {
    let p: PresupuestoDto
    try {
      p = this.presupuesto()
    } catch {
      return {
        permitido: false,
        motivo: "No pude verificar el presupuesto de la cuenta de prueba. Intenta en un momento.",
      }
    }
    const limite = `USD ${p.limiteUsd.toFixed(2)}`
    if (p.bloqueado) {
      return { permitido: false, motivo: `Se alcanzó el límite de gasto de la cuenta de prueba (${limite}).` }
    }
    if (p.gastadoUsd + Math.max(0, numero(estimadoUsd)) > p.limiteUsd) {
      return {
        permitido: false,
        motivo: `Esta consulta podría superar el límite de gasto de la cuenta de prueba (${limite}); quedan USD ${p.restanteUsd.toFixed(4)}.`,
      }
    }
    return { permitido: true }
  }

  interacciones(limite: number): InteraccionResumen[] {
    const n = Math.min(200, Math.max(1, Math.floor(numero(limite)) || 50))
    return this.db
      .query<FilaInteraccion, Params>(`${SELECT_INTERACCION} ORDER BY i.ts DESC LIMIT $limite`)
      .all({ limite: n })
      .map(aResumen)
  }

  interaccion(id: string): InteraccionDetalle | null {
    const fila = this.db.query<FilaInteraccion, Params>(`${SELECT_INTERACCION} WHERE i.id = $id`).get({ id })
    if (!fila) return null
    const llamadas = this.db
      .query<FilaLlamada, Params>(
        `SELECT l.*, p.texto FROM llamadas_llm l LEFT JOIN prompts p ON p.hash = l.prompt_hash
         WHERE l.interaccion_id = $id ORDER BY l.ts`,
      )
      .all({ id })
    const herramientas = this.db
      .query<FilaHerramienta, Params>("SELECT * FROM ejecuciones_herramienta WHERE interaccion_id = $id ORDER BY ts")
      .all({ id })
    return {
      ...aResumen(fila),
      respuesta: fila.respuesta ?? "",
      ruta: aRuta(fila.ruta),
      llamadas: llamadas.map(aLlamada),
      herramientasEjecutadas: herramientas.map(aHerramienta),
    }
  }

  resumen(): ObservatorioResumen {
    type Totales = { llamadas: number; entrada: number | null; salida: number | null; costo: number | null }
    const t = this.db
      .query<Totales, []>(
        `SELECT COUNT(*) AS llamadas, SUM(tokens_entrada) AS entrada, SUM(tokens_salida) AS salida,
                SUM(costo_usd) AS costo FROM llamadas_llm`,
      )
      .get()
    const interacciones = this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM interacciones").get()?.n ?? 0
    const latencias = this.db
      .query<{ ms: number }, []>("SELECT ms FROM interacciones WHERE ms IS NOT NULL ORDER BY ms")
      .all()
      .map((f) => f.ms)
    const costo = t?.costo ?? 0
    return {
      presupuesto: this.presupuesto(),
      totales: {
        interacciones,
        llamadasLlm: t?.llamadas ?? 0,
        tokensEntrada: t?.entrada ?? 0,
        tokensSalida: t?.salida ?? 0,
        costoUsd: redondear(costo),
        costoPromedioInteraccionUsd: redondear(interacciones > 0 ? costo / interacciones : 0),
        latenciaP50Ms: percentil(latencias, 50),
        latenciaP95Ms: percentil(latencias, 95),
      },
      porModelo: this.porModelo(),
      porAgente: this.porAgente(),
      prompts: this.prompts(),
    }
  }

  private porModelo(): ObservatorioResumen["porModelo"] {
    type Fila = { modelo: string; llamadas: number; entrada: number; salida: number; costo: number }
    return this.db
      .query<Fila, []>(
        `SELECT modelo, COUNT(*) AS llamadas, SUM(tokens_entrada) AS entrada, SUM(tokens_salida) AS salida,
                SUM(costo_usd) AS costo FROM llamadas_llm GROUP BY modelo ORDER BY costo DESC`,
      )
      .all()
      .map((f) => ({
        modelo: f.modelo,
        llamadas: f.llamadas,
        tokensEntrada: f.entrada,
        tokensSalida: f.salida,
        costoUsd: redondear(f.costo),
      }))
  }

  private porAgente(): ObservatorioResumen["porAgente"] {
    type Fila = { agente: string; llamadas: number; costo: number }
    return this.db
      .query<Fila, []>(
        `SELECT agente, COUNT(*) AS llamadas, SUM(costo_usd) AS costo FROM llamadas_llm
         GROUP BY agente ORDER BY costo DESC`,
      )
      .all()
      .map((f) => ({ agente: f.agente, llamadas: f.llamadas, costoUsd: redondear(f.costo) }))
  }

  private prompts(): ObservatorioResumen["prompts"] {
    type Fila = { hash: string; agente: string; usos: number; primera_vez: string }
    return this.db
      .query<Fila, []>(
        `SELECT p.hash, p.agente, p.primera_vez, COUNT(l.id) AS usos FROM prompts p
         LEFT JOIN llamadas_llm l ON l.prompt_hash = p.hash
         GROUP BY p.hash ORDER BY p.primera_vez DESC`,
      )
      .all()
      .map((f) => ({ hash: f.hash, agente: f.agente, usos: f.usos, primeraVez: f.primera_vez }))
  }
}
