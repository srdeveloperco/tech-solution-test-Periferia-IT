# SOLUCIÓN · Agente conversacional "Órdenes de Compra SAP"

> Reto técnico 03 · Perxia 2.0 · Periferia IT Group

## 1. Problema en una frase

La analista administrativa digita a mano cada orden de compra en SAP desde un correo con tres adjuntos, y nadie verifica de forma sistemática que el aprobador tenga autoridad ni mide cuántas OC se crean después de la factura. Le duele a **la analista** (tiempo y errores que se corrigen en el cierre contable), a **contabilidad/auditoría** (control que hoy es mental) y a **la dirección** (no sabe cuántas compras se saltan la cotización).

## 2. Arquitectura

```
                         ┌──────────────── apps/web (React 19 + Vite) ────────────────┐
  Analista ──HTTPS──▶    │  Conversación (izq.)          Lienzo en vivo (der.)        │
                         │  · historial, streaming       · etapas del flujo           │
                         │  · llamadas a herramientas    · paquete · controles RC     │
                         │  · hoja de confirmación       · OC estilo SAP · evidencia  │
                         │  Login · Observatorio (costos, prompts, trazas)            │
                         └───────────────▲──────── SSE /api/chat ─────────────────────┘
                                         │
┌────────────────────────────── apps/backend (Bun + Hono, monolito modular) ───────────────────────────┐
│ server/   HTTP, SSE, auth (Cognito JWT), límites por IP, sirve el front en producción                │
│ agent/    orquestación: router → especialista → verificador; sesiones; compuerta de confirmación     │
│ llm/      adaptador propio enviar(...) → anthropic.ts | guion.ts (determinista, sin clave)           │
│ tools/    oc.ts: oc_leer_paquete · oc_validar · oc_construir_payload · oc_generar_evidencia · oc_crear│
│ sap/      SapAdapter + SapMock (out/sap/ordenes.jsonl)                                               │
│ observabilidad/  Observer propio sobre SQLite: prompts, llamadas, herramientas, costo, presupuesto   │
│ knowledge/ordenes-compra.md   ·   agent/*.md (prompts)                                               │
└──────────────┬───────────────────────────────────────────────┬───────────────────────────────────────┘
               │ importa reglas puras                          │ lee / escribe
      packages/domain (zod, RC1–RC10, sin IO)      fixtures/ (solo lectura) · out/ (control.csv, log.jsonl,
      packages/contracts (tipos web↔backend)       sap/, <caso>/aprobacion.{txt,pdf}, trazabilidad.json, observatorio.db)
```

**Dónde vive cada cosa** (la separación que pide el PRD 6.5):

| Capa | Ruta | Qué contiene |
|---|---|---|
| Comportamiento | `apps/backend/agent/prompt.md` (+ `router.md`, `asesor.md`, `conversador.md`, `voz.md`) | System prompts en Markdown, fuera del código |
| Conocimiento | `apps/backend/src/knowledge/ordenes-compra.md` | Proceso, RC1–RC10 en lenguaje de negocio, glosario SAP, política de retroactivas |
| Ejecución | `apps/backend/src/tools/oc.ts` | Herramientas zod; única fuente de valores |
| Reglas | `packages/domain/src/reglas.ts` | RC1–RC10 como funciones puras (mismo paquete → mismo resultado) |
| Integración | `apps/backend/src/sap/adapter.ts`, `mock.ts` | Interfaz obligatoria y SAP simulado |

Un cambio de reglas de negocio toca `packages/domain` y `knowledge/`, nunca el servidor. Los límites entre capas se verifican con `bun run boundaries` (CI y hook de pre-push): el dominio no hace IO, las herramientas no conocen HTTP ni el LLM, el LLM no conoce las herramientas concretas, y el front solo importa tipos.

**Por qué monorepo con monolito modular y no microservicios.** El dominio es pequeño y transaccional (una OC por solicitud). Un monolito modular con puertos y adaptadores (`SapAdapter`, adaptador LLM, `Observador`) da el mismo aislamiento que microservicios sin la latencia de red, la consistencia distribuida ni el costo operativo. El punto natural para extraer un servicio sería el adaptador SAP real (ver §6), y la interfaz ya está lista para eso.

## 3. Ciclo del agente

Orquestación **secuencial multi-agente** con tres patrones de *Building effective agents*: enrutamiento, LLM aumentado con herramientas y evaluador.

