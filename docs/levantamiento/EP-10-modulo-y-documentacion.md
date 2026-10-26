# EP-10 · Módulo reutilizable y documentación técnica

| Ficha | |
|---|---|
| **Épica** | EP-10 · Agente empaquetado como módulo (bonus) y documentación técnica de la solución |
| **Objetivo de negocio** | Que el agente se pueda integrar a otras plataformas de agentes sin depender del servidor, y que la solución quede explicada para defenderla, operarla y llevarla a producción (incluida la integración real con SAP) |
| **Estado** | Hecho |
| **Prioridad** | Bonus (módulo) · P0 (SOLUCION.md y README) |
| **Estimación** | 13 puntos |
| **Sesiones de origen** | S4 Arquitectura, seguridad y nube · S5 Costos y observabilidad de IA · S6 Revisión y aceptación |
| **Trazabilidad PRD** | 9.1 `SOLUCION.md` (12 secciones) · 9.2 `README.md` · 9.4 Bonus `modulo/` · 7.5 Diseño del adaptador SAP real · 10 Riesgos y supuestos |

## 1. Levantamiento

**Sesiones de origen:** S4 (reutilización del agente e integración con SAP), S5 (cómo se justifica el costo), S6 (qué se entrega y cómo se evalúa).

**Hallazgos (citas de las sesiones):**

- Equipo Perxia (S4): "Si el agente sirve, lo queremos montar en otras plataformas de agentes. Tiene que salir como un módulo con su prompt, sus herramientas y su conocimiento, sin nuestro servidor."
- Equipo Perxia (S6): "Lo que más nos preocupa de los módulos es que sean copias que se desactualizan. El módulo tiene que ser lo mismo que corre la app."
- Líder de TI/Seguridad (S4): "La conexión a SAP no está confirmada. Queremos ver qué opción elegirían, cómo autentican, dónde viven las credenciales y qué hacen si SAP responde a medias."
- Dirección administrativa y financiera (S5): "Antes de aprobar esto queremos saber cuánto cuesta cada OC procesada y qué le decimos a la dirección sobre las OC retroactivas."
- Equipo Perxia (S6): "Cualquier persona del equipo debe poder levantarlo en local con un comando y entender dónde está cada cosa."

**Necesidades:**

1. Carpeta `modulo/` con `agent.md` (frontmatter `description`, `mode: primary`, `permission { edit: deny, bash: deny }` y el system prompt), `tools/oc.ts` importable sin el servidor y `skill/ordenes-compra/SKILL.md` (frontmatter `name`, `description` y el conocimiento del proceso).
2. Garantía de que las tres piezas del módulo son las mismas que usa la aplicación.
3. `SOLUCION.md` con las 12 secciones obligatorias del PRD 9.1.
4. `README.md` con arranque local, variables, `demo.ts`, link y acceso.
5. Documentos de soporte: costos, modelo de datos e infraestructura.

**Restricciones:**

- El PRD evalúa que el módulo no sean copias divergentes (9.4).
- La documentación no puede contener claves ni datos personales reales.
- El diseño del adaptador SAP real es solo documentación (PRD 2.3 y 7.5).

## 2. Historias de usuario

### HU-10.1 · Empaquetar el agente como módulo reutilizable (PRD 9.4, bonus)

**Como** equipo Perxia **quiero** el agente empaquetado con su prompt, sus herramientas y su conocimiento **para** integrarlo a otras plataformas de agentes sin depender del servidor de esta aplicación.

```gherkin
Escenario: estructura del módulo
  Dado la carpeta modulo/
  Cuando se revisa su contenido
  Entonces existe agent.md con frontmatter description, mode primary y permission edit deny, bash deny
  Y existe tools/oc.ts con las herramientas oc_leer_paquete, oc_validar, oc_construir_payload, oc_generar_evidencia y oc_crear
  Y existe skill/ordenes-compra/SKILL.md con frontmatter name y description

Escenario: herramientas importables sin el servidor
  Dado un script que importa modulo/tools/oc.ts
  Cuando ejecuta crear con caso "sol-001" y un ToolContext propio
  Entonces obtiene el mismo resultado que la aplicación, sin levantar el servidor HTTP
```

- **Reglas de negocio:** el prompt del módulo es el mismo del operador (reglas de voz más `prompt.md`); el conocimiento es el mismo `ordenes-compra.md` que consulta el agente.
- **Prioridad:** Bonus · **Puntos:** 3 · **Estado:** Hecho.

### HU-10.2 · Impedir que el módulo diverja de la aplicación

**Como** equipo Perxia **quiero** que la integración continua falle si el módulo deja de coincidir con las fuentes de la app **para** no publicar nunca una copia desactualizada.

