import type { UsoLlm } from "./adapter"

/** USD por millón de tokens (API de Anthropic, tarifas vigentes 2026-10). Escritura de caché = 1,25× entrada (TTL 5 min). */
type Tarifa = { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }

const TARIFAS: Record<string, Tarifa> = {
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
  "claude-opus-5-5": { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
}

const SIN_COSTO: Tarifa = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 }

export function tarifaDe(modelo: string): Tarifa {
  return TARIFAS[modelo] ?? SIN_COSTO
}

export function costoUsd(modelo: string, uso: UsoLlm): number {
  const t = tarifaDe(modelo)
  const usd =
    uso.entrada * t.entrada +
    uso.salida * t.salida +
    uso.cacheLectura * t.cacheLectura +
    uso.cacheEscritura * t.cacheEscritura
  return usd / 1_000_000
}

export function tokensTotales(uso: UsoLlm): number {
  return uso.entrada + uso.salida + uso.cacheLectura + uso.cacheEscritura
}
