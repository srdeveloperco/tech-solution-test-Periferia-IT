/**
 * PreToolUse (Bash): bloquea comandos peligrosos. La cuenta AWS es de PRODUCCIÓN:
 * los borrados de infraestructura solo los ejecuta un humano en CloudShell siguiendo INFRA.md.
 */
import { bloquear, leerEntrada } from "./_comun"

const REGLAS: { patron: RegExp; motivo: string }[] = [
  {
    patron: /\bgit\s+push\b[^;&|\n]*\s(--force(?!-with-lease)\b|-f\b|\+[\w/.-]+)/,
    motivo: "git push forzado reescribe historia remota. Usa un commit nuevo (o --force-with-lease en tu propia rama).",
  },
  {
    patron:
      /\brm\s+(-\w*\s+)*-\w*(r\w*f|f\w*r)\w*\s+(-\w+\s+)*("|')?(\/|\/\*|~|~\/|\$HOME|\$HOME\/|\$\{HOME\})("|')?(\s|$)/,
    motivo: "rm -rf sobre la raíz o el home no está permitido.",
  },
  {
    // Lectura/copia (cat .env, grep x .env, cp .env …), redirección (> .env, < .env) o `source`/`.`;
    // no bloquea menciones dentro de heredocs (por ejemplo, al escribir un .gitignore).
    patron: new RegExp(
      [
        String.raw`(^|[\s;&|(])(cat|less|more|head|tail|bat|nl|strings|xxd|od|base64|cp|mv|scp|rsync|source|grep|rg|awk|sed|cut|sort|diff|vi|vim|nano|tee|jq|dotenv)\b[^|;&\n]*?[ \t"'=/<>]\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s"';|&)<>])`,
        String.raw`(>>?|<)[ \t]*["']?[^\s"']*\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s"';|&)<>])`,
        String.raw`(^|[\s;&|])\.[ \t]+["']?[^\s"']*\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s"';|&)<>])`,
      ].join("|"),
    ),
    motivo: "Los archivos .env contienen secretos y no se leen ni se escriben desde el agente (.env.example sí).",
  },
  {
    patron: /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
    motivo: "Ejecutar scripts remotos con curl|sh no está permitido. Descarga, revisa y luego ejecuta.",
  },
  {
    patron: /\baws\s+[\w-]+\s+(delete|remove|terminate|deregister|detach|purge|disable)-[\w-]*/,
    motivo:
      "La cuenta AWS es de PRODUCCIÓN: los borrados los ejecuta un humano en CloudShell siguiendo INFRA.md (sección Borrado).",
  },
  { patron: /\baws\s+s3\s+(rm|rb)\b/, motivo: "Borrados en S3 no permitidos desde el agente (cuenta de producción)." },
  {
    // Solo la ejecución (bash x.sh, source x.sh, ./x.sh al inicio de un comando), no las menciones.
    patron:
      /(\b(ba|z)?sh|\bsource|\bpwsh|\bpowershell(\.exe)?)\s+(-\w+\s+)*\S*99-eliminar\.(sh|ps1)|(^|[;&|(]\s*)\S*99-eliminar\.(sh|ps1)/,
    motivo: "El script de borrado de infraestructura solo lo ejecuta un humano en CloudShell.",
  },
]

const entrada = await leerEntrada()
const comando = entrada.tool_input?.command
if (!comando) process.exit(0)

for (const { patron, motivo } of REGLAS) {
  if (patron.test(comando)) bloquear(`Bloqueado por guard-bash.\n${motivo}`)
}
process.exit(0)
