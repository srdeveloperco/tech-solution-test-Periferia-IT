# EP-07 · Persistencia del histórico conversacional y modelo de datos

| Campo | Valor |
|---|---|
| Épica | EP-07 Persistencia del histórico conversacional y modelo de datos |
| Objetivo de negocio | Conservar todo lo que ocurre en cada conversación (mensajes, casos, confirmaciones y trazas) con un modelo relacional coherente, como en una aplicación productiva, para retomar conversaciones y auditar decisiones |
| Estado | Hecho |
| Prioridad | Alta (P1) |
| Estimación | 8 puntos |
| Sesiones de origen | S3, S4, S6 |
| Trazabilidad PRD | §6.1 (sesiones en memoria o archivo), §6.4 `GET /api/sessions/:id`, HU-5 (registro de cada intento), §3.2 (persistencia en base de datos fuera de alcance: se adopta una base embebida sin servicios adicionales) |

## 1. Levantamiento

**Sesiones de origen.** S3 (experiencia de usuario con la analista), S4 (arquitectura con el equipo Perxia y el líder de TI) y S6 (aceptación).

**Hallazgos**

- Analista administrativa (S3): "Si cierro el navegador a mitad de un caso, quiero volver y encontrar la conversación donde la dejé."
- Contabilidad/Auditoría (S2): "Necesito saber quién confirmó cada excepción y cuándo. 'El sistema la creó' no me sirve en una auditoría."
- Equipo Perxia (S4): "Aunque sea una prueba, el modelo de datos tiene que verse como el de un producto real: claves foráneas, restricciones y migraciones."
- Líder de TI/Seguridad (S4): "Nada de bases de datos nuevas en la cuenta de producción para una prueba de dos horas."
- Equipo Perxia (S6): "El observatorio y las conversaciones deben poder cruzarse: de un mensaje a la llamada al modelo que lo produjo."

**Necesidades**

1. Historial completo por usuario, recuperable después de reiniciar el servidor.
2. Rastro de auditoría de cada confirmación humana.
3. Un solo modelo coherente para conversaciones y observabilidad.
4. Esquema versionado con migraciones.

**Restricciones**

- Sin recursos AWS adicionales (ni RDS ni DynamoDB).
- Los artefactos que exige el PRD siguen en archivos (`out/control.csv`, `out/sap/ordenes.jsonl`, evidencias).
- Una conversación solo la ve su dueño.

## 2. Historias de usuario

### HU-07.1 · Retomar una conversación

**Como** analista administrativa **quiero** ver mis conversaciones recientes y abrir cualquiera **para** continuar donde la dejé.

```gherkin
Escenario: Lista de conversaciones
  Dado que procesé sol-004 y sol-002 en conversaciones distintas
  Cuando abro el historial
  Entonces GET /api/sessions devuelve ambas, la más reciente primero, con título, casos tocados y costo

Escenario: Sobrevive a un reinicio
  Dado una conversación con 4 mensajes y sus llamadas a herramientas
  Cuando el servidor se reinicia
  Entonces GET /api/sessions/:id devuelve los 4 mensajes con sus tool calls
  Y el chat y el lienzo se reconstruyen

Escenario: Conversación de otro usuario
  Dado una conversación que pertenece a otro usuario
  Cuando pido GET /api/sessions/:id
  Entonces no se devuelve
```

**Prioridad:** Alta · **Puntos:** 3 · **Estado:** Hecho

### HU-07.2 · Auditar cada confirmación humana

**Como** contabilidad/auditoría **quiero** el ciclo de vida de cada confirmación con fechas y responsable **para** sustentar por qué se creó una OC con excepciones.

