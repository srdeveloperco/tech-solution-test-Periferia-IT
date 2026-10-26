# EP-09 · Harness de desarrollo asistido por IA

| Campo | Valor |
|---|---|
| Épica | EP-09 Harness de desarrollo asistido por IA |
| Objetivo de negocio | Que el desarrollo con asistentes de IA sea rápido y paralelo sin romper la arquitectura, los contratos ni la seguridad de la cuenta de producción |
| Estado | Hecho |
| Prioridad | Media-alta (habilitador de las demás épicas) |
| Estimación | 8 puntos |
| Sesiones de origen | S4, S6 |
| Trazabilidad PRD | §0 (IA permitida, declarar su uso), §6.5 (separación comportamiento / conocimiento / ejecución), §8 Legibilidad, Seguridad y Dependencias, §9.1 punto 11 (uso de IA) |

## 1. Levantamiento

**Sesiones de origen.** S4 (arquitectura, seguridad y nube), S6 (revisión y aceptación).

**Hallazgos.**

- Equipo Perxia (S4): "Vamos a trabajar con varios agentes en paralelo; necesitamos reglas que se cumplan solas, no un documento que nadie lee."
- Equipo Perxia (S4): "La separación entre prompt, conocimiento y herramientas es lo que evalúan. Si alguien importa el servidor desde una herramienta, que falle."
- Líder de TI/Seguridad (S4): "Ningún asistente puede borrar nada en AWS ni leer un `.env`. Eso lo hago yo a mano."
- Contabilidad/Auditoría (S2/S4): "Los fixtures son la evidencia del caso; nadie los modifica."
- Equipo Perxia (S6): "Que los commits cuenten la historia: mensajes convencionales y en español."

**Necesidades.** Instrucciones cortas y por capa para los agentes; reglas duras impuestas por hooks y permisos; verificación determinista de límites entre capas; git hooks locales; conocimiento contextual en skills; un revisor especializado.

**Restricciones.** Prácticas 2026: `AGENTS.md` como estándar compartido entre herramientas y anidado por cercanía; instrucciones breves (menos de 150 líneas); las reglas duras van en hooks, no en texto.

## 2. Historias de usuario

### HU-09.1 · Instrucciones para agentes por capa

**Como** equipo Perxia **quiero** un `AGENTS.md` raíz corto y uno por capa **para** que cualquier asistente entienda el mapa, los comandos y los invariantes sin leer todo el repo.

```gherkin
Escenario: Instrucciones raíz
  Dado un asistente que abre el repositorio
  Entonces AGENTS.md (91 líneas) le da misión, mapa del monorepo, comandos, dirección de dependencias, invariantes y definición de terminado

Escenario: Instrucciones por cercanía
  Dado que el asistente edita apps/web
  Entonces lee también apps/web/AGENTS.md con las reglas de diseño y de importación de tipos

Escenario: Claude Code
  Dado Claude Code
  Entonces CLAUDE.md importa @AGENTS.md y agrega solo lo específico (hooks, skills, subagente)
```

- Prioridad: P1 · Puntos: 1 · Estado: Hecho.

### HU-09.2 · Hooks que imponen reglas duras

**Como** líder de TI/Seguridad **quiero** que el asistente no pueda editar insumos protegidos ni ejecutar comandos peligrosos **para** que un error de un agente no tenga consecuencias.

```gherkin
Escenario: Rutas protegidas
  Dado un agente que intenta editar fixtures/reto-03/maestros/proveedores.json
  Entonces el hook guard-paths lo bloquea con la razón

Escenario: Borrado en AWS
  Dado un agente que intenta "aws lightsail delete-container-service" o ejecutar 99-eliminar.ps1
  Entonces el hook guard-bash lo bloquea: los borrados solo los ejecuta un humano siguiendo INFRA.md

Escenario: Push forzado y secretos
  Dado un agente que intenta "git push --force" o leer .env
  Entonces guard-bash lo bloquea (se permite --force-with-lease en la propia rama)
```

- Reglas: exit 2 con mensaje claro para que el agente corrija su plan.
- Prioridad: P0 · Puntos: 2 · Estado: Hecho.

### HU-09.3 · Calidad automática en cada edición y al cerrar el turno

**Como** equipo Perxia **quiero** formateo y verificación automáticos **para** no acumular errores entre agentes que trabajan en paralelo.

```gherkin
Escenario: Formato al editar
  Dado que un agente escribe un archivo TypeScript
  Entonces format-file corre biome check --write sobre ese archivo y devuelve los errores que queden

Escenario: Verificación al cerrar
  Dado un turno con cambios en apps/ o packages/
  Cuando el agente intenta terminar
  Entonces stop-verify corre typecheck, límites de capas y tests si existen
  Y si falla, el agente debe seguir trabajando (una vez por turno)

Escenario: Sesión en la nube
  Dado una sesión remota nueva
  Entonces session-start asegura bun 1.4.4 y ejecuta bun install de forma idempotente
```

- Prioridad: P1 · Puntos: 2 · Estado: Hecho.

### HU-09.4 · Límites de capas verificados

**Como** equipo Perxia **quiero** un chequeo determinista de imports entre capas **para** proteger la separación que evalúa el PRD.

