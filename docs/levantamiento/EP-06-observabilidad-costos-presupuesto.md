# EP-06 · Observabilidad, costos y presupuesto de IA

| Campo | Valor |
|---|---|
| Épica | EP-06 Observabilidad, costos y presupuesto de IA |
| Objetivo de negocio | Saber qué hace el agente en cada interacción (qué prompt envió, qué respondió el modelo, qué herramientas ejecutó, cuánto costó) y garantizar que la cuenta de prueba nunca gaste más de USD 10 |
| Estado | Hecho |
| Prioridad | Alta (P0 para el presupuesto, P1 para la vista) |
| Estimación | 13 puntos |
| Sesiones de origen | S4, S5, S6 |
| Trazabilidad PRD | §6.3 CA4 (trazas visibles y `out/log.jsonl`), §8 Costo (topes configurables), §8 Seguridad (claves fuera de logs), §9.1 sección 4 (costo estimado por caso) |

## 1. Levantamiento

**Sesiones de origen.** S5 (costos y observabilidad con la dirección y el equipo Perxia), S4 (seguridad con el líder de TI) y S6 (aceptación).

**Hallazgos**

- Dirección administrativa y financiera (S5): "La cuenta de prueba tiene un techo: máximo USD 10. Si se acaba, que el sistema lo diga y pare, no que siga cobrando."
- Equipo Perxia (S5): "Para mantener el agente necesitamos ver exactamente qué prompt se envió, con qué variables y qué respondió el modelo. Sin eso, optimizar es adivinar."
- Equipo Perxia (S5): "No queremos meter LangChain ni una plataforma externa solo para esto. Algo propio y simple, en base de datos."
- Líder de TI/Seguridad (S4): "En los logs no puede aparecer ninguna clave, ni de Anthropic ni de AWS, ni tokens de sesión."
- Dirección administrativa y financiera (S6): "Quiero ver cuánto cuesta en promedio una interacción y cuántas caben en el presupuesto antes de aprobar el piloto."

**Necesidades**

1. Registro de cada interacción, cada llamada al modelo y cada ejecución de herramienta.
2. Costo por llamada, por interacción, por modelo y por agente, con tokens de caché.
3. Presupuesto global con bloqueo duro antes de llamar al modelo.
4. Vista de consulta para administradores, no para todos los usuarios.
5. Proyección de costos para decidir el piloto.

**Restricciones**

- Sin dependencias de observabilidad de terceros.
- Datos sensibles redactados antes de guardarse.
- La observabilidad nunca interrumpe un turno; el presupuesto sí (falla cerrado).

## 2. Historias de usuario

### HU-06.1 · Registrar la traza completa de cada interacción

**Como** equipo Perxia **quiero** guardar por cada turno la ruta, cada llamada al modelo y cada herramienta ejecutada **para** mantener, depurar y optimizar el agente con datos reales (CA4).

```gherkin
Escenario: Traza de un caso con confirmación
  Dado que la analista escribe "Procesa la solicitud sol-004"
  Cuando termina el turno
  Entonces existe una interacción con agente "operador", intención "procesar_caso", caso "sol-004" y resultado "confirmacion"
  Y cada llamada al modelo guarda el system prompt (por hash), los mensajes enviados, las variables dinámicas, la respuesta cruda, el stop reason, los tokens, el costo y la latencia
  Y cada herramienta guarda argumentos, resultado, ok y milisegundos

Escenario: Versionado de prompts
  Dado que cambia el texto de apps/backend/agent/prompt.md
  Cuando se hace la siguiente llamada del operador
  Entonces se registra un nuevo hash de prompt y las llamadas anteriores conservan el suyo

Escenario: Fallo al escribir la traza
  Dado que la base de datos no permite escribir
  Entonces el turno termina normalmente y el error queda en la consola del servidor
```

**Reglas de negocio**
- El texto completo del system prompt se guarda una sola vez por hash (tabla `prompts`); las llamadas lo referencian.
- Cada llamada a herramienta también queda en `out/log.jsonl`.

**Prioridad:** Alta · **Puntos:** 5 · **Estado:** Hecho

### HU-06.2 · Bloquear el gasto al llegar al presupuesto

**Como** dirección administrativa y financiera **quiero** un límite global de USD 10 verificado antes de cada llamada **para** que la prueba nunca exceda lo aprobado.

