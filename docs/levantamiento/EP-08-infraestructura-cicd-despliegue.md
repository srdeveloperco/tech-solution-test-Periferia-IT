# EP-08 · Infraestructura, CI/CD y despliegue

| Campo | Valor |
|---|---|
| Épica | EP-08 Infraestructura, CI/CD y despliegue |
| Objetivo de negocio | Publicar el agente en un link estable y seguro dentro de una cuenta AWS de producción, sin tocar otros productos, con despliegue automático y un borrado exacto al terminar |
| Estado | Hecho |
| Prioridad | Alta (P0: el link es entregable obligatorio) |
| Estimación | 21 puntos |
| Sesiones de origen | S4, S5, S6 |
| Trazabilidad PRD | §9.3 (link público activo en la defensa), §8 Arranque, Seguridad y Costo, §9.5 (sin `.env` en el repositorio) |

## 1. Levantamiento

**Sesiones de origen.** S4 (arquitectura, seguridad y nube), S5 (costos), S6 (revisión y aceptación).

**Hallazgos.**

- Líder de TI/Seguridad (S4): "La cuenta es de producción. Lo que se cree tiene que tener nombre y etiqueta propios, y al final se borra eso y nada más."
- Líder de TI/Seguridad (S4): "No quiero llaves de AWS guardadas en GitHub ni pegadas en un chat. Si hay despliegue automático, que sea con credenciales temporales."
- Líder de TI/Seguridad (S4): "Ejecuto los comandos yo, desde mi PowerShell con mi perfil, o en CloudShell. Dame el paso a paso."
- Equipo Perxia (S4): "El agente encadena cinco herramientas; un turno puede pasar de 30 segundos."
- Dirección administrativa y financiera (S5): "Es desechable: que cueste centavos mientras dure la prueba."
- Evaluadores (S6): "El link debe estar activo durante la defensa."

**Necesidades.** Un servicio HTTPS público con estado local (archivos y SQLite), pocos recursos, región aislada de producción, despliegue automático desde GitHub sin llaves, inventario verificable y borrado guiado.

**Restricciones.** El agente escribe en `out/` (SAP simulado, control, evidencias, base SQLite), las sesiones viven en el proceso y los turnos pueden tardar más de 30 s. App Runner no acepta clientes nuevos desde abril de 2026. Ningún agente de IA ejecuta borrados en AWS.

## 2. Historias de usuario

### HU-08.1 · Link público en un servicio de contenedor único

**Como** evaluador **quiero** un link HTTPS estable **para** probar el agente durante la defensa.

```gherkin
Escenario: Servicio desplegado
  Dado el servicio Lightsail perxia-reto03-oc-agent en us-east-2 (micro, 1 nodo)
  Cuando termina el despliegue
  Entonces https://perxia-reto03-oc-agent.6xr8rnrbx4a0e.us-east-2.cs.amazonlightsail.com/ responde el front
  Y GET /api/health devuelve el proveedor anthropic y los modelos por agente

Escenario: Turnos largos
  Dado un turno con 5 herramientas que tarda más de 30 segundos
  Entonces el stream SSE no se corta por timeout de pasarela
```

- Reglas: un solo nodo para conservar estado en memoria y en `out/`; HTTPS incluido por Lightsail.
- Prioridad: P0 · Puntos: 3 · Estado: Hecho.

### HU-08.2 · Aislamiento e inventario exacto en la cuenta de producción

**Como** líder de TI/Seguridad **quiero** saber exactamente qué se crea, con nombre, región y etiqueta **para** auditarlo y borrarlo sin afectar otros productos.

```gherkin
Escenario: Inventario registrado
  Dado que ejecuté 01, 02 y 03 con el perfil juan en us-east-2
  Entonces infra/.generated/estado.json registra cuenta, región, servicio Lightsail, User Pool, App Client, rol y si el OIDC fue creado o reutilizado

Escenario: Proveedor OIDC preexistente
  Dado que la cuenta ya tenía token.actions.githubusercontent.com
  Cuando corre 03-oidc-rol.ps1
  Entonces lo reutiliza sin modificarlo y registra OIDC_CREADO=no

Escenario: Confirmación de cuenta
  Dado una ventana nueva de PowerShell
  Cuando corro cualquier script
  Entonces muestra perfil, cuenta, usuario y región y pide escribir "si" antes de cambiar nada
```

- Reglas: prefijo `perxia-reto03`, tags `proyecto=perxia-reto03` y `desechable=true`, región dedicada `us-east-2`. Recursos: Lightsail container service, Cognito User Pool (con App Client, grupo y usuario), rol IAM con política inline, y el proveedor OIDC solo si no existía. Sin VPC, ECR, S3, Lambda ni bases gestionadas.
- Prioridad: P0 · Puntos: 3 · Estado: Hecho.