```gherkin
Escenario: Dominio puro
  Dado un import de node:fs en packages/domain
  Cuando corro bun run boundaries
  Entonces falla indicando la capa y el import prohibido

Escenario: Herramientas independientes del servidor
  Dado un import de hono o de ../agent en apps/backend/src/tools
  Entonces bun run boundaries falla

Escenario: Front solo con tipos
  Dado un import de valor (no de tipo) desde @oc/contracts o @oc/domain en apps/web
  Entonces bun run boundaries falla

Escenario: Estado actual
  Cuando corro bun run boundaries
  Entonces responde "Límites de capas OK (6 capas revisadas)"
```

- Prioridad: P0 · Puntos: 1 · Estado: Hecho.

### HU-09.5 · Git hooks locales

**Como** equipo Perxia **quiero** validaciones antes de commit y push **para** que lo que llega a GitHub ya esté verificado.

```gherkin
Escenario: Pre-commit
  Dado archivos en stage
  Entonces corren en paralelo Biome (con stage_fixed), el chequeo de fixtures (solo se permite agregar casos) y el escaneo de secretos (sk-ant-, AKIA)

Escenario: Mensaje de commit
  Dado el mensaje "arreglos varios"
  Entonces commit-msg lo rechaza y pide formato Conventional Commits

Escenario: Pre-push
  Cuando hago git push
  Entonces corren typecheck, límites, tests si existen y demo.ts
```

- Prioridad: P1 · Puntos: 1 · Estado: Hecho.

### HU-09.6 · Skills y subagente especializados

**Como** equipo Perxia **quiero** conocimiento empaquetado para tareas recurrentes y un revisor de arquitectura **para** repetir cambios comunes de forma consistente.

```gherkin
Escenario: Nueva regla de control
  Dado que contabilidad pide cambiar la tolerancia de RC5
  Cuando un agente usa la skill nueva-regla-control
  Entonces sigue el recorrido dominio puro, conocimiento, prompt si aplica y salida de demo.ts

Escenario: Despliegue seguro
  Dado una pregunta sobre cómo desplegar o borrar
  Entonces la skill desplegar-aws remite a INFRA.md y a sus guardas

Escenario: Revisión antes de cerrar
  Dado un cambio que toca tools, agent, llm o el contrato
  Entonces el subagente revisor-arquitectura verifica capas y el contrato de herramientas del PRD 6.2
```

- Prioridad: P2 · Puntos: 1 · Estado: Hecho.

## 3. Solución implementada

| Pieza | Ruta |
|---|---|
| Instrucciones raíz y por capa | `AGENTS.md`, `apps/backend/AGENTS.md`, `apps/web/AGENTS.md`, `packages/domain/AGENTS.md` |
| Específico de Claude Code | `CLAUDE.md` |
| Permisos y registro de hooks | `.claude/settings.json` |
| Hooks | `.claude/hooks/guard-paths.ts`, `guard-bash.ts`, `format-file.ts`, `stop-verify.ts`, `session-start.sh`, `_comun.ts` |
| Skills | `.claude/skills/nueva-regla-control/SKILL.md`, `.claude/skills/desplegar-aws/SKILL.md` |
| Subagente | `.claude/agents/revisor-arquitectura.md` |
| Límites de capas | `scripts/check-boundaries.ts` (`bun run boundaries`) |
| Git hooks | `lefthook.yml`, `scripts/harness/check-fixtures.ts`, `scan-secrets.ts`, `commit-msg.ts`, `test-si-hay.ts` |
| Lint y formato | `biome.json`, `.editorconfig` |

**Trabajo en paralelo.** La construcción se repartió entre agentes con dueños por carpeta: dominio y herramientas; orquestación del agente (`apps/backend/src/agent`, `src/llm`, `src/server`); front (`apps/web`); harness, CI/CD e infraestructura; observabilidad, autenticación y persistencia. Los contratos compartidos (`packages/contracts`, `packages/domain/src/esquemas.ts`, firma de herramientas) se definieron antes de repartir, y las dependencias se instalaron al inicio para evitar conflictos en `bun.lock`.

## 4. Verificación

- Cada hook se probó con JSON de ejemplo por stdin: bloquea y deja pasar lo esperado.
- `bun run boundaries` detectó violaciones introducidas a propósito y hoy responde OK con 6 capas.
- Los git hooks corrieron en cada commit y push de la construcción (Biome, secretos, Conventional Commits, verificación pre-push en verde).
- Los hooks atraparon problemas reales durante el trabajo en paralelo: errores de tipos en el front a mitad de construcción y archivos sin formatear.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| `AGENTS.md` como fuente y `CLAUDE.md` que lo importa | Solo `CLAUDE.md` | Estándar leído por varias herramientas; una sola fuente de verdad |
| Reglas duras en hooks y permisos | Reglas solo en texto | El texto orienta; los hooks garantizan |
| Script propio de límites de capas | Reglas de imports del linter | Más preciso para rutas relativas entre capas y con mensajes por capa |
| lefthook | husky + lint-staged | Un binario rápido, ejecución en paralelo y configuración en un archivo |
| Biome | ESLint + Prettier | Una sola herramienta, mucho más rápida |
| Biome no formatea Markdown | Formatear todo | Biome 2.6 rompía el frontmatter de prompts y skills |

## 6. Pendientes para producción

- Agregar la suite de tests (unitarios de reglas y e2e del ciclo con el proveedor determinista) y volverla obligatoria en pre-push y CI.
- Escaneo de secretos con herramienta dedicada (gitleaks) y análisis de dependencias.
- Protección de rama `main` con revisión obligatoria y checks requeridos.
- Más skills: alta de un caso nuevo de fixtures y cambio de proveedor LLM.
