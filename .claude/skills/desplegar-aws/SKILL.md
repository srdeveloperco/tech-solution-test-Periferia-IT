---
name: desplegar-aws
description: Desplegar, verificar o eliminar la infraestructura AWS del agente (Lightsail, Cognito, rol de GitHub Actions). Úsala cuando pregunten cómo desplegar, por qué falla el deploy, cómo obtener la URL o cómo borrar todo sin tocar otros recursos de la cuenta.
---

# Despliegue en AWS (cuenta de producción compartida)

La guía completa, comando a comando, está en `INFRA.md`. Scripts: `infra/powershell/*.ps1` (opción A, PowerShell local con perfil `juan`, recomendada) e `infra/cloudshell/*.sh` (opción B, CloudShell). Región por defecto `us-east-2`. Inventario real en `infra/.generated/estado.json`.

## Reglas de seguridad (no negociables)
- La cuenta es de **producción** con otros productos. Solo se crean y borran recursos con prefijo `perxia-reto03` y tag `proyecto=perxia-reto03`.
- **Ningún agente ejecuta comandos de AWS que creen o borren recursos.** El humano los corre (PowerShell local o CloudShell). El hook `guard-bash` bloquea los borrados en AWS y la ejecución del script de borrado.
- El proveedor OIDC de GitHub puede existir y usarlo producción: se reutiliza y **nunca** se borra salvo que tenga el tag `proyecto=perxia-reto03` (lo creamos nosotros).
- Las claves (ANTHROPIC_API_KEY) viven en secretos de GitHub y en la configuración del despliegue de Lightsail; nunca en el repo, en logs ni en el chat.

## Qué puedes hacer como agente
- Explicar pasos de `INFRA.md`, revisar errores pegados por el usuario y proponer correcciones.
- Editar `infra/**`, `Dockerfile` y `.github/workflows/**`, validando con `jq`, `bash -n` y `docker build`.
- Leer estado con comandos `aws ... get-*`/`list-*`/`describe-*` si el usuario lo pide y hay credenciales (nunca crear ni borrar).

## Flujo resumido
1. `01-lightsail` → `02-cognito` (grupo `admin` + usuario evaluador) → `03-oidc-rol` (INFRA.md Opción A, A1–A4).
2. GitHub: environment `aws-demo`, variables y secretos (INFRA.md §7 o `05-github.ps1` con `gh`).
3. Push a la rama o re-run de **Deploy** → URL en el resumen del job; prueba de humo con 401 sin token y login (INFRA.md §8).
4. Acceso para evaluadores: INFRA.md §8.1.
5. Borrado: `99-eliminar` (simulación por defecto; lee `estado.json` y verifica nombre/tag), siempre en manos del humano.

## Autenticación
- El link siempre exige login (Cognito). Sin `COGNITO_*` el backend falla cerrado.
- Grupo `admin` ve chat + observatorio; sin grupo, solo chat (claim `cognito:groups`).
