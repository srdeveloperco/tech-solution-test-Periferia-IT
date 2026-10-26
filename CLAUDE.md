@AGENTS.md

## Específico de Claude Code

- Los hooks de `.claude/settings.json` imponen las reglas duras; no intentes rodearlos:
  - `guard-paths`: bloquea editar `fixtures/`, `out/`, `.env*` y `bun.lock`.
  - `guard-bash`: bloquea `git push --force`, `rm -rf` sobre raíz/home, leer `.env`, `curl | sh` y borrados en AWS.
  - `format-file`: tras cada edición corre Biome sobre el archivo; si devuelve errores, corrígelos antes de seguir.
  - `stop-verify`: antes de cerrar un turno con cambios corre typecheck, límites y tests.
  - `session-start`: en sesiones cloud instala bun y dependencias.
- Skills del proyecto: `nueva-regla-control` (cambiar una regla RC de punta a punta) y `desplegar-aws` (despliegue seguro).
- Subagente `revisor-arquitectura`: úsalo antes de cerrar un cambio que cruce capas o toque herramientas.
- Para trabajo en paralelo, asigna dueños por carpeta (`apps/web`, `apps/backend/src/agent`, …) para evitar conflictos en `package.json` y `bun.lock`.
