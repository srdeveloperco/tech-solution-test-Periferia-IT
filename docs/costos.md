# Proyección de costos del agente

Estimación basada en el tamaño real de los prompts, las herramientas y los mensajes medidos en el observatorio (corrida de los 6 casos), con las tarifas de la API de Anthropic vigentes en octubre de 2026. Los valores reales de cada llamada quedan en el observatorio (`/api/observatorio/resumen`) con tokens de entrada, salida, lectura y escritura de caché.

## Tarifas usadas (USD por millón de tokens)

| Modelo | Entrada | Salida | Lectura de caché | Escritura de caché (5 min) |
|---|---|---|---|---|
| Claude Haiku 5.5 (`claude-haiku-5-5`) | 0,10 | 0,50 | 0,01 | 0,125 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2,00 | 10,00 | 0,20 | 2,50 |
| Claude Opus 5.5 (`claude-opus-5-5`, referencia) | 4,00 | 20,00 | 0,20 | 5,00 |

## Qué modelo hace qué y por qué

| Agente | Modelo | Cuándo se llama | Por qué |
|---|---|---|---|
| Router | Reglas → Haiku 5.5 | Reglas deterministas primero (botón, «sí/no» con pendiente, «procesa sol-XXX», saludos): costo cero. Haiku solo si el mensaje es ambiguo. | Clasificar es barato y rápido; la mayoría de turnos no necesita modelo. |
| Operador | Sonnet 5.5, esfuerzo `medium` | Turnos de procesar, confirmar o rechazar. Ciclo con herramientas, tope 25 iteraciones. | Uso de herramientas confiable en cadena; es el único agente que puede crear OC. |
| Asesor | Haiku 5.5, esfuerzo `low` | Preguntas de proceso o estado. Sin herramientas de escritura. | Responde con contexto ya preparado (casos, control, maestros); no necesita razonar en cadena. |
| Conversador | Haiku 5.5, esfuerzo `low` | Saludos, agradecimientos, fuera de alcance. | Respuestas de una o dos frases. |
| Verificador | Sin modelo | Siempre, al final del turno. | Determinista: compara cifras del texto con los resultados de herramientas. |

## Tamaños medidos (operador)

- Prefijo estable (herramientas + system prompt + voz + conocimiento): ~5.800 tokens. Se cachea con un punto de corte al final del sistema (reutilizable entre sesiones) y caché automática del historial dentro del turno.
- Un caso completo (`sol-001`): 6 llamadas al modelo (5 herramientas + respuesta). Los mensajes del turno crecen de ~100 a ~4.000 tokens.
- El operador **reinicia la conversación en cada turno** y recibe una memoria compacta de la sesión (resultado por caso y la OC validada cuando hay confirmación pendiente). No se reenvían los resultados completos de turnos anteriores.

## Costo por caso (estimado)

| Escenario | Llamadas | Entrada (lectura / escritura caché) | Salida | Costo Sonnet 5.5 |
|---|---|---|---|---|
| Caso completo sin confirmación (`sol-001`) | 6 | ~44.000 / ~3.900 | ~3.000 (incluye razonamiento) | **≈ USD 0,05** |
| Caso bloqueado (`sol-002`, `sol-003`) | 4 | ~25.000 / ~2.500 | ~2.000 | ≈ USD 0,03 |
| Turno de confirmación (`sol-004/005/006`) | 2 | ~12.700 / ~1.500 | ~1.000 | ≈ USD 0,017 |
| Router con Haiku (mensaje ambiguo) | 1 | ~700 | ~150 | ≈ USD 0,0002 |
| Pregunta al asesor (Haiku) | 1 | ~5.000 | ~300 | ≈ USD 0,0007 |

Sin caché, el caso completo costaría ≈ USD 0,13 (2,5 veces más). El caché es la palanca de ahorro más grande.

**Promedio por OC** (un tercio requiere confirmación, algunas consultas): ≈ **USD 0,06**.

## Cuánto cabe en el presupuesto de USD 10