1. **Router híbrido.** Primero reglas deterministas y sin costo: botón de confirmar, `sol-NNN` con intención de procesar, o "sí/confirmo/dale" con un pendiente activo. Solo si nada aplica decide un modelo pequeño, con salida estructurada forzada (`enrutar`: intención, caso, motivo). El front muestra qué agente y qué modelo atendió, y si el enrutamiento fue gratis.
2. **Especialista.**
   - `operador`: ciclo con herramientas oc_*.
   - `asesor`: preguntas de proceso y estado, con conocimiento y datos de solo lectura.
   - `conversador`: charla breve y fuera de alcance, redirige a la tarea.
3. **Ciclo del operador.** prompt → modelo → herramientas → modelo… con **tope de 25 iteraciones por turno** (`AGENT_MAX_ITERACIONES`). Al alcanzarlo, responde con lo hecho y lo que falta. Cada argumento se valida con zod antes de ejecutar. Si no cumple, el error vuelve al modelo y no se ejecuta nada.
4. **Confirmación humana (CA3), impuesta por diseño:**
   - Cuando `oc_crear` devuelve `pendiente`, el servidor guarda el pendiente, emite el evento `confirmacion` y hace la última llamada al modelo **sin herramientas**. Así el turno solo puede cerrar con una pregunta.
   - Si después el modelo intenta `oc_crear(confirmado=true)` sin que el usuario haya confirmado ese caso, el servidor **no ejecuta** y le devuelve el error al modelo. Confirmar vale por botón o por texto afirmativo.
5. **Verificador de cifras (CA2).** Evaluador determinista: extrae montos, números de OC y NIT del texto final y comprueba que salieron de una herramienta. Si encuentra uno inventado, hace un reintento con retroalimentación. El front lo muestra.
6. **Errores (CA5).** Error de herramienta, del proveedor LLM o timeout: mensaje claro en el chat, la sesión sigue viva.
7. **Trazabilidad (CA4).** Cada llamada a herramienta queda en el chat, en `out/log.jsonl` y en el observatorio. El observatorio guarda también el system prompt (versionado por hash), los mensajes enviados, las variables dinámicas, la respuesta cruda, los tokens, el costo y la latencia.

Además, **las herramientas no le creen al modelo**. `oc_validar`, `oc_construir_payload` y `oc_crear` recalculan desde los archivos del caso. Si el payload que manda el modelo difiere del canónico, `oc_crear` lo rechaza indicando los campos distintos. El modelo no puede "arreglar" un monto para que cuadre.

## 4. Elección del modelo

| Agente | Modelo | Por qué |
|---|---|---|
| Router | Claude Haiku 5.5 (solo si las reglas no deciden) | Clasificación corta con salida estructurada: rápido y barato |
| Operador | Claude Sonnet 5.5 | Uso de herramientas confiable en cadenas de 5 a 7 pasos y redacción precisa con cifras |
| Asesor / Conversador | Claude Haiku 5.5 | Respuestas de conocimiento y charla; no ejecutan acciones |

**Costo:** el detalle por caso y la proyección mensual están en [`docs/costos.md`](docs/costos.md).

**Controles de costo:**
- Prompt caching del system prompt, las herramientas y el conocimiento.
- Historial recortado: los resultados viejos de herramientas se resumen.
- `max_tokens` por agente.
- Tope de iteraciones y de tokens por sesión.
- **Presupuesto global de USD 10** para la cuenta de prueba (`PRESUPUESTO_USD`). Antes de cada llamada se verifica el gasto acumulado más una estimación conservadora. Al llegar al límite, el agente lo dice en lenguaje claro y no llama al modelo. Se recomienda también fijar el límite de gasto del workspace en la consola de Anthropic.

El proveedor `guion` (sin clave) recorre el mismo ciclo y las mismas herramientas de forma determinista. Sirve para la CI y como respaldo del link, y demuestra que cambiar de proveedor no toca el ciclo.

## 5. Matriz de controles

Implementación en `packages/domain/src/reglas.ts`. Cada regla aporta exactamente un control con estado (`ok`, `bloqueo`, `confirmacion`, `derivado`, `no_aplica`), que el lienzo muestra como lista RC1–RC10.

