/**
 * Corre `bun test` solo si existen archivos *.test.ts / *.test.tsx (fuera de node_modules).
 * En esta fase los tests automatizados son opcionales: CI y hooks no fallan por no tenerlos.
 */
import { Glob } from "bun"

const glob = new Glob("**/*.test.{ts,tsx}")
let hay = false
for await (const ruta of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
  if (!ruta.includes("node_modules")) {
    hay = true
    break
  }
}

if (!hay) {
  console.log("Sin archivos *.test.ts: se omite bun test.")
  process.exit(0)
}

const proc = Bun.spawnSync(["bun", "test", ...process.argv.slice(2)], { stdout: "inherit", stderr: "inherit" })
process.exit(proc.exitCode ?? 1)