### HU-08.3 · Comandos para PowerShell local y CloudShell

**Como** líder de TI/Seguridad **quiero** scripts listos para mi PowerShell con mi perfil y una alternativa en CloudShell **para** ejecutar yo mismo cada paso.

```gherkin
Escenario: PowerShell 5.1 o 7
  Dado Windows con AWS CLI v2 y el perfil juan
  Cuando corro .\infra\powershell\01-lightsail.ps1
  Entonces cada llamada usa --profile juan y --region explícitos, verifica el código de salida y escribe JSON en UTF-8 sin BOM

Escenario: Alternativa CloudShell
  Dado una sesión de AWS CloudShell
  Cuando sigo infra/cloudshell/ o la Opción B de INFRA.md
  Entonces obtengo el mismo resultado con bash

Escenario: Plan B sin GitHub Actions
  Dado Docker local y lightsailctl
  Cuando corro .\infra\powershell\04-deploy-local.ps1 con ANTHROPIC_API_KEY en mi terminal
  Entonces se construye, sube y despliega la imagen sin imprimir la clave
```

- Prioridad: P0 · Puntos: 3 · Estado: Hecho.

### HU-08.4 · Despliegue continuo sin llaves (OIDC)

**Como** equipo Perxia **quiero** que cada push a la rama o a `main` despliegue solo **para** no hacer pasos manuales repetidos.

```gherkin
Escenario: Despliegue completo
  Dado las variables del repositorio y los secretos del environment aws-demo
  Cuando hago push
  Entonces el workflow Deploy corre la CI, asume el rol perxia-reto03-gha-deploy por OIDC, instala lightsailctl, construye y sube la imagen, crea el deployment y espera ACTIVE

Escenario: Prueba de humo
  Dado que el deployment quedó ACTIVE
  Entonces el workflow verifica /api/health 200, /api/casos sin token 401 y login del evaluador 200
  Y publica la URL en el resumen

Escenario: Infraestructura aún no creada
  Dado que no existe la variable AWS_ROLE_ARN
  Entonces el job de despliegue se salta y la CI sigue en verde
```

- Reglas: la política inline solo permite acciones de Lightsail en `us-east-2`; la trust policy solo acepta este repositorio con el environment `aws-demo`. El despliegue falla cerrado si faltan las variables de Cognito o la clave del modelo.
- Prioridad: P0 · Puntos: 5 · Estado: Hecho.

### HU-08.5 · Integración continua con verificación completa

**Como** equipo Perxia **quiero** que cada cambio pase lint, límites de capas, tipos, demo y build **para** no publicar código roto.

```gherkin
Escenario: CI en push
  Dado un push a la rama
  Entonces corren Biome, bun run boundaries, typecheck, tests si existen, demo.ts (6 casos), modulo:check y build del front

Escenario: Módulo desincronizado
  Dado que alguien edita el prompt sin regenerar modulo/
  Entonces modulo:check falla y bloquea el despliegue
```

- Prioridad: P1 · Puntos: 2 · Estado: Hecho.

### HU-08.6 · Borrado seguro y verificable

**Como** líder de TI/Seguridad **quiero** un borrado que simule primero y valide nombre y etiqueta **para** eliminar solo lo del reto.

```gherkin
Escenario: Simulación
  Dado el estado registrado
  Cuando corro .\infra\powershell\99-eliminar.ps1
  Entonces lista lo que borraría sin cambiar nada

Escenario: Borrado real
  Cuando corro .\infra\powershell\99-eliminar.ps1 -Ejecutar y escribo "perxia-reto03"
  Entonces borra el servicio Lightsail, el User Pool y el rol (primero su política inline)
  Y conserva el proveedor OIDC porque ya existía antes del reto

Escenario: Estado de otra cuenta
  Dado un estado.json de otra cuenta o región
  Entonces el script aborta sin borrar nada
```

- Prioridad: P0 · Puntos: 2 · Estado: Hecho (a ejecutar al cerrar la prueba).

### HU-08.7 · Imagen de contenedor segura y reproducible

**Como** líder de TI/Seguridad **quiero** una imagen mínima, sin root y sin secretos **para** reducir la superficie de ataque.

```gherkin
Escenario: Imagen multi-etapa
  Dado el Dockerfile
  Entonces instala dependencias con --frozen-lockfile, compila el front y copia solo lo necesario a oven/bun:1.4.4-slim
  Y el proceso corre como usuario bun con out/ escribible

Escenario: Fuentes legibles sin root
  Dado archivos del contexto con permisos 600
  Cuando arranca el contenedor
  Entonces el usuario bun puede leer apps, packages y fixtures
```