```gherkin
Escenario: Confirmación otorgada y consumida
  Dado que sol-004 queda pendiente por RC5
  Cuando la analista confirma y se crea la OC
  Entonces la fila de confirmaciones pasa de "pendiente" a "otorgada" y luego a "consumida"
  Y registra la fecha de solicitud, la de resolución y el usuario que confirmó

Escenario: Confirmación descartada
  Dado que sol-006 queda pendiente
  Cuando la analista responde "ahora no"
  Entonces la confirmación queda "descartada"

Escenario: Una sola confirmación viva por caso
  Dado una confirmación pendiente de sol-005 en una conversación
  Entonces no puede existir otra pendiente u otorgada para sol-005 en esa misma conversación
```

**Reglas de negocio**
- Estados: `pendiente`, `otorgada`, `consumida`, `descartada`. `resuelta` es nula solo mientras está pendiente.
- Índice único parcial: a lo sumo una confirmación viva (pendiente u otorgada) por caso y conversación.

**Prioridad:** Alta · **Puntos:** 2 · **Estado:** Hecho

### HU-07.3 · Recordar el estado de cada caso en la conversación

**Como** analista **quiero** que el agente recuerde qué pasó con cada caso de la conversación **para** no repetir el proceso al preguntar o confirmar.

```gherkin
Escenario: Memoria por caso
  Dado que sol-004 fue validado y quedó pendiente
  Cuando escribo "confirmo"
  Entonces el operador recibe la memoria del caso (resultado, apta, retroactiva, bloqueos, confirmaciones y OC validada)
  Y crea la OC con 2 llamadas al modelo, sin releer el paquete

Escenario: Caso ya creado
  Dado que sol-004 ya tiene la OC 4500000001
  Cuando pido procesarlo de nuevo
  Entonces el agente responde que la OC ya existe (idempotente)
```

**Prioridad:** Media · **Puntos:** 1 · **Estado:** Hecho

### HU-07.4 · Evolucionar el esquema de forma segura

**Como** equipo Perxia **quiero** migraciones versionadas e idempotentes **para** cambiar el esquema sin perder datos ni aplicar cambios dos veces.

```gherkin
Escenario: Primer arranque
  Dado una base vacía
  Cuando arranca el servidor
  Entonces se aplican las migraciones 1 y 2, cada una en su transacción, y quedan registradas en la tabla migraciones

Escenario: Arranque siguiente
  Dado una base con las migraciones 1 y 2 aplicadas
  Cuando arranca el servidor
  Entonces no se reaplica ninguna
```

**Prioridad:** Media · **Puntos:** 1 · **Estado:** Hecho

### HU-07.5 · Cruzar conversación y observabilidad

**Como** equipo Perxia **quiero** que mensajes, interacciones y llamadas al modelo estén relacionados **para** ir de una respuesta del chat a la traza que la produjo.

```gherkin
Escenario: Del mensaje a la traza
  Dado un mensaje del agente en una conversación
  Entonces su interaccion_id apunta a la interacción del observatorio
  Y esa interacción tiene sus llamadas_llm y ejecuciones_herramienta con claves foráneas válidas
```

**Prioridad:** Media · **Puntos:** 1 · **Estado:** Hecho

## 3. Solución implementada

Una sola base SQLite embebida (`bun:sqlite`) en `out/oc.db`, compartida por el almacén de sesiones y el observatorio. El diagrama entidad-relación, el diccionario de datos y las consultas útiles están en [`docs/modelo-datos.md`](../modelo-datos.md).

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Conexión | `apps/backend/src/persistencia/base.ts` | `abrirBaseDatos(directory)`: WAL, `synchronous = NORMAL`, `foreign_keys = ON`, espera ante bloqueo y aplicación de migraciones; una conexión por ruta |
| Migraciones | `apps/backend/src/persistencia/migraciones.ts` | Migración 1: observatorio. Migración 2: modelo conversacional. Tabla `migraciones (version, nombre, aplicada)` |
| Almacén | `apps/backend/src/persistencia/sesiones.ts` | `AlmacenSesionesSqlite implements RepositorioSesiones`: `obtener`, `crear`, `bloquear`, `liberar`, `guardar` (upsert diferencial en una transacción), `listar`, `registrarUsuario` |
| Interfaz | `apps/backend/src/agent/sesiones.ts` | `RepositorioSesiones` y tipo `Sesion`; el orquestador no sabe que hay una base detrás |
| Inyección | `apps/backend/src/main.ts` | `abrirBaseDatos(raiz)`, `crearObservador(raiz, { db })` y `new AlmacenSesionesSqlite(db)` |
| API | `apps/backend/src/server/app.ts` | `GET /api/sessions` y `GET /api/sessions/:id` |
| Historial en el front | `apps/web/src/componentes/chat/Historial.tsx` | Lista plegable de conversaciones y reconstrucción de chat y lienzo |