```gherkin
Escenario: módulo sincronizado
  Dado que nadie cambió los prompts ni el conocimiento desde la última generación
  Cuando se ejecuta "bun run modulo:check"
  Entonces imprime "modulo/ sincronizado ✓" y termina con código 0

Escenario: se cambia el prompt sin regenerar
  Dado un cambio en apps/backend/agent/prompt.md
  Cuando la CI ejecuta "bun run modulo:check"
  Entonces falla indicando "modulo/agent.md" y la instrucción "Corre: bun run modulo:build"
```

- **Prioridad:** Bonus · **Puntos:** 2 · **Estado:** Hecho.

### HU-10.3 · Documentar la solución completa (PRD 9.1, 9.2)

**Como** evaluador del reto **quiero** un `SOLUCION.md` con las 12 secciones y un `README.md` operativo **para** entender el problema, la arquitectura, el ciclo del agente, los controles, los costos y los riesgos, y poder levantarlo yo mismo.

```gherkin
Escenario: secciones obligatorias
  Dado el archivo SOLUCION.md
  Cuando se revisan sus títulos
  Entonces contiene, en orden, problema, arquitectura, ciclo del agente, elección del modelo, matriz de controles, adaptador SAP real, lectura del proceso, decisiones, supuestos, cobertura, uso de IA y riesgos

Escenario: matriz de controles con casos reales
  Dado la sección 5 de SOLUCION.md
  Cuando se lee la fila de RC5
  Entonces explica la tolerancia del 2 % y cita sol-004 (25.000.000 vs 26.500.000, 6 %)

Escenario: arranque local
  Dado una máquina con Bun
  Cuando se siguen los pasos del README
  Entonces "bun run dev" levanta front y backend, y "bun run demo.ts" corre sin clave
```

- **Prioridad:** P0 · **Puntos:** 3 · **Estado:** Hecho.

### HU-10.4 · Diseñar el adaptador SAP real (PRD 7.5)

**Como** líder de TI/Seguridad **quiero** el diseño de la integración real con SAP, con plan B **para** decidir la viabilidad sin bloquear el ahorro de tiempo que da el agente.

```gherkin
Escenario: opción elegida y mapeo
  Dado la sección 6 de SOLUCION.md
  Cuando se revisa el diseño
  Entonces elige OData API_PURCHASEORDER_PROCESS_SRV detrás de SAP Integration Suite
  Y compara con BAPI_PO_CREATE1, Integration Suite y carga por archivo
  Y mapea cada campo del payload 7.4 a A_PurchaseOrder, A_PurchaseOrderItem y A_PurOrdAccountAssignment

Escenario: credenciales e idempotencia
  Dado el mismo diseño
  Cuando se revisan autenticación y errores
  Entonces las credenciales viven en AWS Secrets Manager con OAuth 2.0 client credentials, nunca en el agente ni en el prompt
  Y la idempotencia usa solicitud_id como referencia externa, con consulta previa y $batch atómico

Escenario: conexión no viable
  Dado que SAP no se puede conectar a corto plazo
  Cuando se aplica el plan B
  Entonces el agente genera un archivo de carga masiva y una "OC lista para pegar" en el orden de ME21N
```

- **Prioridad:** P0 · **Puntos:** 3 · **Estado:** Hecho.

### HU-10.5 · Documentar costos, datos e infraestructura

**Como** dirección administrativa y financiera **quiero** la proyección de costo por caso, el modelo de datos y la guía de infraestructura **para** aprobar la operación con números y saber exactamente qué se crea y cómo se borra.

```gherkin
Escenario: costo por caso
  Dado docs/costos.md
  Cuando se consulta el costo de un caso completo
  Entonces muestra cerca de USD 0,05 a 0,06 por OC y cuántas interacciones caben en el presupuesto de USD 10

Escenario: inventario de infraestructura
  Dado INFRA.md
  Cuando se revisa el inventario
  Entonces lista solo los recursos con prefijo perxia-reto03 y los comandos exactos para borrarlos
```

- **Prioridad:** P1 · **Puntos:** 2 · **Estado:** Hecho.

## 3. Solución implementada

**Módulo reutilizable:**

| Pieza | Origen | Cómo se garantiza que es la misma |
|---|---|---|
| `modulo/agent.md` | `apps/backend/agent/voz.md` + `apps/backend/agent/prompt.md` | Generado por `scripts/modulo.ts` con el frontmatter del PRD y el aviso "No editar a mano" |
| `modulo/tools/oc.ts` | `apps/backend/src/tools/oc.ts` | Es un reexport (`export * from "../../apps/backend/src/tools/oc"`), no una copia; también reexporta los tipos `ToolContext` y `ToolDef` |
| `modulo/skill/ordenes-compra/SKILL.md` | `apps/backend/src/knowledge/ordenes-compra.md` | Generado por `scripts/modulo.ts` con frontmatter `name` y `description` |