| Interacción | Costo esperado | Cuántas caben en USD 10 |
|---|---|---|
| **Interacción típica** (un turno: procesar o confirmar un caso, mezcla real) | ≈ USD 0,03 | ≈ 330 |
| **Caso completo** (procesar + confirmar cuando aplica) | ≈ USD 0,06 | ≈ 165 |
| Caso completo sin confirmación (peor caso habitual) | ≈ USD 0,05 | ≈ 200 |
| Pregunta al asesor o charla (Haiku) | ≈ USD 0,001 | ≈ 10.000 |
| Mensaje resuelto por reglas + guion (sin modelo) | USD 0 | ilimitadas |

La demo completa de los 6 casos (6 procesamientos + 3 confirmaciones) cuesta ≈ USD 0,30. El observatorio muestra el gasto real acumulado contra el límite.

## Escenario mensual

| Volumen | Solo OC | Con 20 % de conversación adicional |
|---|---|---|
| 300 OC/mes | ≈ USD 17 | ≈ USD 20 |
| 1.000 OC/mes | ≈ USD 57 | ≈ USD 70 |

Referencia de ahorro: una analista que hoy digita una OC en 8 a 12 minutos libera 40 a 60 horas al mes con 300 OC.

## Comparación con alternativas

| Arquitectura | Costo por OC | Comentario |
|---|---|---|
| **Actual**: reglas + Haiku (router, asesor, conversador) + Sonnet (operador) | ≈ USD 0,06 | El modelo caro solo trabaja cuando hay herramientas. |
| Sonnet para todo (router en cada turno, asesor en Sonnet) | ≈ USD 0,07–0,08 | Router en Sonnet ≈ USD 0,003 por turno; asesor ≈ USD 0,013 por pregunta. |
| Opus 5.5 como operador (escalamiento opcional) | ≈ USD 0,09 | Más capacidad de la necesaria para un flujo de 5 herramientas. Solo se activa por variable de entorno (`LLM_MODELO_OPERADOR=claude-opus-5-5`) si aparecen casos con muchas posiciones o paquetes ambiguos; no es el valor por defecto. |
| Sin caché y reenviando historial completo | ≈ USD 0,15–0,25 | El costo crece con cada turno de la sesión. |
| Proveedor `guion` (sin modelo) | USD 0 | Demo, CI y respaldo sin clave. Respuestas por plantilla. |

## Capacidades de la API que se aprovechan

- **Prompt caching**: punto de corte al final del bloque de sistema (herramientas + prompt + voz + conocimiento, reutilizable entre sesiones) y caché automática del historial dentro del turno. Lecturas a 0,1× (Haiku/Sonnet).
- **Streaming** en todas las llamadas: el texto llega al chat mientras se genera (`texto_delta`) y las entradas de herramientas grandes se transmiten con `eager_input_streaming`; el backend las valida con zod antes de ejecutar.
- **Salida estructurada** (`output_config.format` con JSON Schema) en el router: siempre devuelve una intención válida, sin parseo frágil. Sonnet 5.5 no admite forzar herramientas (`tool_choice` any/tool), por eso no se usa ese mecanismo.
- **Esfuerzo por agente** (`output_config.effort`): `medium` para el operador, `low` para router, asesor y conversador.
- **`tool_choice: none`** cuando la OC queda pendiente: el modelo debe cerrar el turno con la pregunta de confirmación.
- **Historial solo de anexión** dentro del turno (los bloques de razonamiento se devuelven intactos) y **reinicio por turno** con memoria compacta: el costo de cada turno no crece con la longitud de la sesión.
- **Estimación local** del costo antes de cada llamada (caracteres ÷ 3,5 × tarifa de entrada sin caché + mitad del tope de salida): no duplica llamadas al endpoint de conteo de tokens.

## Controles de gasto implementados

- **Presupuesto global** (`PRESUPUESTO_USD`, por defecto USD 10): antes de cada llamada se consulta `observador.puedeGastar(estimado)` con una estimación conservadora (entrada sin caché + mitad del tope de salida). Si no alcanza, no se llama al modelo y se responde en lenguaje claro. Con USD 10 alcanzan ~170 casos completos.
- **Tope de tokens por sesión** (`AGENT_MAX_TOKENS_SESION`, 300.000) y **tope de iteraciones por turno** (`AGENT_MAX_ITERACIONES`, 25).
- **`max_tokens` por agente**: router 1.024, operador 8.000, asesor 2.000, conversador 1.000.
- **Límite por IP**: 30 mensajes por minuto.
- **Timeout** al proveedor (`LLM_TIMEOUT_MS`, 60 s) con mensaje claro.
