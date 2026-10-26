# EP-01 · Dominio y reglas de control

| Ficha | |
|---|---|
| **Épica** | EP-01 · Dominio y reglas de control (RC1–RC10) |
| **Objetivo de negocio** | Que la validación que hoy la analista hace "de memoria" sea sistemática, repetible y auditable: el mismo paquete con los mismos maestros produce siempre el mismo resultado |
| **Estado** | Hecho |
| **Prioridad** | P0 |
| **Estimación** | 21 puntos |
| **Sesiones de origen** | S1 Descubrimiento del proceso actual · S2 Reglas de control y excepciones · S6 Revisión y aceptación |
| **Trazabilidad PRD** | HU-1 (paquete normalizado, 7.2) · HU-2 (validación, 7.3) · HU-3 (payload 7.4 y trazabilidad) · HU-4 (evidencia y sha256) · RC1–RC10 · O1, O2, O3, O4 |

## 1. Levantamiento

**Sesiones de origen:** S1 con la analista administrativa y contabilidad (cómo se digita hoy la OC y dónde se equivocan); S2 con contabilidad/auditoría y la dirección administrativa y financiera (qué bloquea, qué se confirma y qué se mide).

**Hallazgos (citas de las sesiones):**

- Analista administrativa (S1): "Lo que más reviso es que el proveedor exista. La cotización trae el NIT con puntos y el dígito de verificación, y en SAP está sin nada, entonces lo comparo a ojo."
- Analista administrativa (S1): "Que el líder diga 'Aprobado' no basta: tiene que ser líder de ese centro de costo y tener tope para ese valor. Eso lo sé porque me sé la matriz, no porque esté escrito."
- Contabilidad (S1): "Un centro de costo o una subárea mal digitada la corregimos en el cierre. Es el error más caro que tenemos."
- Auditoría (S2): "Necesitamos saber de dónde salió cada dato de la OC: si vino de la solicitud, de la cotización o del maestro. Y el correo de aprobación tiene que quedar como evidencia que no se pueda cambiar."
- Dirección administrativa y financiera (S2): "Muchas OC se crean cuando ya llegó la factura. No queremos que el sistema las rechace todavía, pero sí queremos contarlas."
- Contabilidad (S2): "Si la cotización y la solicitud difieren un poco, por redondeos, no pasa nada. Si difieren mucho, alguien tiene que decidir con qué valor sale."

**Necesidades:**

1. Normalizar el paquete: correo, solicitud, cotización en texto libre, aprobación y factura (si existe), aunque vengan con formatos distintos.
2. Aplicar las 10 reglas del PRD con un resultado explícito por regla: qué pasó, qué no y por qué.
3. Separar tres tipos de resultado: bloqueos (no se crea), confirmaciones (se crea solo si un humano confirma) y derivados (valores completados desde maestros, que se informan).
4. Marcar `retroactiva = true` cuando la factura es anterior a la solicitud.
5. Construir la OC con el esquema SAP y la fuente de cada campo.
6. Calcular la evidencia de aprobación con un hash que permita detectar alteraciones.

**Restricciones:**

- Las reglas no pueden depender del modelo de lenguaje: deben ser deterministas y verificables sin clave (S2, auditoría).
- El dominio no hace IO, para poder reutilizarlo en el agente, en `demo.ts` y en el módulo empaquetado (S4, equipo Perxia).
- Texto breve de SAP limitado a 40 caracteres (PRD 7.4).
- Tolerancias del PRD: 2 % entre cotización y solicitud (RC5) y ±1 unidad monetaria en la aritmética (RC10).

## 2. Historias de usuario

### HU-01.1 · Normalizar el paquete de compra (PRD HU-1)

**Como** analista administrativa **quiero** que la solicitud, la cotización, la aprobación y la factura queden en un formato único y comparable **para** no tener que leer cada documento con sus formatos propios.

