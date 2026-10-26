# EP-03 · Orquestación multi-agente y conversación humana

| Campo | Valor |
|---|---|
| Épica | EP-03 Orquestación multi-agente y conversación humana |
| Objetivo de negocio | Que la analista converse con el agente en lenguaje natural y el agente decida, con el costo mínimo, quién atiende cada mensaje, sin afirmar valores inventados y sin crear una OC sin permiso |
| Estado | Hecho |
| Prioridad | Alta (P0) |
| Estimación | 21 puntos |
| Sesiones de origen | S1, S3, S4, S5, S6 |
| Trazabilidad PRD | §6.1 (ciclo del agente, adaptador LLM, system prompt), §6.3 CA1 a CA5, §6.4 API, §11 prompt de demo, O3 |

## 1. Levantamiento

**Sesiones de origen.** S1 (descubrimiento con la analista), S3 (experiencia de usuario), S4 (arquitectura con el equipo Perxia), S5 (costos de IA) y S6 (aceptación).

**Hallazgos**

- Analista administrativa (S1): "Yo no quiero aprender comandos. Quiero escribir 'procesa la de Cloud Andina' y que me diga qué pasa."
- Analista administrativa (S3): "Cuando algo no cuadra, díganmelo en una frase y pregúntenme. No me pongan un reporte de veinte líneas."
- Contabilidad/Auditoría (S2): "Si el sistema me dice un número, ese número tiene que salir de los documentos, no de la imaginación del modelo."
- Equipo Perxia (S4): "El ciclo del agente no puede depender de un proveedor. Mañana podemos cambiar de modelo y no queremos reescribirlo."
- Dirección administrativa y financiera (S5): "No tiene sentido pagar el modelo más caro para responder 'gracias' o 'sí, confírmala'."
- Equipo Perxia (S6): "Que el prompt no viva en el código. Comportamiento, conocimiento y ejecución separados, como pide el PRD."

**Necesidades**

1. Conversación natural en español de Colombia, con tono de colega de compras.
2. Un agente que use herramientas para todo valor que afirme (CA2).
3. Confirmación humana explícita antes de crear una OC con excepciones (CA3), resaltada en la interfaz.
4. Errores de herramienta o proveedor explicados en lenguaje claro, sin perder la sesión (CA5).
5. Costo bajo por interacción: el modelo potente solo donde aporta.

**Restricciones**

- TypeScript (Bun), herramientas tipadas con zod, tope de iteraciones por turno (CA1, sugerido 25).
- System prompt en Markdown aparte (`agent/prompt.md`), conocimiento en `src/knowledge/`.
- Ninguna clave en front, repositorio, logs ni respuestas (§8 seguridad).

## 2. Historias de usuario

### HU-03.1 · Enrutar cada mensaje al especialista correcto

**Como** analista administrativa **quiero** escribir lo que necesito en mis palabras **para** que el agente entienda si quiero procesar un caso, confirmar, preguntar por el proceso o solo saludar.

```gherkin
Escenario: Procesar un caso sin costo de enrutamiento
  Dado una sesión nueva
  Cuando escribo "Procesa la solicitud sol-004"
  Entonces el turno se enruta al operador con intención "procesar_caso" y caso "sol-004"
  Y el chip de ruta indica "enrutado por reglas, sin costo"

Escenario: Confirmar con una afirmación corta
  Dado que sol-004 quedó pendiente de confirmación en la sesión
  Cuando escribo "sí, dale"
  Entonces la intención es "confirmar" para "sol-004" sin llamar a ningún modelo

Escenario: Mensaje ambiguo
  Dado una sesión nueva
  Cuando escribo "¿qué pasa si el aprobador no tiene tope suficiente?"
  Entonces Claude Haiku 5.5 clasifica el mensaje con salida estructurada
  Y el turno lo atiende el asesor con intención "consulta_proceso"

Escenario: Saludo
  Cuando escribo "hola, buenos días"
  Entonces responde el conversador con una o dos frases y me invita a procesar un caso
```

