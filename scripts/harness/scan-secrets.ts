/**
 * Escaneo simple de secretos en archivos staged (pre-commit). No reemplaza un escáner
 * dedicado, pero frena los errores más comunes: claves de Anthropic/OpenAI/AWS y llaves privadas.
 * Uso: bun scripts/harness/scan-secrets.ts <archivo...>
 */
import { existsSync, statSync } from "node:fs"

const PATRONES: { nombre: string; patron: RegExp }[] = [
  { nombre: "clave Anthropic", patron: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { nombre: "clave OpenAI", patron: /sk-(proj-)?[A-Za-z0-9]{32,}/ },
  { nombre: "access key AWS", patron: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { nombre: "secret key AWS", patron: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/i },
  { nombre: "llave privada", patron: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

const hallazgos: string[] = []
for (const archivo of process.argv.slice(2)) {
  if (!existsSync(archivo) || statSync(archivo).size > 2_000_000) continue
  if (archivo.endsWith("scan-secrets.ts")) continue
  const lineas = (await Bun.file(archivo).text()).split("\n")
  lineas.forEach((linea, i) => {
    for (const { nombre, patron } of PATRONES) {
      if (patron.test(linea)) hallazgos.push(`${archivo}:${i + 1} → posible ${nombre}`)
    }
  })
}

if (hallazgos.length > 0) {
  console.error(
    `Posibles secretos en archivos staged:\n  ${hallazgos.join("\n  ")}\nLas claves van en variables de entorno.`,
  )
  process.exit(1)
}
