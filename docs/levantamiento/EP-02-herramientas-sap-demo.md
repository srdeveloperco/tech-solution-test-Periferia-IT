# EP-02 · Herramientas del agente, SAP simulado y demo

| Ficha | |
|---|---|
| **Épica** | EP-02 · Herramientas `oc_*`, adaptador SAP simulado, log de control y `demo.ts` |
| **Objetivo de negocio** | Eliminar la digitación en el flujo normal: que el agente lea, valide, arme, evidencie y cree la OC con herramientas que son la única fuente de valores, y que todo intento quede registrado para auditoría |
| **Estado** | Hecho |
| **Prioridad** | P0 (evidencia en PDF: P1) |
| **Estimación** | 21 puntos |
| **Sesiones de origen** | S1 Descubrimiento del proceso actual · S2 Reglas de control y excepciones · S4 Arquitectura, seguridad y nube · S6 Revisión y aceptación |
| **Trazabilidad PRD** | 6.2 Contrato de herramientas · 6.6 `demo.ts` · 7.4 `SapAdapter` · HU-1, HU-3, HU-4, HU-5, HU-6 · CA2, CA4 · O1, O2, O3, O4 |

## 1. Levantamiento

**Sesiones de origen:** S1 (cómo termina hoy una OC y qué se adjunta), S2 (qué debe quedar registrado), S4 (contrato técnico, idempotencia y viabilidad de SAP).

**Hallazgos (citas de las sesiones):**

- Analista administrativa (S1): "Cuando termino, lo único que necesito es el número de OC. Y si por error la proceso dos veces, que no salgan dos órdenes."
- Contabilidad/Auditoría (S2): "Queremos una fila por cada intento, aunque no se haya creado: bloqueada, pendiente o creada. Con eso medimos."
- Auditoría (S2): "El correo de aprobación tiene que ir a la OC como PDF, y con algo que nos diga que nadie lo tocó."
- Líder de TI/Seguridad (S4): "La conexión a SAP no está confirmada. Diseñen contra una interfaz y simulen la creación; las herramientas no pueden ejecutar comandos del sistema."
- Equipo Perxia (S4): "El modelo no puede inventar ni corregir un monto. Lo que diga sobre la OC tiene que salir de una herramienta, y la herramienta no le puede creer al modelo."
- Equipo Perxia (S6): "Necesitamos poder probar los 6 casos sin clave de ningún proveedor, siempre con el mismo resultado."

**Necesidades:**

1. Cinco herramientas con el contrato exacto del PRD 6.2: `description`, `args` zod con `.describe()` y `execute(args, ctx)` que devuelve JSON `{ ok, data | error }` y nunca lanza.
2. Un adaptador SAP con la interfaz obligatoria y una implementación simulada sobre archivos, con numeración secuencial e idempotencia.
3. Evidencia de aprobación en texto y en PDF con su sha256.
4. Log de control `out/control.csv` con una fila por intento.
5. Errores legibles ante paquete incompleto, JSON malformado o monto no numérico.
6. Un `demo.ts` determinista que procese los 6 casos sin modelo.

**Restricciones:**

- Las herramientas no conocen HTTP, el ciclo del agente ni el proveedor LLM (deben poder importarse desde `demo.ts` y desde el módulo).
- `fixtures/` es de solo lectura; todo lo generado va a `out/`.
- Las rutas se resuelven desde `ctx.directory`, nunca absolutas, y el nombre del caso no puede escapar de la carpeta de solicitudes.

## 2. Historias de usuario

### HU-02.1 · Leer el paquete con errores legibles (PRD HU-1, HU-6)

**Como** analista administrativa **quiero** pedir "procesa sol-001" y que el agente lea todos los adjuntos del caso **para** tener los datos en un solo lugar, y saber qué pedir al solicitante cuando falte algo.

```gherkin
Escenario: paquete completo (sol-001)
  Dado la carpeta fixtures/reto-03/solicitudes/sol-001
  Cuando se ejecuta oc_leer_paquete con caso "sol-001"
  Entonces devuelve { ok: true, data } con correo, solicitud, cotización COT-TS-2026-0451, aprobación y factura null
  Y faltantes está vacío

Escenario: caso inexistente
  Dado que no existe la carpeta "sol-999"
  Cuando se ejecuta oc_leer_paquete con caso "sol-999"
  Entonces devuelve { ok: false } con "No existe el caso" y la lista de casos disponibles

Escenario: monto no numérico
  Dado una solicitud con valor_total "8.500.000" como texto
  Cuando se lee el paquete
  Entonces devuelve { ok: false } con "valor_total debe ser numérico"

Escenario: falta la cotización
  Dado un caso sin cotizacion.txt
  Cuando se lee el paquete
  Entonces cotizacion es null y faltantes incluye "cotizacion.pdf (cotización del proveedor)"
```

