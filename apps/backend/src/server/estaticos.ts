import { existsSync, statSync } from "node:fs"
import { join, normalize, resolve, sep } from "node:path"

/** Sirve el build del front (apps/web/dist) con fallback SPA a index.html. */
export function servirEstatico(distDir: string, rutaPedida: string): Response | null {
  if (!existsSync(distDir)) return null
  const raiz = resolve(distDir)
  const destino = resolve(raiz, `.${normalize(decodeURIComponent(rutaPedida))}`)
  const dentro = destino === raiz || destino.startsWith(raiz + sep)
  if (dentro && existsSync(destino) && statSync(destino).isFile()) {
    const cache = destino.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
    return new Response(Bun.file(destino), { headers: { "Cache-Control": cache } })
  }
  const indice = join(raiz, "index.html")
  return existsSync(indice) ? new Response(Bun.file(indice), { headers: { "Cache-Control": "no-cache" } }) : null
}