| # | Regla | Tipo | Cómo se implementó | Caso que la activa |
|---|---|---|---|---|
| RC1 | Proveedor existe y está activo | Bloqueo | Búsqueda por NIT normalizado (sin puntos ni dígito de verificación). Si la solicitud no trae NIT, usa el de la cotización y, si tampoco hay, el nombre sin tildes ni sufijos societarios | sol-002 (NIT 901999000 no existe) |
| RC2 | Aprobación existe, dice "Aprobado" y viene de un aprobador del centro | Bloqueo | Detecta "aprobado" descartando negaciones ("no está aprobado"). Compara el remitente con la matriz del centro y sugiere aprobadores válidos | sol-003 (fvargas aprueba CC-3030, no CC-2020) |
| RC3 | Valor ≤ tope del aprobador | Bloqueo | Solo se evalúa con aprobador válido. Si no, avisa si ningún aprobador del centro tiene tope suficiente (sol-003: 74M > 30M) | sol-003 (aviso de escalamiento) |
| RC4 | Subárea pertenece al centro | Bloqueo | Comparación sin tildes ni mayúsculas. También bloquea si el centro no existe | — |
| RC5 | Cotización vs solicitud ≤ 2 % | Confirmación | Lee el TOTAL de la cotización en formato colombiano y muestra los dos valores lado a lado. Sin cotización o cotización ilegible también pide confirmación | sol-004 (25.000.000 vs 26.500.000, 6 %) |
| RC6 | IVA ausente → default del proveedor | Confirmación + derivado | Propone `indicador_iva_default` y pide confirmarlo | sol-006 (C1) |
| RC7 | Condiciones ausentes → default del proveedor | Derivado | Se informa, sin bloquear ni pedir confirmación | sol-006 (Z030) |
| RC8 | Factura anterior a la solicitud → retroactiva | Confirmación | `retroactiva = true` en el resultado, la OC y `control.csv` | sol-005 (factura 10/08, solicitud 27/08) |
| RC9 | Aprobación ≥ fecha de solicitud | Confirmación | Compara la fecha local del correo (ISO con zona) con la de la solicitud | — |
| RC10 | cantidad × unitario = total (±1) | Bloqueo | Aritmética con tolerancia de una unidad monetaria | — |

Derivados de forma, que no vienen de maestros pero se informan:
- **Unidad:** la solicitud no la trae. `H` si la descripción habla de horas (sol-004), `MES` si es mensual, `UN` en otro caso.
- **Texto breve:** se recorta a 40 caracteres en una palabra completa. El texto completo queda en `trazabilidad.json`.

**La más difícil: RC5 y RC8**, porque dependen de leer texto libre (cotización y factura). La decisión clave fue que un documento ilegible **no pasa en silencio**. Se reporta como faltante y se convierte en confirmación. El parser tolera formatos colombiano y anglosajón, validez en días o en fecha y numeraciones como "No. FC-88231".

## 6. Diseño del adaptador SAP real

**Opción elegida: OData `API_PURCHASEORDER_PROCESS_SRV`** (S/4HANA), expuesta a través de **SAP Integration Suite / API Management**.

| Opción | Cuándo | Por qué sí / no |
|---|---|---|
| OData `API_PURCHASEORDER_PROCESS_SRV` | S/4HANA (on-premise o cloud) | API estándar y liberada, REST/JSON, `$batch` atómico, soporta deep insert de cabecera e ítems. **Preferida** |
| RFC/BAPI `BAPI_PO_CREATE1` | ECC o S/4 sin OData habilitado | Madura y completa, pero exige SAP JCo/NCo o un middleware y un usuario RFC, y es más difícil de exponer de forma segura |
| Integration Suite (iFlow) | Si ya existe en Periferia | Desacopla el agente de SAP. Centraliza autenticación, reintentos y monitoreo. Puede llamar OData o BAPI por dentro |
| Carga por archivo | Si no hay conexión | Plan B (abajo) |

Dado que la viabilidad no está confirmada, el agente solo conoce `SapAdapter`. La implementación real (`SapOData`) vive detrás de la misma interfaz y se elige por configuración. Se puede llevar a un microservicio de integración sin tocar el ciclo del agente.

**Mapeo del payload (7.4 → `A_PurchaseOrder` / `A_PurchaseOrderItem` / `A_PurOrdAccountAssignment`):**