- **Reglas de negocio:** sin `solicitud.json` el paquete no se puede procesar y se pide al solicitante; los demás adjuntos ausentes se reportan como `null` con su nombre; un nombre de caso fuera del patrón `sol-001` se rechaza.
- **Prioridad:** P0 · **Puntos:** 3 · **Estado:** Hecho.

### HU-02.2 · Validar y construir la OC sin confiar en el modelo (PRD HU-2, HU-3, CA2)

**Como** contabilidad/auditoría **quiero** que la validación y el payload salgan siempre de los archivos del caso **para** que el modelo no pueda alterar un valor aunque lo intente.

```gherkin
Escenario: validación desde la fuente
  Dado que el modelo envía a oc_validar un paquete de sol-004 con valor_total modificado
  Cuando se ejecuta la herramienta
  Entonces valida el paquete original del caso
  Y responde paquete_verificado false con el aviso correspondiente

Escenario: payload y trazabilidad (sol-006)
  Dado el caso sol-006 apto
  Cuando se ejecuta oc_construir_payload
  Entonces devuelve la orden con condiciones Z030 e indicador C1 derivados
  Y escribe out/sol-006/trazabilidad.json con la fuente de cada campo

Escenario: no se construye con bloqueos (sol-003)
  Dado el caso sol-003 con bloqueo RC2
  Cuando se ejecuta oc_construir_payload
  Entonces devuelve { ok: false } con "No se construye la OC porque hay bloqueos: RC2 Aprobador sin autoridad en el centro"
```

- **Reglas de negocio:** las herramientas que deciden recalculan paquete, maestros y validación desde el caso; lo que llega del modelo se compara, no se usa.
- **Prioridad:** P0 · **Puntos:** 5 · **Estado:** Hecho.

### HU-02.3 · Generar la evidencia de aprobación (PRD HU-4)

**Como** auditoría **quiero** el correo de aprobación como texto y PDF con su sha256 **para** adjuntarlo a la OC y detectar cualquier modificación.

```gherkin
Escenario: evidencia en texto y PDF (sol-001)
  Dado el correo de aprobación de mlopez@periferia-ficticia.com del 2026-08-21
  Cuando se ejecuta oc_generar_evidencia con caso "sol-001"
  Entonces se escriben out/sol-001/aprobacion.txt y out/sol-001/aprobacion.pdf
  Y la respuesta trae ruta, ruta_pdf y sha256

Escenario: PDF reproducible
  Dado el mismo correo de aprobación
  Cuando se genera la evidencia dos veces
  Entonces el sha256 del contenido es el mismo en ambas
```

- **Reglas de negocio:** el texto lleva De, Para, CC, Fecha, Asunto, cuerpo y la línea del hash; el PDF usa la fecha de aprobación como fecha del documento para no depender del reloj.
- **Prioridad:** P0 (txt) y P1 (pdf) · **Puntos:** 3 · **Estado:** Hecho.

### HU-02.4 · Crear la OC en el SAP simulado con idempotencia (PRD HU-5)

**Como** analista administrativa **quiero** que el agente cree la OC y me devuelva el número **para** cerrar el caso, sin riesgo de duplicarla.

```gherkin
Escenario: creación sin intervención (sol-001, objetivo O1)
  Dado el caso sol-001 apto y sin confirmaciones
  Cuando se ejecuta oc_crear con la orden de oc_construir_payload
  Entonces responde resultado "creada" con numero_oc 4500000001
  Y se agrega el registro a out/sap/ordenes.jsonl

Escenario: idempotencia (sol-001 dos veces)
  Dado que SOL-2026-001 ya tiene la OC 4500000001
  Cuando se ejecuta oc_crear otra vez
  Entonces responde resultado "idempotente", numero_oc 4500000001 e idempotente true

Escenario: bloqueada (sol-002, objetivo O2)
  Dado el caso sol-002 con bloqueo RC1
  Cuando se ejecuta oc_crear con payload null
  Entonces responde { ok: false, resultado: "bloqueada" } con los bloqueos y no crea OC

Escenario: requiere confirmación (sol-004, objetivo O3)
  Dado el caso sol-004 con confirmación RC5
  Cuando se ejecuta oc_crear sin confirmado
  Entonces responde { ok: false, resultado: "pendiente" } con las confirmaciones
  Y con confirmado true crea la OC 4500000002 con la excepción RC5 confirmada

Escenario: payload alterado
  Dado una orden de sol-001 con precio_unitario modificado por el modelo
  Cuando se ejecuta oc_crear
  Entonces responde { ok: false } indicando el campo "posiciones" y pidiendo usar la orden sin modificar
```