**Tablas**

| Tabla | Propósito |
|---|---|
| `usuarios` | Email en minúsculas como clave, nombre, rol (`admin` o `analista`), último acceso |
| `conversaciones` | Dueño, título (primer mensaje recortado), estado, tokens y costo acumulados |
| `mensajes` | Secuencia única por conversación, rol, texto, ruta, confirmación y snapshot de tool calls (JSON validado con `json_valid`) |
| `casos_conversacion` | Memoria por caso: resultado, número de OC, apta, retroactiva, bloqueos, confirmaciones, orden y evidencia |
| `confirmaciones` | Rastro de auditoría de cada confirmación humana |
| `interacciones` | Un turno, enlazado a conversación y usuario |
| `llamadas_llm`, `prompts`, `ejecuciones_herramienta` | Trazas del observatorio (ver EP-06) |

Restricciones: 20 claves foráneas y validaciones JSON, enumerados con `CHECK`, contadores no negativos y 14 índices (incluido el índice único parcial de confirmaciones vivas).

## 4. Verificación

| Prueba | Cómo | Resultado |
|---|---|---|
| Ciclo de confirmaciones | Script con `bun -e` en un directorio temporal: pendiente → otorgada → consumida y pendiente → descartada | Estados y fechas correctos |
| Recarga | Guardar una sesión y leerla con un almacén nuevo | Mensajes, casos y pendientes idénticos |
| Dueño | Leer la sesión con otro usuario | `null` |
| Integridad | `PRAGMA foreign_key_check` | Sin filas |
| HTTP con reinicio | Login, "procesa sol-004", "Confirmo" (OC 4500000001), reinicio del servidor, `GET /api/sessions` y `/api/sessions/:id` | 4 mensajes con sus tool calls; las migraciones no se reaplican |
| Consultas de negocio | Las 8 consultas de `docs/modelo-datos.md` contra la base de prueba | Todas responden |

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| SQLite embebida en el contenedor | RDS, DynamoDB | Cero recursos AWS extra en una cuenta de producción; sin red ni credenciales adicionales |
| Una sola base para conversaciones y observatorio | Dos bases separadas | Permite cruzar mensajes con trazas mediante claves foráneas |
| Tabla de confirmaciones con estados | Arreglos dentro de la sesión | Auditoría: quién, qué y cuándo para cada excepción |
| Upsert diferencial en una transacción | Reescribir la sesión completa en cada turno | Menos escritura y sin estados intermedios inconsistentes |
| Interfaz `RepositorioSesiones` | Acceso directo a SQL desde el orquestador | Se puede cambiar el almacén (por ejemplo, Postgres) sin tocar el agente |

## 6. Pendientes para producción

- **La base vive dentro del contenedor:** cada despliegue en Lightsail reinicia el historial y las trazas. En producción: Postgres gestionado (RDS) o similar, con respaldos.
- Particionado o archivado por fecha de `llamadas_llm`, que es la tabla que más crece.
- Política de retención y tratamiento de datos personales (emails y textos de usuarios), con anonimización para análisis.
- Archivar conversaciones antiguas (`estado = 'archivada'`) desde la interfaz.
- Exponer el rastro de confirmaciones en el observatorio o en un reporte para auditoría.
