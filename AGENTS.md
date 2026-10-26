# AGENTS.md — Agente "Órdenes de Compra SAP"

Agente conversacional que lee un paquete de compra, lo valida contra maestros (RC1–RC10),
arma la OC, genera la evidencia de aprobación y la crea en un SAP simulado. Las excepciones vuelven al humano.

Fuente de verdad del alcance: `docs/PRD.md`. Si algo aquí contradice el PRD, gana el PRD.

## Mapa del monorepo (Bun workspaces)

```
apps/backend/            monolito modular (layout del PRD 6.5)
  agent/*.md             comportamiento: system prompts (prompt.md = operador, router, voz…)
  src/server/ + main.ts  HTTP (Hono): /api/chat (SSE), /api/sessions/:id, /api/health…
  src/agent/             orquestación: router → especialista → verificador, sesiones, confirmación
  src/llm/               adaptador de proveedor: interfaz propia + Anthropic + "guion" (sin modelo)
  src/tools/oc.ts        ejecución: herramientas zod (oc_leer_paquete, oc_validar, …)
  src/sap/               SapAdapter + mock sobre out/sap/
  src/knowledge/         conocimiento del proceso (lo consulta el agente)
apps/web/                chat React + Vite (conversación a la izquierda, lienzo en vivo a la derecha)
packages/domain/         esquemas zod + reglas puras RC1–RC10, parsers. SIN IO.
packages/contracts/      tipos HTTP/SSE compartidos web ↔ backend (solo tipos)
fixtures/reto-03/        insumos de Periferia. SOLO LECTURA.
out/                     generado en ejecución (control.csv, log.jsonl, sap/, evidencias). No versionado.
modulo/                  bonus: agente empaquetado (generado desde las fuentes, no se edita a mano)
demo.ts                  corre los 6 casos llamando herramientas, sin modelo
infra/ + INFRA.md        despliegue AWS (Lightsail) desde CloudShell, inventario y borrado
```

## Comandos

| Qué | Comando |
|---|---|
| Levantar front + back | `bun run dev` |
| Verificación completa (lo que corre CI) | `bun run verify` |
| Demo sin modelo | `bun run demo.ts` |
| Tests (si existen; opcionales en esta fase) | `bun run test` |
| Lint + formato | `bun run lint` / `bun run lint:fix` |
| Tipos | `bun run typecheck` |
| Límites de capas | `bun run boundaries` |
| Regenerar / comprobar `modulo/` | `bun run modulo:build` / `bun run modulo:check` |

## Arquitectura: dirección de dependencias

```
web ──(import type)──▶ contracts ◀── backend/server ──▶ backend/agent ──▶ backend/llm
                                                          │
                                                          └──▶ backend/tools ──▶ backend/sap
                                                                     └──────────▶ domain
```

- `packages/domain` no hace IO (sin fs/path/http) y no conoce HTTP ni al proveedor LLM.
- `src/tools` y `src/sap` no importan `agent`, `server`, `llm`, `hono` ni el SDK del LLM: son importables desde `demo.ts`.
- `src/llm` no conoce herramientas, ciclo ni servidor. Cambiar de proveedor no toca el ciclo del agente.
- `src/agent` no conoce HTTP. El servidor solo transporta.
- `apps/web` solo importa `@oc/contracts` con `import type`.
- `bun run boundaries` lo verifica en local, en hooks y en CI.

Separación que evalúa el PRD: comportamiento en `agent/*.md`, conocimiento en `src/knowledge/`, ejecución en `src/tools/`.
Un cambio de reglas de negocio no debe tocar el servidor.

## Invariantes (no negociables)

1. Cada herramienta es `{ description, args (zod con .describe()), execute(args, ctx) }` y devuelve
   JSON string `{ ok: true, data }` o `{ ok: false, error }`. **Nunca lanza.**
2. El modelo no afirma valores que no salieron de una herramienta. Los montos y el payload los calcula el código.
3. `oc_crear` solo crea si `apta = true` y (sin confirmaciones o `confirmado = true` dado por el humano). Idempotente por `solicitud_id`.
4. Cada intento queda en `out/control.csv`; cada llamada a herramienta en `out/log.jsonl`.
5. TypeScript estricto, sin `any`. Funciones cortas, nombres consistentes.
6. Claves solo en variables de entorno del backend. Nunca en repo, front, logs ni respuestas.
7. `fixtures/` es inmutable (solo se agregan casos nuevos). `out/` se limpia al inicio de `demo.ts`.
8. Las herramientas no ejecutan comandos de shell.

## Definición de terminado

- `bun run verify` en verde (lint, límites, tipos, tests si existen, demo, módulo sincronizado).
- Tests automatizados opcionales en esta fase; si existen (`*.test.ts` junto al código), CI los corre.
- Si cambia una regla RC: dominio + `src/knowledge/` + prompt si aplica + salida de `demo.ts` (+ test si existe la suite).
- Documentación tocada si cambió el contrato (README / SOLUCION.md / INFRA.md).

## Convenciones

- Commits: Conventional Commits en español. `feat(tools): bloquea OC si el aprobador supera su tope`.
- Dominio en español (`solicitud`, `centro_costo`, `aprobador`), igual que el PRD. Infraestructura técnica en inglés cuando es estándar (`server`, `adapter`).
- Formato: Biome (2 espacios, comillas dobles, sin punto y coma, 120 columnas).
- Copys de UI y respuestas del agente: español neutro, claros, sin rayas largas.

## Seguridad AWS

La cuenta AWS es de **producción** con otros productos. Ningún agente ejecuta borrados en AWS:
el despliegue y el borrado los hace un humano en CloudShell siguiendo `INFRA.md`.
Todo recurso del proyecto se llama `perxia-reto03-*` y lleva el tag `proyecto=perxia-reto03`.