- **Reglas de negocio:** orden de decisión: bloqueos, luego OC existente (idempotencia), luego confirmación, luego verificación del payload; `confirmado_por` registra la sesión que confirmó; la numeración empieza en 4500000001.
- **Prioridad:** P0 · **Puntos:** 5 · **Estado:** Hecho.

### HU-02.5 · Registrar cada intento en el log de control (PRD HU-5, O4)

**Como** dirección administrativa y financiera **quiero** una fila por intento con su resultado y la marca de retroactiva **para** medir cuántas OC se bloquean, cuántas esperan confirmación y cuántas son retroactivas.

```gherkin
Escenario: OC retroactiva confirmada (sol-005)
  Dado el caso sol-005 con factura anterior a la solicitud
  Cuando se intenta crear sin confirmar y luego confirmando
  Entonces control.csv tiene "SOL-2026-005,pendiente,,true,,RC8"
  Y luego "SOL-2026-005,creada,4500000003,true,,RC8"

Escenario: intento bloqueado (sol-002)
  Dado el caso sol-002
  Cuando se intenta crear
  Entonces control.csv tiene "SOL-2026-002,bloqueada,,false,RC1,"
```

- **Reglas de negocio:** columnas `solicitud_id, resultado, numero_oc, retroactiva, bloqueos, confirmaciones, ts`; resultados `creada`, `idempotente`, `bloqueada`, `pendiente`; códigos unidos con `|`.
- **Prioridad:** P0 · **Puntos:** 2 · **Estado:** Hecho.

### HU-02.6 · Verificar sin modelo con `demo.ts` (PRD 6.6)

**Como** equipo Perxia **quiero** un script que procese los 6 casos llamando directamente a las herramientas **para** demostrar robustez y determinismo sin gastar en un proveedor.

```gherkin
Escenario: corrida completa
  Dado una máquina con Bun y sin clave de ningún proveedor
  Cuando se ejecuta "bun install && bun run demo.ts"
  Entonces imprime por caso apta, bloqueos, confirmaciones, retroactiva y número de OC o motivo
  Y muestra la idempotencia de sol-001 y la confirmación explícita de sol-004

Escenario: determinismo
  Dado dos ejecuciones consecutivas
  Cuando se comparan sus salidas
  Entonces son iguales salvo los timestamps, porque out/ se limpia al inicio
```

- **Prioridad:** P0 · **Puntos:** 3 · **Estado:** Hecho.

## 3. Solución implementada

| Archivo | Responsabilidad |
|---|---|
| `apps/backend/src/tools/oc.ts` | Las cinco herramientas (`leer_paquete`, `validar`, `construir_payload`, `generar_evidencia`, `crear`), que el modelo ve como `oc_<export>`. Cada `execute` va envuelto en `seguro()`, que convierte cualquier excepción en `{ ok: false, error }` |
| `apps/backend/src/tools/index.ts` | `registrar({ oc })` arma el registro `oc_*`; `ejecutar(nombre, args, ctx)` valida los argumentos con zod y devuelve el error al modelo si no cumplen |
| `apps/backend/src/tools/tipos.ts` | `ToolDef` y `ToolContext` (`directory`, `sessionId`) del contrato 6.2 |
| `apps/backend/src/tools/fuentes.ts` | Lectura de fixtures: maestros en caché, `leerPaquete` con `faltantes`, JSON malformado y datos inválidos como errores legibles, validación del caso contra los existentes |
| `apps/backend/src/tools/rutas.ts` | Rutas desde `ctx.directory` (`OUT_DIR` opcional), `casoValido` con patrón estricto contra rutas arbitrarias, `rutaVisible` para mostrar rutas relativas |
| `apps/backend/src/tools/evidencia.ts` | Escribe `aprobacion.txt` y `aprobacion.pdf` con pdf-lib (fuentes estándar con caracteres WinAnsi, fechas fijas del correo) |
| `apps/backend/src/tools/control.ts` | `registrarControl` y `leerControl` sobre `out/control.csv` |
| `apps/backend/src/tools/consultas.ts` | Consultas de solo lectura para la API: lista de casos con su último estado, CSV de control, ruta de la evidencia |
| `apps/backend/src/sap/adapter.ts` | Interfaz `SapAdapter` obligatoria (PRD 7.4) |
| `apps/backend/src/sap/mock.ts` | `SapMock`: `out/sap/ordenes.jsonl`, número `4500000001 + n`, búsqueda por `solicitud_id`, cola de escritura en proceso para que dos llamadas no reciban el mismo número |
| `demo.ts` | Limpia `out/`, recorre los casos con las herramientas, muestra la idempotencia, las confirmaciones explícitas y el `control.csv` |