| Payload | SAP | Nota |
|---|---|---|
| `sociedad` | `CompanyCode` | 1000 |
| `organizacion_compras` | `PurchasingOrganization` | 1000. `PurchasingGroup` sale de configuración |
| — | `PurchaseOrderType` | `NB` (pedido estándar) |
| `proveedor.codigo_sap` | `Supplier` | |
| `moneda` | `DocumentCurrency` | |
| `condiciones_pago` | `PaymentTerms` | Z000/Z015/Z030/Z060 |
| `referencia.solicitud_id` | `CorrespondenceExternalReference` (o campo de extensión `YY1_SolicitudID`) | Clave de idempotencia |
| `posiciones[].numero` | `PurchaseOrderItem` | 10, 20… |
| `posiciones[].descripcion` | `PurchaseOrderItemText` | Texto breve de 40. El texto largo va en las notas del ítem |
| `cantidad` / `unidad` | `OrderQuantity` / `PurchaseOrderQuantityUnit` | Tabla de conversión: UN→EA (o ST), H→H, MES→MON |
| `precio_unitario` | `NetPriceAmount` | **Se convierte a neto**: bruto / (1 + tasa del indicador), porque las cotizaciones traen IVA incluido |
| `indicador_iva` | `TaxCode` | |
| `centro_costo` | `A_PurOrdAccountAssignment.CostCenter` con `AccountAssignmentCategory = K` | |
| `subarea` | Campo de extensión o elemento PEP/orden interna, según el modelo de costos | Se define con contabilidad |
| `aprobador` + PDF | `API_CV_ATTACHMENT_SRV` (adjunto al objeto BUS2012) y nota de cabecera con email y sha256 | |
| `excepciones` | Nota de cabecera: código, detalle y quién confirmó | Auditoría |

**Autenticación:**
- OAuth 2.0 client credentials contra Integration Suite (o un *communication arrangement* `SAP_COM_0053` en S/4 Cloud) con un usuario técnico de mínimo privilegio, que solo crea y consulta pedidos.
- Credenciales en **AWS Secrets Manager**, leídas por el adaptador en tiempo de ejecución con el rol de la carga de trabajo. Nunca en el agente, el prompt, el repositorio ni los logs.
- Rotación periódica. Si es on-premise, conectividad privada (Cloud Connector o VPN).

**Idempotencia y errores parciales:**
- Antes de crear, `buscarOrdenPorReferencia(solicitud_id)` consulta por la referencia externa: si existe, devuelve ese número.
- La creación de cabecera, ítems e imputación va en **un solo changeset `$batch`**, que es atómico: o se crea completa o no se crea.
- Ante timeout o 5xx, **primero se vuelve a consultar por referencia** y solo después se reintenta, con backoff exponencial y como máximo 3 intentos.
- Si la OC se creó pero falla el adjunto, la OC no se repite: queda `evidencia_pendiente` en control y un reintento solo del adjunto.
- Los mensajes de SAP (proveedor bloqueado, período cerrado, presupuesto) se traducen a lenguaje claro y se devuelven como bloqueo con acción sugerida.

**Plan B si la conexión no es viable.** El agente igual elimina la digitación y el riesgo:
1. **Archivo de carga masiva** (CSV o Excel con la plantilla de SAP Migration Cockpit, o una carga vía BAPI que ejecuta el equipo SAP), generado por lote diario de OC validadas.
2. **"OC lista para pegar"**: vista con los campos en el orden de ME21N y botón de copiar por campo, más el PDF de evidencia listo para adjuntar.
3. El número de OC se registra de vuelta en el chat ("ya la creé: 4500001234") para cerrar el ciclo en `control.csv`.

## 7. Lectura del proceso: OC retroactivas

En sol-005, la factura de Papelería Central (10/08) llegó **17 días antes** de la solicitud (27/08). La aprobación (28/08) dice literalmente "ya llegó la factura, por favor crear la OC para poder radicarla". La OC dejó de ser un control previo y pasó a ser un trámite para poder pagar. El compromiso de gasto ocurrió sin validar presupuesto ni autoridad, y la cotización (05/08) existió pero no gobernó la compra.

**Qué le diría a la dirección:**
- Hoy no hay forma de saber cuántas OC son retroactivas. Desde ahora `control.csv` lo marca en cada intento (`retroactiva = true`), con proveedor, centro de costo y aprobador.
- Con un mes de datos se puede ver qué áreas, proveedores y aprobadores concentran el desvío.
- El riesgo no es solo de forma: compras sin competencia de precios, compromisos por encima del tope del aprobador y presupuesto de centro de costo consumido sin visibilidad.