```gherkin
Escenario: NIT con puntos y dígito de verificación
  Dado la cotización de sol-001 con "NIT: 900.555.111-2"
  Cuando se normaliza el paquete
  Entonces el NIT de la cotización queda como "900555111"
  Y coincide con el NIT del maestro de TecnoSuministros S.A.S.

Escenario: monto en formato colombiano
  Dado la cotización de sol-004 con "TOTAL (IVA incluido): COP 26.500.000"
  Cuando se normaliza el paquete
  Entonces cotizacion.total es 26500000 y la moneda es COP

Escenario: validez expresada en días
  Dado la cotización de sol-001 con fecha 2026-08-18 y "Validez de la oferta: 30 días"
  Cuando se normaliza el paquete
  Entonces validez_hasta es 2026-09-17

Escenario: factura con numeración y fecha de emisión
  Dado la factura de sol-005 "FACTURA ELECTRÓNICA DE VENTA No. FC-88231" con "Fecha de emisión: 2026-08-10"
  Cuando se normaliza el paquete
  Entonces factura.numero es "FC-88231", factura.fecha es "2026-08-10" y factura.total es 3200000

Escenario: aprobación negada
  Dado un correo de aprobación cuyo cuerpo dice "No está aprobado"
  Cuando se normaliza el paquete
  Entonces aprobacion.aprobado es false
```

- **Reglas de negocio:** un adjunto ilegible no pasa en silencio: se reporta en `faltantes` y se trata como ausente; los montos aceptan formato colombiano y anglosajón; la fecha de aprobación se toma en la hora local del correo.
- **Prioridad:** P0 · **Puntos:** 5 · **Estado:** Hecho.

### HU-01.2 · Validar proveedor, aprobación, tope y subárea (RC1–RC4, bloqueos)

**Como** contabilidad/auditoría **quiero** que una OC no se pueda crear si el proveedor no existe o está inactivo, si el aprobador no tiene autoridad o tope, o si la subárea no pertenece al centro **para** que el control deje de ser mental y no se corrija en el cierre.

```gherkin
Escenario: proveedor inexistente (sol-002)
  Dado la solicitud SOL-2026-002 con proveedor "Soluciones Digitales del Norte S.A.S." y NIT 901999000
  Cuando se valida contra el maestro de proveedores
  Entonces hay un bloqueo RC1 "Proveedor no registrado"
  Y la acción sugerida es pedir a Datos Maestros/Compras la creación del proveedor en SAP

Escenario: aprobador de otro centro de costo (sol-003)
  Dado la solicitud SOL-2026-003 del centro CC-2020 aprobada por fvargas@periferia-ficticia.com
  Y fvargas es aprobador de CC-3030, no de CC-2020
  Cuando se valida la aprobación
  Entonces hay un bloqueo RC2 "Aprobador sin autoridad en el centro"
  Y la acción sugerida lista a rtorres@periferia-ficticia.com como aprobadora válida de CC-2020

Escenario: aviso de tope insuficiente sin aprobador válido (sol-003)
  Dado que el valor de SOL-2026-003 es 74.000.000
  Y el único aprobador de CC-2020 tiene tope de 30.000.000
  Cuando se evalúa RC3
  Entonces RC3 queda "no aplica" con el aviso de que ningún aprobador de CC-2020 tiene tope y requerirá escalamiento

Escenario: todo en regla (sol-001)
  Dado la solicitud SOL-2026-001 de TecnoSuministros S.A.S. por 11.400.000 en CC-1010 / Infraestructura
  Y aprobada por mlopez@periferia-ficticia.com con tope de 50.000.000
  Cuando se valida
  Entonces RC1, RC2, RC3 y RC4 quedan en "ok" y la solicitud es apta
```

- **Reglas de negocio:** RC1 busca por NIT de la solicitud; si no hay, por NIT de la cotización; si tampoco hay, por nombre sin tildes ni sufijos societarios. RC2 descarta negaciones de "Aprobado". RC3 solo se evalúa con un aprobador válido. RC4 también bloquea si el centro no existe.
- **Prioridad:** P0 · **Puntos:** 5 · **Estado:** Hecho.