**Cómo cumple cada criterio:**

- Contrato 6.2: argumentos zod con `.describe()`; respuesta siempre JSON string; nunca lanza.
- CA2: `validar`, `construir_payload` y `crear` recalculan desde el caso; `crear` compara con `diferenciasOrden` y rechaza indicando los campos distintos.
- HU-5: `crear` decide en este orden: bloqueada, idempotente, pendiente, payload verificado, creada. Antes de crear asegura la evidencia, escribe `out/<caso>/orden.json` y registra la fila de control.
- HU-6: los errores de lectura vienen redactados para la analista ("Paquete incompleto: falta la solicitud… Pide al solicitante que la adjunte").

## 4. Verificación

- **`bun run demo.ts`**, salida resumida:

```
sol-001  apta true   → OC 4500000001
sol-002  apta false  → BLOQUEADA: RC1 Proveedor no registrado
sol-003  apta false  → BLOQUEADA: RC2 Aprobador sin autoridad en el centro
sol-004  apta true   → PENDIENTE: RC5 La cotización no coincide con la solicitud
sol-005  apta true   → PENDIENTE: RC8 OC retroactiva (retroactiva true)
sol-006  apta true   → PENDIENTE: RC6 IVA no informado
Idempotencia sol-001 → OC 4500000001 (idempotente: ya existía)
Confirmaciones       → sol-004 OC 4500000002 · sol-005 OC 4500000003 RETROACTIVA · sol-006 OC 4500000004
```

- **`out/control.csv`** terminó con 10 filas: 1 creada, 2 bloqueadas, 3 pendientes, 1 idempotente y 3 creadas tras confirmar, con `retroactiva = true` en las dos filas de SOL-2026-005.
- **Prueba de punta a punta por HTTP y navegador** (backend en modo producción con login local y proveedor determinista): sol-004 pidió confirmación y creó la OC 4500000001 al confirmar; sol-002 quedó bloqueada con la acción sugerida.
- **Prueba de humo del contenedor Docker:** detectó un bug real. Las copias locales de los fixtures tenían permisos `600` y el contenedor corre con un usuario sin privilegios, así que `solicitud.json` no se podía leer y la herramienta respondía "Paquete incompleto". Se corrigió en el `Dockerfile` (`chmod -R a+rX` sobre fuentes y fixtures) y se volvió a probar: sol-001 creada, sol-002 bloqueada, sol-004 pendiente.
- **CI:** cada push corre `bun run demo.ts` en GitHub Actions; quedó en verde.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Las herramientas recalculan desde las fuentes y verifican el payload | Confiar en el paquete y la orden que arma el modelo | Cierra el riesgo del PRD §10 ("el modelo arregla un monto"); el costo es leer archivos pequeños varias veces |
| `oc_crear` como único guardián y registrador de cada intento | Registrar el control desde el agente o desde la validación | Un solo punto decide y deja la fila, aunque el intento sea bloqueado o pendiente |
| `payload` nulo permitido cuando hay bloqueos | Exigir siempre una orden | Con bloqueos no hay orden posible, pero el intento debe quedar en `control.csv` |
| Idempotencia antes que confirmación | Pedir confirmación aunque la OC ya exista | Repetir un caso ya confirmado debe devolver su número, no volver a preguntar |
| SAP simulado en JSONL con cola de escritura | Base de datos para el mock | El PRD pide archivos; la cola evita números duplicados dentro del proceso |
| PDF con pdf-lib y fechas fijas | Impresión del correo con un navegador sin interfaz | Menos dependencias y resultado reproducible |

## 6. Pendientes para producción

- Implementar `SapOData` detrás de `SapAdapter` (diseño en SOLUCION.md §6) con idempotencia por referencia externa y `$batch` atómico.
- Numeración transaccional si el mock corriera en varias instancias (en producción la asigna SAP).
- Guardar evidencias en almacenamiento versionado e inmutable (por ejemplo S3 con *object lock*).
- Pruebas unitarias de cada herramienta, incluidos los errores de HU-6.
- Lectura de adjuntos binarios reales (`.xlsx`, `.pdf`, `.eml`).
