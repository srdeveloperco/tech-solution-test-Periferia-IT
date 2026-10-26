# Agente OC · Órdenes de compra SAP

Agente conversacional que lee el paquete de compra (solicitud, cotización, aprobación y factura), lo valida contra los maestros con los controles RC1–RC10, arma la orden de compra, genera la evidencia de aprobación y la crea en un SAP simulado. Las excepciones se devuelven al humano: los bloqueos con su acción sugerida y las dudas como confirmación.

- **Link de prueba:** _se publica al desplegar (ver [INFRA.md](INFRA.md))_
- **Acceso (login obligatorio, Amazon Cognito):** usuario de prueba `evaluador@periferia-ficticia.com` con rol `admin` (chat, observatorio y costos). La clave se entrega junto con el link (ver "Acceso para evaluadores" en [INFRA.md](INFRA.md)).
- En local el login también es obligatorio: modo `local` con `AUTH_USUARIO`/`AUTH_CLAVE` del `.env`. El modo `abierto` solo se acepta fuera de producción y si se pide explícitamente.
- **Planteamiento completo:** [SOLUCION.md](SOLUCION.md) · costos: [docs/costos.md](docs/costos.md) · PRD: [docs/PRD.md](docs/PRD.md)

## Arranque local (un comando)

Requisitos: [Bun](https://bun.sh) 1.4 o superior.

```bash
cp .env.example .env      # pon tu ANTHROPIC_API_KEY y una AUTH_CLAVE (sin clave de modelo usa el proveedor "guion")
bun install
bun run dev               # backend en :8080 y front en :5173 (proxy /api → :8080)
```

Modo producción, igual que en el contenedor:

```bash
bun run build && bun run start   # el backend sirve el front compilado en :8080
```

## Verificación sin modelo

```bash
bun install && bun run demo.ts
```

Procesa los 6 casos de `fixtures/reto-03/solicitudes/` llamando directamente a las herramientas. Imprime por caso `apta`, bloqueos, confirmaciones, `retroactiva` y el número de OC o el motivo. Muestra además la idempotencia (sol-001 dos veces) y la confirmación explícita de sol-004. Limpia `out/` al inicio.

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` o `guion` (determinista, sin clave) | `anthropic`; cae a `guion` si no hay clave |
| `ANTHROPIC_API_KEY` | Clave del modelo. Solo en el backend, nunca en el front, el repo ni los logs | — |
| `LLM_MODELO_ROUTER` / `LLM_MODELO_OPERADOR` / `LLM_MODELO_ASESOR` | Modelo por agente | Haiku 5.5 / Sonnet 5.5 / Haiku 5.5 |
| `AGENT_MAX_ITERACIONES` | Tope herramienta → modelo por turno | 25 |
| `AGENT_MAX_TOKENS_SESION` | Tope de tokens por sesión | 300000 |
| `PRESUPUESTO_USD` | Gasto máximo global en IA de la cuenta de prueba | 10 |
| `LLM_TIMEOUT_MS` | Timeout al proveedor | 60000 |
| `AUTH_MODO` | `cognito` (producción) o `local`. Si falta la configuración, el login queda cerrado | — |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | Login con Amazon Cognito | — |
| `AUTH_USUARIO`, `AUTH_CLAVE`, `AUTH_SECRETO` | Login local de respaldo | — |
| `PORT` | Puerto HTTP | 8080 |
| `OUT_DIR` | Carpeta de salida | `./out` |

## API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId?, message, confirmar?: { caso } }`. Responde con un stream SSE de eventos (`sesion`, `ruta`, `herramienta_inicio`, `herramienta_fin`, `texto_delta`, `mensaje`, `confirmacion`, `verificacion`, `error`, `fin`). Con `Accept: application/json` devuelve `{ reply, toolCalls[], needsConfirmation, ... }` |
| `GET` | `/api/sessions/:id` | Historial completo de la sesión |
| `GET` | `/api/health` | `{ ok, provider, model, modelos }`, sin claves (público) |
| `GET` | `/api/casos` | Casos disponibles con su último estado |
| `GET` | `/api/control` | `out/control.csv` |
| `GET` | `/api/evidencia/:caso?formato=pdf\|txt` | Evidencia de aprobación |
| `GET` | `/api/presupuesto` | Gasto acumulado vs límite |
| `GET` | `/api/observatorio/resumen` · `/interacciones` · `/interacciones/:id` | Trazas: prompts, llamadas al modelo, herramientas, costo |
| `GET`/`POST` | `/api/auth/config` · `/api/auth/login` | Autenticación (públicas) |

Todas las rutas salvo `/api/health` y `/api/auth/*` exigen `Authorization: Bearer <token>` cuando el login está activo. Los tipos están en [`packages/contracts`](packages/contracts/src/index.ts).

## Estructura

```
apps/
  backend/                 monolito modular (layout del PRD 6.5)
    agent/                 prompts: prompt.md (operador), router.md, asesor.md, conversador.md, voz.md
    src/server/            HTTP (Hono), SSE
    src/agent/             orquestación: router → especialista → verificador, sesiones, confirmación
    src/llm/               adaptador propio + anthropic + guion
    src/tools/oc.ts        herramientas zod (oc_leer_paquete, oc_validar, oc_construir_payload, oc_generar_evidencia, oc_crear)
    src/sap/               SapAdapter + mock sobre archivos
    src/knowledge/         conocimiento del proceso
    src/observabilidad/    observer propio (SQLite) + presupuesto
    src/auth/              Cognito / local / abierto
  web/                     chat con lienzo en vivo, login y observatorio (React + Vite)
packages/
  domain/                  esquemas zod y reglas RC1–RC10 puras (sin IO)
  contracts/               tipos HTTP/SSE compartidos web ↔ backend
modulo/                    bonus: agente empaquetado (generado desde apps/backend)
fixtures/                  entregados por Periferia (solo lectura)
infra/  INFRA.md           despliegue en AWS (Lightsail + Cognito) y borrado
demo.ts                    verificación sin modelo
```

## Comandos

| Comando | Qué hace |
|---|---|
| `bun run dev` | Front y backend con recarga |
| `bun run demo.ts` | Verificación determinista sin modelo |
| `bun run verify` | lint + typecheck + demo + sincronía de `modulo/` |
| `bun run boundaries` | Verifica los límites entre capas |
| `bun run modulo:build` | Regenera `modulo/` desde las fuentes de la app |
| `bun run build` / `bun run start` | Compila el front y arranca en modo producción |

Harness de desarrollo con agentes de IA: [AGENTS.md](AGENTS.md) (reglas), `.claude/` (hooks, skills y subagente revisor) y `lefthook.yml` (git hooks).
