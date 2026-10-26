# Levantamiento de requerimientos y backlog

Este documento organiza el trabajo del Reto 03 como lo haría un equipo de producto: sesiones de levantamiento con los actores del proceso, épicas, historias de usuario con criterios de aceptación y la solución implementada para cada una.

> **Nota:** el levantamiento es una reconstrucción. Se hizo a partir del PRD 2.0 (`docs/PRD.md`), los fixtures entregados por Periferia y las decisiones tomadas durante la construcción. Las citas de cada sesión representan las necesidades de cada rol tal como las describe el PRD, no entrevistas reales.

## 1. Sesiones de levantamiento (26/10/2026)

| Código | Sesión | Participantes | Objetivo | Salidas |
|---|---|---|---|---|
| S1 | Descubrimiento del proceso actual | Analista administrativa, Contabilidad | Entender cómo llega el paquete y cómo se digita la OC hoy | Flujo as-is, datos que se digitan, dolores (tiempo, errores, OC retroactivas) |
| S2 | Reglas de control y excepciones | Contabilidad/Auditoría, Dirección administrativa y financiera | Convertir los controles mentales en reglas explícitas | RC1–RC10 con su tipo (bloqueo, confirmación o derivado) y la acción ante cada excepción |
| S3 | Experiencia de usuario | Analista administrativa | Definir cómo conversa con el agente y cómo confirma | Chat con herramientas visibles, confirmación resaltada, lienzo con la OC |
| S4 | Arquitectura, seguridad y nube | Líder de TI/Seguridad, Equipo Perxia | Restricciones técnicas y de la cuenta AWS de producción | Monolito modular, login obligatorio, despliegue aislado y desechable, borrado seguro |
| S5 | Costos y observabilidad de IA | Dirección, Equipo Perxia | Controlar el gasto y poder mejorar los prompts | Presupuesto de USD 10, modelos por tarea, trazas de cada llamada |
| S6 | Revisión y aceptación | Todos | Validar la solución contra los objetivos O1–O4 | Demo de los 6 casos, aceptación y pendientes para producción |

## 2. Actores

| Actor | Necesidad principal |
|---|---|
| Analista administrativa | Dejar de digitar; ver la OC antes de crearla; confirmar solo lo dudoso |
| Contabilidad/Auditoría | Que ninguna OC inválida llegue a SAP y que todo quede trazable (`control.csv`, evidencia con sha256) |
| Dirección administrativa y financiera | Medir las OC retroactivas y controlar el costo de la IA |
| Líder de TI/Seguridad | No poner en riesgo la cuenta de producción: recursos aislados, sin llaves guardadas y borrables |
| Equipo Perxia | Una base mantenible: capas claras, herramientas tipadas y desarrollo asistido por IA con reglas |
| Solicitantes y líderes aprobadores | Siguen usando el correo; el agente verifica, no les pide nada nuevo |

## 3. Mapa de épicas

| Épica | Nombre | Historias | Puntos | Estado |
|---|---|---|---|---|
| [EP-01](EP-01-dominio-reglas-control.md) | Dominio y reglas de control (RC1–RC10) | 5 | 21 | Hecho |
| [EP-02](EP-02-herramientas-sap-demo.md) | Herramientas del agente, SAP simulado y demo | 6 | 21 | Hecho |
| [EP-03](EP-03-orquestacion-multiagente-y-voz.md) | Orquestación multi-agente y conversación humana | 6 | 21 | Hecho |
| [EP-04](EP-04-interfaz-conversacional-lienzo.md) | Interfaz conversacional con lienzo en vivo | 7 | 21 | Hecho |
| [EP-05](EP-05-autenticacion-roles.md) | Autenticación y roles | 6 | 8 | Hecho |
| [EP-06](EP-06-observabilidad-costos-presupuesto.md) | Observabilidad, costos y presupuesto de IA | 5 | 13 | Hecho |
| [EP-07](EP-07-persistencia-modelo-datos.md) | Persistencia y modelo de datos | 5 | 8 | Hecho |
| [EP-08](EP-08-infraestructura-cicd-despliegue.md) | Infraestructura, CI/CD y despliegue | 7 | 21 | Hecho |
| [EP-09](EP-09-harness-desarrollo-ia.md) | Harness de desarrollo asistido por IA | 6 | 8 | Hecho |
| [EP-10](EP-10-modulo-y-documentacion.md) | Módulo reutilizable (bonus) y documentación técnica | 5 | 13 | Hecho |

## 4. Trazabilidad con el PRD

| Requisito del PRD | Dónde se resuelve |
|---|---|
| HU-1 Leer el paquete | EP-01 (normalización) y EP-02 (`oc_leer_paquete`) |
| HU-2 Validar contra maestros (RC1–RC10) | EP-01 (reglas puras) y EP-02 (`oc_validar`) |
| HU-3 Construir el payload con trazabilidad | EP-01 (construcción) y EP-02 (`oc_construir_payload`) |
| HU-4 Evidencia de aprobación (txt + pdf) | EP-02 (`oc_generar_evidencia`) |
| HU-5 Crear la OC, idempotencia y `control.csv` | EP-02 (`oc_crear`, SAP simulado) |
| HU-6 Manejo de errores | EP-02 (errores legibles) y EP-03 (CA5 en el chat) |
| O1 sol-001 sin intervención | EP-02 y EP-03 |
| O2 sol-002 y sol-003 bloqueadas | EP-01 (RC1, RC2) |
| O3 sol-004 y sol-006 piden confirmación | EP-01 (RC5, RC6) y EP-03 (compuerta) |
| O4 sol-005 retroactiva medida | EP-01 (RC8) y EP-02 (`control.csv`) |
| CA1–CA5 Reglas del ciclo del agente | EP-03 |
| §6.1 Front de chat | EP-04 |
| §8 No funcionales (seguridad, costo, robustez) | EP-05, EP-06, EP-07 |
| §9.3 Link público | EP-08 |
| §9.4 Bonus módulo reutilizable | EP-10 |
| §9.1 `SOLUCION.md` | EP-10 |

## 5. Definición de terminado

- `bun run verify` en verde: lint, límites de capas, tipos, `demo.ts` y módulo sincronizado.
- Criterios de aceptación de la historia comprobados con los casos sol-001 a sol-006.
- Documentación actualizada si cambió un contrato (README, `SOLUCION.md`, `INFRA.md`).
- Para lo desplegado: la prueba de humo de GitHub Actions pasa (salud, 401 sin token, login del evaluador).

## 6. Resultado

| Entregable | Estado |
|---|---|
| Link público con login | https://perxia-reto03-oc-agent.6xr8rnrbx4a0e.us-east-2.cs.amazonlightsail.com/ |
| `demo.ts` sin modelo | Los 6 casos, idempotencia de sol-001 y confirmación de sol-004 |
| CI/CD | GitHub Actions: CI en cada push y despliegue con OIDC y prueba de humo |
| `SOLUCION.md` | 12 secciones |
| Bonus `modulo/` | Generado desde las mismas fuentes y verificado en CI |