- Prioridad: P1 · Puntos: 3 · Estado: Hecho.

## 3. Solución implementada

| Pieza | Ruta |
|---|---|
| Guía comando a comando (Opción A PowerShell, Opción B CloudShell), inventario, acceso para evaluadores, borrado | `INFRA.md` |
| Scripts PowerShell (perfil `juan`, us-east-2) | `infra/powershell/00-variables.ps1` … `05-github.ps1`, `90-estado.ps1`, `99-eliminar.ps1` |
| Scripts CloudShell | `infra/cloudshell/00-variables.sh` … `04-deploy-manual.sh`, `90-estado.sh`, `99-eliminar.sh` |
| Trust policy y política de despliegue | `infra/iam/trust-policy.template.json`, `infra/iam/deploy-policy.template.json` |
| Contenedor y endpoint de Lightsail | `infra/lightsail/containers.template.json`, `infra/lightsail/endpoint.json` |
| Imagen | `Dockerfile`, `.dockerignore` |
| CI reutilizable | `.github/workflows/ci.yml` |
| CD (OIDC → lightsailctl → deployment → prueba de humo) | `.github/workflows/deploy.yml` |

**Por qué Lightsail Container Service.** Un solo recurso con HTTPS incluido, estado local en un nodo y costo de unos USD 10 al mes prorrateado por hora.

## 4. Verificación

- Imagen construida y probada como contenedor: health, 401 sin token, login local, chat de sol-001, sol-002 y sol-004 y front servido desde la misma imagen.
- Scripts PowerShell revisados línea a línea y ejecutados por el usuario en su máquina: 01 (Lightsail READY), 02 (Cognito con login OK), 03 (rol creado, OIDC reutilizado).
- Despliegue por GitHub Actions exitoso: deployment ACTIVE y prueba de humo con `/api/health` 200 (anthropic, Haiku 5.5 y Sonnet 5.5), `/api/casos` 401 y login 200.
- Prueba en vivo del usuario en el link con los modelos reales.

**Incidentes y corrección.**

| Incidente | Causa | Corrección |
|---|---|---|
| El contenedor no leía `solicitud.json` | Los fixtures locales tenían permisos 600 y el proceso corre sin root | `chmod -R a+rX` de apps, packages y fixtures en la etapa final del Dockerfile |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | GitHub emite el `sub` con IDs inmutables (`repo:srdeveloperco@123211571/tech-solution-test-Periferia-IT@1434693415:environment:aws-demo`) y la trust policy esperaba el formato clásico | Se agregó un paso que imprime solo los claims públicos del token, se identificó el `sub` real y se añadió a la trust policy (sigue limitada al repo y al environment) |

**Advertencia operativa.** Cada push a `main` o a la rama redespliega y reinicia los datos del contenedor (historial, OC y observatorio). Los cambios solo de documentación se suben con `[skip ci]`.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Lightsail Container Service | App Runner | Cerrado a clientes nuevos desde abril de 2026 |
| Lightsail Container Service | S3 + API Gateway + Lambda + DynamoDB | API Gateway corta a unos 29 s; Lambda no comparte archivos ni sesiones entre instancias y rompe la idempotencia; muchos recursos e IAM |
| Lightsail Container Service | ECS Fargate o ECS Express | Crea VPC, balanceador y roles: demasiados recursos en una cuenta de producción |
| Rol IAM por OIDC | Llaves de un usuario IAM en GitHub | Credenciales temporales; nada de larga duración guardado |
| Reutilizar y conservar el OIDC existente | Crear uno nuevo o borrarlo al final | Lo usa producción; borrarlo rompería sus despliegues |
| Ejecución humana de AWS desde su PowerShell | Pasar credenciales de administrador a la sesión de IA | Las credenciales no salen de la máquina del dueño de la cuenta |
| Región dedicada us-east-2 | Región de producción | La política `Resource: "*"` acotada por región no alcanza recursos de producción |

## 6. Pendientes para producción

- Persistencia gestionada (RDS o DynamoDB) y evidencias en S3 con versionado y bloqueo de objetos, para no perder datos al redesplegar.
- Más de un nodo con estado externo y numeración de OC transaccional.
- Dominio propio, WAF y alarmas (CloudWatch) de salud y costo.
- Restringir la política de despliegue por tag (`aws:ResourceTag/proyecto`) cuando se valide con Lightsail.
- Ambientes separados (desarrollo, pruebas, producción) con aprobación manual en el environment de producción.
- Actualizar acciones a versiones con Node 24 (aviso de deprecación de Node 20).