### HU-01.3 · Convertir dudas en confirmaciones (RC5, RC6, RC8, RC9)

**Como** dirección administrativa y financiera **quiero** que las diferencias de valor, el IVA no informado, las facturas anteriores a la solicitud y las aprobaciones anteriores a la solicitud se conviertan en una pregunta explícita **para** que nadie cree una OC dudosa sin decidirlo, y para medir las retroactivas.

```gherkin
Escenario: cotización fuera de tolerancia (sol-004)
  Dado la solicitud SOL-2026-004 por 25.000.000 y la cotización CA-2026-0310 por 26.500.000
  Cuando se compara la cotización con la solicitud
  Entonces hay una confirmación RC5 con los dos valores lado a lado y una diferencia de 6,0 %
  Y la solicitud sigue apta

Escenario: IVA no informado (sol-006)
  Dado la solicitud SOL-2026-006 sin indicador de IVA del proveedor TecnoSuministros S.A.S.
  Cuando se valida
  Entonces se propone C1 (IVA 19 %) desde el maestro del proveedor
  Y hay una confirmación RC6 para aceptar o corregir el código

Escenario: OC retroactiva (sol-005)
  Dado la factura FC-88231 del 2026-08-10 y la solicitud SOL-2026-005 del 2026-08-27
  Cuando se valida
  Entonces retroactiva es true
  Y hay una confirmación RC8 "OC retroactiva" con ambas fechas

Escenario: aprobación del mismo día (sol-004)
  Dado la solicitud del 2026-08-26 y la aprobación del 2026-08-26T18:45:00-05:00
  Cuando se evalúa RC9
  Entonces RC9 queda en "ok"
```

- **Reglas de negocio:** sin cotización o con cotización ilegible también se pide confirmación (RC5). Si la moneda de la cotización difiere de la solicitud, se pide confirmación. Un indicador de IVA que no existe en el maestro se trata como ausente.
- **Prioridad:** P0 · **Puntos:** 3 · **Estado:** Hecho.

### HU-01.4 · Completar datos desde maestros y validar la aritmética (RC7, RC10 y derivados de forma)

**Como** analista administrativa **quiero** que las condiciones de pago, la unidad y el texto breve se completen solos, y que se detecte un total mal calculado **para** no digitar lo que ya está en los maestros ni enviar a SAP una OC que no cuadra.

```gherkin
Escenario: condiciones de pago no informadas (sol-006)
  Dado la solicitud SOL-2026-006 sin condiciones de pago
  Cuando se valida
  Entonces se deriva Z030 (30 días fecha factura) desde el maestro del proveedor
  Y RC7 queda en "derivado", sin pedir confirmación

Escenario: unidad inferida de la descripción (sol-004)
  Dado la descripción "Bolsa de 100 horas de arquitectura de nube para migración"
  Cuando se derivan los datos de forma
  Entonces la unidad es "H"

Escenario: texto breve SAP de 40 caracteres (sol-001)
  Dado la descripción "Renovación licencias antivirus corporativo 120 puestos, vigencia 12 meses" (72 caracteres)
  Cuando se deriva el texto breve
  Entonces la posición queda con "Renovación licencias antivirus"
  Y el texto completo queda en la trazabilidad

Escenario: aritmética que no cuadra
  Dado una solicitud con cantidad 5, valor unitario 1.700.000 y total 8.000.000
  Cuando se evalúa RC10
  Entonces hay un bloqueo RC10 con "Calculado 8.500.000" frente a "Solicitud 8.000.000"
```

- **Reglas de negocio:** unidad `H` si la descripción habla de horas, `MES` si es mensual, `UN` en otro caso; recorte del texto breve en límite de palabra; tolerancia aritmética de 1 unidad monetaria.
- **Prioridad:** P0 · **Puntos:** 3 · **Estado:** Hecho.

### HU-01.5 · Construir la OC con trazabilidad y evidencia (PRD HU-3, HU-4)