```gherkin
Escenario: Gasto dentro del límite
  Dado que el gasto acumulado es USD 0,30
  Cuando el operador va a llamar al modelo con un costo estimado conservador de USD 0,02
  Entonces la llamada se permite

Escenario: Límite alcanzado
  Dado que el gasto acumulado más el estimado supera USD 10
  Cuando la analista envía un mensaje
  Entonces no se llama al modelo
  Y el chat responde en lenguaje claro que se alcanzó el límite de gasto de la cuenta de prueba
  Y la interacción queda con resultado "bloqueado_presupuesto"

Escenario: No se puede leer el gasto
  Dado que la consulta del gasto falla
  Entonces la llamada no se autoriza (falla cerrado)
```

**Reglas de negocio**
- `PRESUPUESTO_USD` (10 por defecto); gasto = suma de `costo_usd` de `llamadas_llm`.
- Topes complementarios: `AGENT_MAX_ITERACIONES` (25) por turno, `AGENT_MAX_TOKENS_SESION` (300.000) por sesión y límite de peticiones por IP.
- Segunda barrera recomendada: límite de gasto del workspace en la consola de Anthropic.

**Prioridad:** Alta · **Puntos:** 3 · **Estado:** Hecho

### HU-06.3 · Mantener bajo el costo por interacción sin perder calidad

**Como** equipo Perxia **quiero** que el modelo caro solo trabaje donde aporta **para** que la analista pueda conversar varias veces sin agotar el presupuesto.

```gherkin
Escenario: Confirmación barata
  Dado que sol-004 está pendiente
  Cuando la analista escribe "confirmo"
  Entonces el router resuelve por reglas (costo 0) y el operador hace 2 llamadas (≈ USD 0,017)

Escenario: Pregunta de proceso
  Cuando la analista pregunta por una regla
  Entonces responde el asesor con Haiku 5.5 (≈ USD 0,001)

Escenario: Turnos siguientes de la misma sesión
  Dado una sesión con varios casos procesados
  Entonces el operador recibe una memoria compacta y no los resultados completos de turnos anteriores
```

**Reglas de negocio**
- Prompt caching del prefijo estable (herramientas, prompt, voz, conocimiento).
- Esfuerzo por agente: `medium` para el operador, `low` para router, asesor y conversador.
- `max_tokens` por agente: router 1.024, operador 8.000, asesor 2.000, conversador 1.000.

**Prioridad:** Alta · **Puntos:** 2 · **Estado:** Hecho

### HU-06.4 · Consultar el observatorio

**Como** administrador **quiero** una vista con presupuesto, totales, desgloses y el detalle de cada interacción **para** decidir mejoras sin abrir la base de datos.

```gherkin
Escenario: Acceso de administrador
  Dado que inicio sesión como evaluador@periferia-ficticia.com (grupo admin)
  Cuando abro "Observatorio"
  Entonces veo gastado vs límite, interacciones, llamadas, tokens, costo promedio y latencia p50 y p95
  Y el desglose por modelo, por agente y por versión de prompt

Escenario: Detalle de una interacción
  Cuando abro la interacción de "procesa sol-002"
  Entonces veo la ruta, cada llamada al modelo con su system prompt plegable y cada herramienta con su resultado

Escenario: Usuario sin rol admin
  Dado un usuario del grupo analista
  Cuando pide /api/observatorio/resumen
  Entonces recibe 403 con "Esta sección es solo para administradores."
```

**Prioridad:** Media · **Puntos:** 2 · **Estado:** Hecho

### HU-06.5 · Proyectar el costo del piloto

**Como** dirección **quiero** el costo esperado por interacción, por caso y por mes **para** aprobar el piloto con números.

```gherkin
Escenario: Proyección documentada
  Cuando reviso docs/costos.md
  Entonces encuentro el costo por interacción típica (≈ USD 0,03), por caso completo (≈ USD 0,05 a 0,06)
  Y cuántas caben en USD 10 (≈ 330 interacciones o ≈ 165 casos)
  Y el escenario mensual para 300 y 1.000 OC
```

**Prioridad:** Media · **Puntos:** 1 · **Estado:** Hecho

## 3. Solución implementada