**Cambio de proceso propuesto:**
1. **Política "sin OC no hay pago"**: los proveedores deben citar el número de OC en la factura y Cuentas por Pagar devuelve las que no lo traen. Las excepciones requieren justificación y aprobación de un nivel superior.
2. **OC abiertas o contratos marco** para compras recurrentes de bajo valor (papelería, tóner, suscripciones). Se aprueban una vez por trimestre y cada consumo se descuenta. Esto elimina la causa más común de retroactividad.
3. **Indicador mensual**: % de OC retroactivas por área. Meta: menos del 5 % en dos trimestres. Revisión con los líderes que más concentran.
4. **El agente como canal**: si la solicitud llega por correo, la OC sale el mismo día y desaparece el incentivo de "comprar primero y legalizar después".

Queda abierta la decisión de política (tolerar con marca o rechazar), que es de la dirección. El agente ya entrega la medición para tomarla.

## 8. Decisiones y trade-offs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Monolito modular en monorepo con puertos y adaptadores | Microservicios (SAP, agente, observabilidad) | Mismo aislamiento lógico sin red, sin consistencia distribuida y con un solo despliegue. Los límites se verifican con `bun run boundaries` |
| Router híbrido (reglas + modelo pequeño) y especialistas por intención | Un solo agente grande con el modelo más capaz para todo | La mayoría de turnos ("procesa sol-004", "confirmo") se enruta gratis por reglas. El modelo caro solo trabaja donde hay herramientas. Menos costo y latencia |
| Las herramientas recalculan desde las fuentes y verifican el payload | Confiar en los argumentos que arma el modelo | Cierra el riesgo de que el modelo "arregle" un monto (PRD §10). El costo es leer los archivos varias veces, despreciable aquí |
| Confirmación impuesta por el servidor (compuerta + última llamada sin herramientas) | Confiar solo en el prompt | El PRD pide que el diseño haga innecesaria la regla. Un prompt se puede ignorar; la compuerta no |
| Reglas de voz compartidas en cada especialista | Un agente "redactor" que reescribe la respuesta final | Un redactor puede alterar cifras (rompe CA2) y suma latencia y costo |
| Observer propio sobre SQLite (`bun:sqlite`) | LangChain, Langfuse o DynamoDB | Cero dependencias y cero recursos AWS extra. Guarda exactamente lo que se necesita para mantener y optimizar prompts. En producción iría a una base gestionada |
| Amazon Lightsail Container Service (1 recurso, HTTPS incluido) | S3 + API Gateway + Lambda + DynamoDB, App Runner, ECS | API Gateway corta a ~29 s (un turno con 5 herramientas puede pasarse). Lambda no comparte archivos ni sesiones entre instancias, lo que rompe la idempotencia. App Runner cerró a clientes nuevos en 2026. ECS crea VPC y balanceador, demasiados recursos en una cuenta de producción |
| SSE para eventos en vivo | WebSocket | Unidireccional es suficiente, funciona sobre HTTP/1.1 detrás de cualquier proxy y es más simple de autenticar |

## 9. Supuestos

1. Los precios de solicitud y cotización **incluyen IVA** (así lo dicen las cotizaciones). El payload simulado los conserva y el adaptador real los convierte a neto (§6).
2. Ante diferencia con la cotización (RC5), la OC se crea por el **valor de la solicitud**, que es el aprobado. Usar el de la cotización exigiría nueva aprobación.
3. Si la solicitud no trae NIT, se usa el de la cotización antes que el nombre (sol-006). Es más confiable que el nombre libre.
4. La fecha de la aprobación se toma en la hora local del correo (-05:00) para RC9.
5. Un indicador de IVA o una condición de pago que no exista en el maestro se trata como ausente (se propone el default del proveedor).
6. La unidad se infiere de la descripción (`H`, `MES`, `UN`) y el texto breve se recorta a 40 caracteres. Ambos se informan como derivados.
7. "Aprobado" con negación ("no está aprobado") no cuenta como aprobación.
8. La idempotencia es por `solicitud_id`. Un caso ya creado devuelve su número aunque se pida de nuevo sin confirmar.
9. `control.csv` registra **cada intento**, incluidos pendientes repetidos. Así se mide también cuántas veces una OC esperó confirmación.
10. `sociedad` y `organizacion_compras` son constantes (1000) según el PRD.
11. Los maestros de los fixtures son completos. En producción se consultan en SAP (`consultarProveedor`).

## 10. Cobertura