- `bun run modulo:build` regenera las tres piezas.
- `bun run modulo:check` compara lo generado en memoria con lo que hay en disco y termina con error si difieren. Corre en `.github/workflows/ci.yml` y forma parte de `bun run verify`.

**Documentación técnica:**

| Documento | Contenido |
|---|---|
| `SOLUCION.md` | Las 12 secciones del PRD 9.1: diagrama de arquitectura y dónde vive prompt, conocimiento y ejecución; ciclo multi-agente con tope de iteraciones y compuerta de confirmación; modelos y costo; matriz RC1–RC10 con el caso que activa cada regla; adaptador SAP real; lectura del proceso de OC retroactivas (sol-005: factura 17 días antes de la solicitud) con propuesta de cambio; decisiones; supuestos; cobertura; uso de IA; riesgos |
| `README.md` | Link de prueba, acceso, arranque local con un comando, `demo.ts`, variables de entorno, API, estructura y comandos |
| `docs/costos.md` | Tarifas, costo por caso y por agente, cuánto cabe en USD 10, escenario mensual y comparación con alternativas |
| `docs/modelo-datos.md` | Diagrama entidad-relación, diccionario de datos, ciclo de una confirmación, decisiones y consultas útiles |
| `INFRA.md` | Inventario exacto con prefijo `perxia-reto03`, despliegue desde PowerShell local o CloudShell, acceso para evaluadores, control de costos y borrado seguro |

**Diseño del adaptador SAP real (SOLUCION.md §6):** OData `API_PURCHASEORDER_PROCESS_SRV` a través de SAP Integration Suite; implementación `SapOData` detrás de la misma `SapAdapter`; tabla de mapeo campo a campo (por ejemplo `condiciones_pago` → `PaymentTerms`, `centro_costo` → `CostCenter` con `AccountAssignmentCategory = K`, `precio_unitario` convertido a neto en `NetPriceAmount`); OAuth 2.0 con usuario técnico de mínimo privilegio y credenciales en AWS Secrets Manager; idempotencia por `solicitud_id` como referencia externa, consulta previa y `$batch` atómico; reintento del adjunto sin repetir la OC; plan B con archivo de carga masiva y "OC lista para pegar".

## 4. Verificación

- `bun run modulo:build` generó `modulo/agent.md`, `modulo/skill/ordenes-compra/SKILL.md` y `modulo/tools/oc.ts`; `bun run modulo:check` respondió "modulo/ sincronizado ✓".
- El typecheck raíz incluye `modulo/**/*.ts`, así que un cambio de firma en las herramientas rompe la compilación del módulo.
- La CI de GitHub Actions corre "Módulo reutilizable sincronizado" en cada push; quedó en verde.
- Los títulos de `SOLUCION.md` cubren las 12 secciones del PRD 9.1, revisadas una a una.
- El README se validó siguiendo sus pasos: `bun run build && bun run start` sirvió el front y la API en el puerto 8080, y `bun run demo.ts` corrió sin clave.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Módulo generado desde las fuentes + verificación en CI | Copiar a mano prompt, herramientas y conocimiento | Las copias se desactualizan; el PRD evalúa justamente que no diverjan |
| `tools/oc.ts` como reexport | Duplicar el archivo de herramientas en el módulo | Un reexport es la misma implementación por construcción |
| Fuente de verdad en `apps/backend` y módulo como salida | Fuente de verdad en `modulo/` y la app leyendo de ahí | El PRD exige `agent/prompt.md` y el conocimiento en la app; el módulo es un empaque |
| OData con Integration Suite para SAP | RFC/BAPI directo desde el agente | API estándar y liberada, `$batch` atómico, y desacopla al agente de SAP con autenticación y monitoreo centralizados |
| Documentos de soporte separados (costos, datos, infra) | Todo dentro de SOLUCION.md | SOLUCION.md mantiene la estructura obligatoria y enlaza al detalle |

## 6. Pendientes para producción

- Publicar el módulo como paquete versionado (con su propio `package.json` y dependencias declaradas) para instalarlo fuera de este monorepo.
- Implementar y probar `SapOData` contra un sistema SAP de calidad.
- Agregar al README un apartado de operación (alertas, rotación de credenciales, respaldo de datos).
- Mantener la documentación en la definición de terminado: si cambia el contrato, se actualizan README, SOLUCION.md e INFRA.md en el mismo cambio.