**Como** auditoría **quiero** ver la OC exactamente como quedaría en SAP, con la fuente de cada campo y el hash del correo de aprobación **para** sustentar el gasto y detectar cualquier alteración.

```gherkin
Escenario: OC válida contra el esquema SAP (sol-001)
  Dado el paquete apto de sol-001
  Cuando se construye la orden
  Entonces cumple el esquema zod OrdenCompra: sociedad 1000, organización de compras 1000, proveedor 100234, condiciones Z030
  Y la posición 10 tiene cantidad 120, unidad UN, precio 95.000, CC-1010 / Infraestructura e indicador C1

Escenario: cada campo con su fuente
  Dado la orden de sol-006
  Cuando se consulta la trazabilidad
  Entonces "proveedor.codigo_sap" viene de "maestro.proveedores"
  Y "condiciones_pago" e "indicador_iva" vienen de "derivado" con el motivo

Escenario: hash de la evidencia
  Dado el correo de aprobación de sol-001
  Cuando se construye la evidencia
  Entonces el contenido incluye De, Para, CC, Fecha, Asunto y cuerpo
  Y aprobador.evidencia_sha256 es el sha256 de ese contenido (64 caracteres hexadecimales)

Escenario: no se construye con bloqueos (sol-002)
  Dado el paquete de sol-002 con bloqueo RC1
  Cuando se intenta construir la orden
  Entonces se devuelve un error legible y no una orden
```

- **Reglas de negocio:** las excepciones de la OC son las confirmaciones de la validación, con `confirmado_por` vacío hasta que un humano confirme. Los precios se conservan con IVA incluido (supuesto documentado).
- **Prioridad:** P0 · **Puntos:** 5 · **Estado:** Hecho.

## 3. Solución implementada

Todo el dominio vive en `packages/domain` (paquete `@oc/domain`), sin IO: no usa `fs`, `path`, HTTP ni el SDK del modelo. `bun run boundaries` lo verifica en local, en los hooks y en la CI.

| Archivo | Responsabilidad |
|---|---|
| `packages/domain/src/esquemas.ts` | Esquemas zod: `Solicitud`, `Paquete` (7.2, con `faltantes`), maestros, `Hallazgo` (con `comparacion` para mostrar dos valores), `Derivado`, `Validacion` (con `controles` RC1–RC10 y estado), `OrdenCompra` (7.4, texto breve `max(40)`, sha256 por regex) |
| `packages/domain/src/normalizar.ts` | `normalizarNit` (quita puntos y dígito de verificación), `normalizarNombre` (sin tildes ni sufijos societarios), `parsearMonto` (formato colombiano y anglosajón), `soloFecha`, `sumarDias`, `formatoMoneda`, `recortarPalabras` |
| `packages/domain/src/documentos.ts` | `parsearCotizacion` (número, fecha, proveedor, NIT, línea TOTAL sin confundir con Subtotal, validez en días o fecha), `parsearFactura` (número "No. FC-88231", fecha de emisión, total), `contieneAprobacion` (descarta negaciones) |
| `packages/domain/src/reglas.ts` | `validarPaquete`: una función por regla (`rc1Proveedor` … `rc10Aritmetica`) que escribe en un acta; cada regla aporta exactamente un control. Constantes `TOLERANCIA_COTIZACION = 0.02`, `TOLERANCIA_ARITMETICA = 1`, `MAX_DESCRIPCION_SAP = 40` |
| `packages/domain/src/orden.ts` | `construirOrden` (valida contra `OrdenCompra` y arma la trazabilidad campo a campo), `huellaOrden` y `diferenciasOrden` (para detectar un payload alterado) |
| `packages/domain/src/evidencia.ts` | `construirEvidencia`: texto canónico con encabezados y cuerpo, `sha256` del contenido y archivo con el hash al pie |

**Cómo cumple cada criterio:**