**Reglas de negocio**
- Primero se aplican reglas deterministas (botón de confirmar, sí o no con pendiente, "procesa sol-XXX", saludos). El modelo pequeño solo entra si ninguna regla aplica.
- Si la salida del router no cumple el esquema, el turno se trata como charla y el conversador pide precisión; nunca se ejecuta una acción por una clasificación dudosa.

**Prioridad:** Alta · **Puntos:** 5 · **Estado:** Hecho

### HU-03.2 · Operar el flujo de la OC con herramientas

**Como** analista **quiero** que el agente ejecute el flujo completo con las herramientas **para** no digitar nada en el caso normal (O1).

```gherkin
Escenario: Caso normal sin intervención
  Dado el caso sol-001
  Cuando pido "procesa sol-001"
  Entonces el operador llama oc_leer_paquete, oc_validar, oc_construir_payload, oc_generar_evidencia y oc_crear
  Y responde con la OC 4500000001 y la ruta de la evidencia

Escenario: Caso bloqueado
  Dado el caso sol-002 (proveedor con NIT 901999000 inexistente)
  Cuando pido "procesa sol-002"
  Entonces el agente no crea la OC
  Y explica la causa (RC1) y la acción sugerida

Escenario: Tope de iteraciones
  Dado que el ciclo herramienta → modelo llega a 25 pasos en el turno
  Entonces el agente responde con lo que logró y lo que falta, sin llamar más herramientas
```

**Reglas de negocio**
- Tope `AGENT_MAX_ITERACIONES` (25 por defecto, CA1).
- El operador siempre llama `oc_crear` al final para que el intento quede en `out/control.csv`; la herramienta decide si crea, bloquea o deja pendiente.

**Prioridad:** Alta · **Puntos:** 5 · **Estado:** Hecho

### HU-03.3 · Pedir confirmación antes de crear y respetarla

**Como** contabilidad/auditoría **quiero** que la creación con excepciones dependa de una confirmación humana explícita **para** que ninguna OC dudosa entre a SAP por decisión del modelo (CA3, O3, O4).

```gherkin
Escenario: Cotización distinta a la solicitud
  Dado el caso sol-004 (solicitud $25.000.000, cotización $26.500.000, 6,0 %)
  Cuando pido procesarlo
  Entonces oc_crear devuelve "pendiente"
  Y la siguiente llamada al modelo se hace sin herramientas para cerrar con UNA pregunta
  Y la respuesta trae needsConfirmation = true y el evento "confirmacion" con los dos valores

Escenario: El modelo intenta confirmar por su cuenta
  Dado que sol-004 está pendiente y el usuario no ha confirmado
  Cuando el modelo llama oc_crear con confirmado = true
  Entonces la compuerta no ejecuta la herramienta y devuelve "Requiere confirmación explícita del usuario"

Escenario: Confirmación con el botón
  Dado que sol-004 está pendiente
  Cuando pulso "Confirmar y crear OC"
  Entonces se crea la OC y la confirmación queda consumida

Escenario: Varios pendientes
  Dado que sol-005 y sol-006 quedaron pendientes en la misma sesión
  Cuando escribo "confirmo sol-005"
  Entonces solo se otorga la confirmación de sol-005
```

**Reglas de negocio**
- La confirmación solo se otorga por el botón (`confirmar: { caso }`) o por una afirmación del usuario con un pendiente activo.
- La confirmación otorgada se consume al crear la OC.

**Prioridad:** Alta · **Puntos:** 5 · **Estado:** Hecho

### HU-03.4 · No afirmar cifras que no salieron de una herramienta

**Como** contabilidad/auditoría **quiero** que cada monto, NIT o número de OC del mensaje esté respaldado por una herramienta **para** confiar en lo que el agente dice (CA2).