Patrón Observer propio sobre SQLite (`bun:sqlite`), en la misma base que el histórico conversacional (ver EP-07).

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Puerto `Observador` | `apps/backend/src/observabilidad/tipos.ts` | `iniciarInteraccion`, `registrarRuta`, `registrarLlamadaLlm`, `registrarHerramienta`, `cerrarInteraccion`, `puedeGastar`, `presupuesto`, `resumen`, `interacciones`, `interaccion` |
| Implementación | `apps/backend/src/observabilidad/sqlite.ts` | Escritura síncrona, agregados, percentiles, presupuesto que falla cerrado |
| Esquema y consultas | `apps/backend/src/observabilidad/esquema.ts`, `apps/backend/src/persistencia/migraciones.ts` (migración 1) | Tablas `interacciones`, `prompts`, `llamadas_llm`, `ejecuciones_herramienta` |
| Redacción | `apps/backend/src/observabilidad/redactar.ts` | Oculta `sk-ant-…`, `Bearer …`, JWT, `AKIA…` y campos tipo clave o token; recorta campos a 200.000 caracteres |
| Rutas HTTP | `apps/backend/src/observabilidad/rutas.ts`, montadas en `apps/backend/src/server/app.ts` | `GET /api/observatorio/resumen`, `/interacciones?limite=`, `/interacciones/:id` (detrás de `soloAdmin`); `GET /api/presupuesto` para cualquier usuario autenticado |
| Puerta al modelo | `apps/backend/src/agent/modelo.ts` | `estimarCosto` conservador, `puedeGastar` antes de cada llamada, cálculo del costo real y registro |
| Precios | `apps/backend/src/llm/precios.ts` | Tarifas por modelo, incluidas lectura y escritura de caché |
| Log de herramientas | `apps/backend/src/agent/log.ts` | `out/log.jsonl` (CA4) |
| Vista | `apps/web/src/componentes/observatorio/Observatorio.tsx` | Presupuesto y totales en franja tipo libro mayor, tablas por modelo, agente y prompt, lista y detalle de interacciones |
| Proyección | `docs/costos.md` | Tarifas, tamaños medidos, costo por escenario, escenario mensual y comparación de alternativas |

**Cifras clave** (de `docs/costos.md`): caso completo sol-001 ≈ USD 0,05 (6 llamadas, 5 herramientas); turno de confirmación ≈ USD 0,017; pregunta al asesor ≈ USD 0,001; demo de los 6 casos con 3 confirmaciones ≈ USD 0,30. Sin caché, el caso completo costaría unas 2,5 veces más.

## 4. Verificación

| Prueba | Cómo | Resultado |
|---|---|---|
| Traza completa | Servidor local (proveedor `guion`), 4 interacciones y lectura de `/api/observatorio/resumen` y del detalle | Interacciones, llamadas y herramientas registradas; prompts por hash con sus usos |
| Rol | Usuario sin grupo admin contra `/api/observatorio/*` | 403 con mensaje claro |
| Vista | Playwright en escritorio | Observatorio con presupuesto, desgloses y detalle sin errores de consola |
| Costo real | Despliegue en Lightsail con modelos de Anthropic, prueba manual de la usuaria | El observatorio muestra costo y tokens reales por interacción |
| Redacción | Prueba manual con valores con forma de clave | Guardados como `***` |

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Observer propio en SQLite | LangChain, Langfuse u otra plataforma | Cero dependencias y cero recursos extra; guarda exactamente lo que se necesita |
| Presupuesto que falla cerrado | Alerta sin bloqueo | El límite de USD 10 es un requisito duro de la dirección |
| Estimación conservadora antes de la llamada | Solo contabilizar después | Evita pasarse del límite con la última llamada |
| Prompt guardado por hash | Guardar el prompt completo en cada llamada | Menos almacenamiento y versionado natural del prompt |
| Observatorio solo para admin | Visible para todos | Contiene prompts, costos y textos de usuarios |

## 6. Pendientes para producción

- Llevar el observatorio a una base gestionada con retención definida (por ejemplo, 90 días para `llamadas_llm`) y particionado por fecha.
- Alertas al 50 %, 80 % y 100 % del presupuesto (correo o Slack).
- Presupuestos por usuario o por área, además del global.
- Exportar trazas a una herramienta de análisis para comparar versiones de prompt con evaluaciones automáticas.