- HU-01.1: los parsers convierten los formatos reales de los fixtures. Un documento ilegible devuelve `{ error }` y el lector del paquete lo agrega a `faltantes`.
- HU-01.2 y HU-01.3: cada regla produce un `Hallazgo` con título, detalle, acción sugerida y, cuando aplica, `comparacion` (por ejemplo Solicitud 25.000.000 frente a Cotización 26.500.000 con diferencia 6,0 %). `apta = bloqueos.length === 0`.
- HU-01.4: RC7 y los derivados de forma escriben en `derivados` con `valor`, `fuente` y `motivo`. RC6 deriva y además confirma.
- HU-01.5: `construirOrden` toma los derivados de la validación, valida con zod y devuelve la `Trazabilidad` con fuentes `solicitud`, `cotizacion`, `correo`, `aprobacion`, `maestro.proveedores`, `derivado` o `constante`.

## 4. Verificación

- **`bun run demo.ts`** (sin modelo, determinista) sobre los 6 casos:

| Caso | apta | Bloqueos | Confirmaciones | Retroactiva |
|---|---|---|---|---|
| sol-001 | true | ninguno | ninguno | false |
| sol-002 | false | RC1 Proveedor no registrado | ninguno | false |
| sol-003 | false | RC2 Aprobador sin autoridad en el centro | ninguno | false |
| sol-004 | true | ninguno | RC5 La cotización no coincide con la solicitud | false |
| sol-005 | true | ninguno | RC8 OC retroactiva | true |
| sol-006 | true | ninguno | RC6 IVA no informado | false |

- **Revisión de las órdenes generadas:** `out/sol-001/orden.json` con descripción "Renovación licencias antivirus" y unidad UN; `out/sol-004/orden.json` con unidad H y excepción RC5 "Solicitud $25.000.000 vs cotización $26.500.000 (diferencia 6,0 %, tolerancia 2 %)"; `out/sol-006/orden.json` con condiciones Z030 e indicador C1 derivados y `cotizacion_ref` COT-TS-2026-0468.
- **Evidencia:** `aprobacion.txt` termina con la línea del sha256 del contenido; el PDF se generó válido (`%PDF-1.7`).
- **CI:** el job de GitHub Actions corre `bun run demo.ts`, el typecheck y `bun run boundaries` en cada push; quedó en verde.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Reglas como funciones puras en un paquete propio | Reglas dentro de las herramientas o del prompt | Se pueden probar sin modelo y reutilizar en el agente, en `demo.ts` y en el módulo; un prompt no garantiza determinismo |
| Un control por regla con estado explícito | Devolver solo bloqueos y confirmaciones | La analista y la demo del PRD piden ver "qué validaciones pasó y cuáles no"; el lienzo muestra la lista RC1–RC10 |
| Documento ilegible = faltante + confirmación | Ignorar el documento si no se puede leer | Una cotización ilegible no puede pasar RC5 en silencio |
| Respaldo por NIT de la cotización antes que por nombre (sol-006) | Ir directo al nombre libre cuando la solicitud no trae NIT | El NIT de la cotización es más confiable que un nombre escrito a mano |
| Precios con IVA incluido en el payload simulado | Convertir a neto en el dominio | El PRD no define el tratamiento; la conversión a neto queda en el adaptador SAP real (documentado en SOLUCION.md) |
| Texto breve recortado en límite de palabra | Cortar exactamente en el carácter 40 | Evita palabras partidas en SAP; el texto completo queda en la trazabilidad |

## 6. Pendientes para producción

- Leer `.xlsx`, `.pdf` y `.eml` reales (OCR para escaneados) con la misma validación de esquema.
- Consultar los maestros en línea desde SAP en vez de los archivos de fixtures.
- Convertir el precio a neto con la tasa del indicador de IVA y mapear unidades a las de SAP (UN→EA, H→H, MES→MON).
- Pruebas unitarias por regla con los 6 fixtures como casos dorados.
- Validar el remitente de la aprobación (SPF/DKIM) o mover la aprobación a un flujo firmado.