```gherkin
Escenario: Respuesta con cifras correctas
  Dado que el operador terminó sol-004
  Cuando el verificador revisa el texto final
  Entonces todas las cifras (25.000.000, 26.500.000) existen en los resultados del turno
  Y el chat muestra "Cifras verificadas"

Escenario: Cifra inventada
  Dado que el texto final cita un monto que no está en ninguna fuente del turno
  Entonces se hace un reintento con retroalimentación
  Y si persiste, el evento "verificacion" lo marca como no verificado
```

**Prioridad:** Alta · **Puntos:** 3 · **Estado:** Hecho

### HU-03.5 · Hablar como una colega, no como un sistema

**Como** analista **quiero** respuestas cortas, cálidas y precisas **para** decidir rápido sin leer de más.

```gherkin
Escenario: Resultado primero
  Cuando el agente termina un caso
  Entonces la primera frase dice el resultado (creada, bloqueada o pendiente)
  Y no repite lo que el lienzo ya muestra en detalle

Escenario: Pregunta de cierre
  Dado una confirmación pendiente
  Entonces el turno termina con una sola pregunta cerrada y nada después

Escenario: Formato de montos
  Entonces los montos aparecen como $25.000.000 (formato es-CO)
```

**Reglas de negocio** (de `apps/backend/agent/voz.md`)
- Máximas de Grice: calidad, cantidad, relevancia y manera.
- Principios de Google Conversation Design: si se pregunta, se cede el turno; la persona está al servicio de la tarea.
- Prohibido el relleno ("¡Claro!", "¡Excelente pregunta!"), las disculpas excesivas y los emojis.

**Prioridad:** Media · **Puntos:** 2 · **Estado:** Hecho

### HU-03.6 · Cambiar de proveedor de modelo sin tocar el ciclo

**Como** equipo Perxia **quiero** un adaptador propio de proveedor **para** cambiar de modelo o de proveedor sin reescribir la orquestación (§6.1).

```gherkin
Escenario: Sin clave de modelo
  Dado que no existe ANTHROPIC_API_KEY
  Cuando arranca el servidor
  Entonces se usa el proveedor "guion" (determinista, costo 0) con el mismo ciclo y las mismas herramientas

Escenario: Error del proveedor
  Dado que la API del modelo no responde en LLM_TIMEOUT_MS
  Entonces el chat muestra "El modelo no respondió en 60 s. Intenta de nuevo." y la sesión sigue viva
```

**Prioridad:** Alta · **Puntos:** 1 · **Estado:** Hecho

## 3. Solución implementada

Orquestación secuencial con los patrones de *Building effective agents* (Anthropic): enrutamiento, LLM aumentado con herramientas y evaluador determinista.

```
mensaje → router (reglas | Haiku 5.5) → especialista → verificador de cifras → respuesta (SSE)
                                   ├─ operador   · Sonnet 5.5 · herramientas oc_* · tope 25
                                   ├─ asesor     · Haiku 5.5  · conocimiento + datos de solo lectura
                                   └─ conversador· Haiku 5.5  · charla breve y fuera de alcance
```

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Orquestador | `apps/backend/src/agent/orquestador.ts` | Turno completo: presupuesto, ruta, especialista, verificación, guardado de sesión, eventos |
| Router híbrido | `apps/backend/src/agent/router.ts` | Reglas deterministas y, si hace falta, clasificación con salida estructurada |
| Operador | `apps/backend/src/agent/operador.ts` | Ciclo con herramientas, compuerta de confirmación, cierre sin herramientas, tope de iteraciones |
| Asesor y conversador | `apps/backend/src/agent/especialistas.ts` | Respuestas de proceso, estado y charla |
| Verificador | `apps/backend/src/agent/verificador.ts` | Compara cifras del texto con las fuentes del turno (CA2) |
| Memoria compacta | `apps/backend/src/agent/memoria.ts`, `resumen.ts` | Resultado por caso y OC validada; no se reenvían resultados completos de turnos previos |
| Puerta al modelo | `apps/backend/src/agent/modelo.ts` | Verifica presupuesto, mide, calcula costo y registra en el observatorio |
| Adaptador LLM | `apps/backend/src/llm/adapter.ts` | Interfaz `enviar(peticion) → respuesta` |
| Anthropic | `apps/backend/src/llm/anthropic.ts` | Streaming, prompt caching, `output_config` (esfuerzo y salida estructurada), `tool_choice: none`, traducción de errores |
| Guion | `apps/backend/src/agent/guion.ts` | Proveedor determinista para CI, demo y respaldo |
| Prompts | `apps/backend/agent/prompt.md`, `router.md`, `asesor.md`, `conversador.md`, `voz.md` | Comportamiento fuera del código |
| Conocimiento | `apps/backend/src/knowledge/ordenes-compra.md` | RC1 a RC10 en lenguaje de negocio, acciones ante bloqueos, glosario SAP |
| Servidor | `apps/backend/src/server/app.ts` | `POST /api/chat` como SSE (o JSON con `Accept: application/json`) |
| Contrato | `packages/contracts/src/index.ts` | Eventos `sesion`, `ruta`, `pensando`, `texto_delta`, `herramienta_inicio`, `herramienta_fin`, `mensaje`, `confirmacion`, `verificacion`, `error`, `fin` |