| Historia | Estado | Detalle | Falta para producción |
|---|---|---|---|
| HU-1 Leer el paquete | Hecho | Paquete 7.2 normalizado; faltantes como `null` + nombre; errores legibles | Lectura de `.xlsx`, `.pdf` y `.eml` reales (OCR para escaneados) |
| HU-2 Validar | Hecho | RC1–RC10 puras, con estado por control, derivados y retroactiva | Maestros en línea desde SAP |
| HU-3 Payload | Hecho | Esquema zod 7.4 y `trazabilidad.json` por campo | Precio neto y unidades SAP reales |
| HU-4 Evidencia | Hecho (P0 + P1) | `aprobacion.txt` con sha256 y `aprobacion.pdf` (pdf-lib, determinista) | Firma digital si auditoría la exige |
| HU-5 Crear OC | Hecho | Mock secuencial desde 4500000001, idempotente; `control.csv` por intento | Adaptador OData real (§6) |
| HU-6 Errores | Hecho | `{ ok:false, error }` en JSON malformado, monto no numérico o caso inexistente; la sesión sigue | Alertas operativas |
| Front de chat | Hecho | Conversación, herramientas visibles, confirmación resaltada, lienzo en vivo, login, observatorio | Pruebas de accesibilidad con usuarios |
| `demo.ts` | Hecho | 6 casos, idempotencia de sol-001 y confirmación explícita de sol-004 (también sol-005 y sol-006) | — |
| Bonus `modulo/` | Hecho | `agent.md`, `tools/oc.ts` y `SKILL.md` generados desde las mismas fuentes; la CI falla si divergen | Publicarlo como paquete |
| Tests automatizados | No hecho | Se priorizó el producto funcional; `demo.ts` cumple como verificación determinista | Tests unitarios de reglas y e2e del ciclo con el proveedor `guion` |

## 11. Uso de IA

- **Asistente:** Claude Code (Anthropic), en una sesión en la nube.
- **Para qué se usó:**
  - Análisis del PRD y de los fixtures, y propuesta de arquitectura (que yo revisé y ajusté: monorepo, Cognito, observatorio, tope de USD 10).
  - Andamiaje del monorepo.
  - Trabajo en paralelo con subagentes por frente: dominio y herramientas; orquestación del agente; front; harness, CI/CD e infraestructura; observabilidad y auth.
  - Redacción de prompts y documentación.
  - Una skill de diseño de interfaces para evitar estética genérica.
- **Qué descarté de lo propuesto y por qué:**
  - **S3 + API Gateway + Lambda:** el límite de ~29 s de API Gateway y la falta de estado compartido rompen el ciclo y la idempotencia.
  - **App Runner:** cerrado a clientes nuevos.
  - **Un agente redactor separado:** podía alterar cifras.
  - **LangChain/Langfuse:** demasiada dependencia para lo que se necesita medir.
  - **Microservicios:** sobredimensionados para este dominio.
- **Cómo verifiqué:** ejecuté `demo.ts` contra los 6 casos y comparé con los objetivos O1–O4 del PRD. Revisé las órdenes y evidencias generadas en `out/`. Probé el chat de punta a punta. Puedo explicar cada línea entregada.

## 12. Riesgos de llevarlo a producción

| Riesgo | Mitigación |
|---|---|
| La conexión a SAP no es viable a corto plazo | Plan B de §6 (carga masiva y "OC lista para pegar"). El agente ahorra la validación aunque no cree la OC |
| Inyección de instrucciones en el texto de correos o cotizaciones | El texto de los documentos es dato, no instrucción (lo dice el prompt). Las decisiones las toman reglas deterministas, el modelo no ve credenciales y las herramientas no ejecutan shell |
| Suplantación del correo de aprobación | Validar SPF/DKIM del remitente o mover la aprobación a un flujo firmado (por ejemplo, el workflow de liberación de SAP) |
| Datos sensibles enviados al proveedor del modelo | Contrato empresarial con retención cero, o modelo en la nube propia (Amazon Bedrock en región). Minimizar lo que se envía: el modelo ve resúmenes, no el maestro completo |
| Costo descontrolado | Presupuesto global, tope por sesión e iteraciones, router por reglas y límite de gasto en la consola del proveedor |
| Estado efímero (SQLite y `out/` dentro del contenedor) | En producción: base gestionada (RDS/DynamoDB) para observatorio y control, y S3 versionado con *object lock* para evidencias |
| Varias instancias asignando números en paralelo | En el real, el número lo asigna SAP. En el mock se usaría una secuencia transaccional en base de datos |
| Configuración de auth incompleta abre el link | Alarma en el arranque y `AUTH_MODO=cognito` obligatorio en producción, que falla en lugar de degradar |
| Parsers de texto frágiles con documentos reales | Lectura de PDF y Excel con validación de esquema y confirmación humana ante cualquier campo dudoso (mismo principio que RC5) |
