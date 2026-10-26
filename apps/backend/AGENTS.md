# apps/backend — monolito modular

Layout del PRD 6.5. Cada carpeta es una capa con una sola responsabilidad:

| Carpeta | Responsabilidad | Puede importar |
|---|---|---|
| `agent/*.md` | Comportamiento (system prompts). Sin código. | — |
| `src/knowledge/` | Conocimiento del proceso de OC (Markdown). | — |
| `src/tools/` | Herramientas zod. Única fuente de valores que el agente afirma. | `@oc/domain`, `src/sap` |
| `src/sap/` | `SapAdapter` + mock sobre `out/sap/`. | `@oc/domain` |
| `src/llm/` | Interfaz `enviar(mensajes, herramientas)` + implementaciones. | SDK del proveedor |
| `src/agent/` | Router → especialista → verificador; sesiones; confirmación humana; topes. | tools, llm, domain, contracts |
| `src/server/`, `src/main.ts` | Transporte HTTP/SSE (Hono). Sin lógica de negocio. | todo lo anterior |

Reglas:
- Herramientas: nombre visible `<archivo>_<export>`; `execute` nunca lanza; rutas desde `ctx.directory`.
- La confirmación la impone el código (el ciclo), no solo el prompt.
- Tope de iteraciones por turno y de tokens por sesión desde env (`AGENT_MAX_ITERACIONES`, `AGENT_MAX_TOKENS_SESION`).
- No registres el contenido de variables de entorno ni encabezados de autorización.
- Tests opcionales en esta fase (`*.test.ts` junto al código). El proveedor `guion` permite probar el ciclo sin red.
- Autenticación: Cognito (`AUTH_MODO=cognito`). El backend valida el ID token; el front nunca ve claves.
- Presupuesto global de IA (`PRESUPUESTO_USD`) y observabilidad en SQLite (`out/observatorio.db`, efímera).
