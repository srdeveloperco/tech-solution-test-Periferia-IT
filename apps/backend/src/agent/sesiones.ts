import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type {
  ConversacionResumen,
  Hallazgo,
  MensajeVisible,
  OrdenCompra,
  ResultadoCrear,
  UsuarioDto,
} from "@oc/contracts"

/** Lo que el agente recuerda de cada caso entre turnos (compacto: no se reenvían resultados completos). */
export type MemoriaCaso = {
  resultado: ResultadoCrear | "validado" | "error" | null
  numero_oc: string | null
  apta: boolean | null
  retroactiva: boolean
  bloqueos: string[]
  confirmaciones: Hallazgo[]
  orden: OrdenCompra | null
  evidencia_pdf: string | null
}

export type Pendiente = { caso: string; confirmaciones: Hallazgo[] }

export type Sesion = {
  id: string
  creada: string
  /** Email del usuario dueño de la sesión; otra persona no puede leerla ni continuarla. */
  usuario: string | null
  visibles: MensajeVisible[]
  casos: Record<string, MemoriaCaso>
  /** OC esperando confirmación humana (la última es la más reciente). */
  pendientes: Pendiente[]
  confirmacionesOtorgadas: string[]
  tokensUsados: number
  costoUsd: number
}

const ID_VALIDO = /^[a-zA-Z0-9_-]{8,64}$/

/**
 * Puerto de persistencia de sesiones. Implementaciones: `AlmacenSesiones` (memoria + JSON best-effort)
 * y la de SQLite en src/persistencia. El orquestador solo conoce esta interfaz.
 */
export interface RepositorioSesiones {
  obtener(id: string, usuario: string | null): Sesion | null
  crear(usuario: string | null): Sesion
  bloquear(id: string): boolean
  liberar(id: string): void
  guardar(sesion: Sesion): void
  listar(usuario: string | null): ConversacionResumen[]
  registrarUsuario(usuario: UsuarioDto): void
}

export function resumirConversacion(s: Sesion): ConversacionResumen {
  const primero = s.visibles.find((m) => m.rol === "usuario")
  return {
    sessionId: s.id,
    titulo: (primero?.texto ?? "Conversación nueva").slice(0, 80),
    creada: s.creada,
    actualizada: s.visibles.at(-1)?.ts ?? s.creada,
    mensajes: s.visibles.length,
    casos: Object.keys(s.casos),
    costoUsd: s.costoUsd,
  }
}

export class AlmacenSesiones implements RepositorioSesiones {
  private readonly sesiones = new Map<string, Sesion>()
  private readonly enCurso = new Set<string>()

  constructor(private readonly dirOut: () => string) {}

  obtener(id: string, usuario: string | null): Sesion | null {
    if (!ID_VALIDO.test(id)) return null
    const sesion = this.sesiones.get(id) ?? this.cargar(id)
    return sesion && sesion.usuario === usuario ? sesion : null
  }

  crear(usuario: string | null): Sesion {
    const sesion: Sesion = {
      id: crypto.randomUUID(),
      creada: new Date().toISOString(),
      usuario,
      visibles: [],
      casos: {},
      pendientes: [],
      confirmacionesOtorgadas: [],
      tokensUsados: 0,
      costoUsd: 0,
    }
    this.sesiones.set(sesion.id, sesion)
    return sesion
  }

  listar(usuario: string | null): ConversacionResumen[] {
    return [...this.sesiones.values()]
      .filter((s) => s.usuario === usuario && s.visibles.length > 0)
      .map(resumirConversacion)
      .sort((a, b) => b.actualizada.localeCompare(a.actualizada))
  }

  registrarUsuario(_usuario: UsuarioDto): void {
    // en memoria no hay tabla de usuarios; la implementación SQLite sí los persiste
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

  /** Persistencia best-effort: si falla el disco, la sesión sigue en memoria. */
  guardar(sesion: Sesion): void {
    try {
      const dir = join(this.dirOut(), "sesiones")
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sesion.id}.json`), JSON.stringify(sesion))
    } catch {
      // sin disco disponible: se mantiene en memoria
    }
  }

  private cargar(id: string): Sesion | null {
    try {
      const sesion = JSON.parse(readFileSync(join(this.dirOut(), "sesiones", `${id}.json`), "utf8")) as Sesion
      this.sesiones.set(id, sesion)
      return sesion
    } catch {
      return null
    }
  }
}

export function memoriaVacia(): MemoriaCaso {
  return {
    resultado: null,
    numero_oc: null,
    apta: null,
    retroactiva: false,
    bloqueos: [],
    confirmaciones: [],
    orden: null,
    evidencia_pdf: null,
  }
}

export function ultimoPendiente(sesion: Sesion): Pendiente | null {
  return sesion.pendientes.at(-1) ?? null
}

export function pendienteDe(sesion: Sesion, caso: string | null): Pendiente | null {
  return caso ? (sesion.pendientes.find((p) => p.caso === caso) ?? null) : null
}

export function quitarPendiente(sesion: Sesion, caso: string): void {
  sesion.pendientes = sesion.pendientes.filter((p) => p.caso !== caso)
  sesion.confirmacionesOtorgadas = sesion.confirmacionesOtorgadas.filter((c) => c !== caso)
}

export function ponerPendiente(sesion: Sesion, pendiente: Pendiente): void {
  sesion.pendientes = [...sesion.pendientes.filter((p) => p.caso !== pendiente.caso), pendiente]
}