**Modelos por agente** (`apps/backend/src/agent/config.ts`, configurables por `LLM_MODELO_*`): router, asesor y conversador en `claude-haiku-5-5`; operador en `claude-sonnet-5-5` con esfuerzo `medium`; Opus solo como escalamiento opcional por variable de entorno.

## 4. Verificación

| Prueba | Cómo | Resultado |
|---|---|---|
| Flujo HTTP de los 6 casos | Servidor local con proveedor `guion` y auth local; `curl` a `/api/chat` | sol-001 creada; sol-002 y sol-003 bloqueadas; sol-004, sol-005 y sol-006 pendientes y luego creadas al confirmar; sol-001 repetida idempotente |
| Compuerta | Llamada de `oc_crear` con `confirmado=true` sin confirmación del usuario | No se ejecuta; el modelo recibe el error y debe preguntar |
| Navegador | Playwright contra el build de producción: login, sol-004, confirmar, sol-002, pregunta al asesor | Sin errores de consola; hoja de confirmación con los dos valores; OC 4500000001 |
| Despliegue real | Lightsail con Claude Haiku 5.5 y Sonnet 5.5; prueba manual de la usuaria en la URL pública | Conversación, herramientas, confirmación y observatorio funcionando |
| Error de proveedor | Clave inválida en local | "La clave del proveedor del modelo no es válida"; la sesión sigue viva |

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Router híbrido: reglas primero, Haiku solo si hay ambigüedad | Clasificar cada mensaje con un modelo | La mayoría de turnos ("procesa sol-004", "confirmo") se resuelven gratis y sin latencia |
| Especialistas por intención | Un solo agente grande con el modelo más capaz | El modelo caro solo trabaja donde hay herramientas |
| Compuerta de confirmación en el servidor y cierre sin herramientas | Confiar solo en el prompt | Un prompt se puede ignorar; la compuerta no |
| Verificador de cifras determinista | Un agente "juez" con otro modelo | Más barato, sin latencia extra y sin su propio riesgo de alucinar |
| Reglas de voz compartidas en cada especialista | Un agente redactor que reescribe la respuesta | Un redactor puede alterar cifras y duplica costo |
| Operador con memoria compacta por turno | Reenviar todo el historial con resultados completos | El costo no crece con la conversación |
| Adaptador propio | SDK de orquestación de terceros | Contrato del PRD explícito, menos dependencias |

## 6. Pendientes para producción

- Evaluaciones automáticas de conversación (conjunto de mensajes reales con resultados esperados) para detectar regresiones al cambiar prompts o modelos.
- Ajustar `voz.md` con transcripciones reales de la analista.
- Defensa adicional contra inyección de instrucciones en el texto de correos y cotizaciones (hoy el texto es dato y las decisiones son deterministas).
- Tests unitarios del router y del verificador (la suite automatizada quedó fuera del alcance de esta fase).
