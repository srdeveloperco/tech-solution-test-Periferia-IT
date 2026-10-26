# EP-05 · Autenticación y roles

| Campo | Valor |
|---|---|
| Épica | EP-05 Autenticación y roles |
| Objetivo de negocio | Que solo personas autorizadas usen el agente (que consume presupuesto de IA y opera sobre datos de compras) y que la información sensible de costos y prompts sea solo para administradores |
| Estado | Hecho |
| Prioridad | Alta (P0 para el link público) |
| Estimación | 8 puntos |
| Sesiones de origen | S4, S5, S6 |
| Trazabilidad PRD | §6.1 (autenticación opcional; si se protege, entregar la clave), §8 Seguridad, §9.2 y §9.3 (link y clave de acceso) |

## 1. Levantamiento

**Sesiones de origen.** S4 (arquitectura, seguridad y nube), S5 (costos y observabilidad), S6 (revisión y aceptación).

**Hallazgos.**

- Líder de TI/Seguridad (S4): "Un link público que gasta nuestra clave de IA no puede quedar abierto. Si algo se configura mal, prefiero que no entre nadie a que entre cualquiera."
- Líder de TI/Seguridad (S4): "Nada de contraseñas en el front ni en el repositorio. Usemos el directorio de AWS que ya conocemos."
- Dirección administrativa y financiera (S5): "Los costos y los prompts no los tiene que ver todo el mundo, solo quien administra."
- Equipo Perxia (S6): "Los evaluadores necesitan un usuario listo que vea todo, sin pedirle a nadie que lo cree."
- Analista administrativa (S3/S6): "Si se me vence la sesión, que me lleve al login, no que se rompa la pantalla."

**Necesidades.** Login obligatorio en el link; proveedor de identidad gestionado; roles mínimos (administrador y analista); usuario de prueba para evaluadores con acceso total; protección contra intentos repetidos; aislamiento de conversaciones por usuario.

**Restricciones.** El PRD declara la autenticación como no objetivo, pero permite proteger el link si se entrega la clave. No se usan librerías pesadas de front (Amplify) ni redirecciones a una UI alojada: la experiencia de login debe ser propia y minimalista.

## 2. Historias de usuario

### HU-05.1 · Login obligatorio que falla cerrado

**Como** líder de TI/Seguridad **quiero** que el link exija inicio de sesión y que ante una configuración incompleta nadie pueda entrar **para** que un error de despliegue no deje expuesta la clave de IA.

```gherkin
Escenario: Acceso sin token
  Dado el despliegue en producción con AUTH_MODO=cognito
  Cuando llamo GET /api/casos sin cabecera Authorization
  Entonces la respuesta es 401 con "Inicia sesión para continuar."

Escenario: Configuración incompleta
  Dado AUTH_MODO=cognito sin COGNITO_USER_POOL_ID
  Cuando arranca el backend
  Entonces registra que el login está cerrado y cualquier login responde "El inicio de sesión no está disponible"
  Y ninguna ruta protegida queda abierta

Escenario: Modo abierto en producción
  Dado NODE_ENV=production y AUTH_MODO=abierto
  Cuando arranca el backend
  Entonces el modo abierto se rechaza y el login queda cerrado
```

- Reglas: `/api/health` y `/api/auth/*` son públicas; todo lo demás bajo `/api/*` exige Bearer. "abierto" solo existe fuera de producción y si se pide explícitamente.
- Prioridad: P0 · Puntos: 2 · Estado: Hecho.

### HU-05.2 · Inicio de sesión con Amazon Cognito

**Como** usuaria **quiero** entrar con mi correo y contraseña en una pantalla propia de la app **para** no salir a otra página ni instalar nada.

```gherkin
Escenario: Login correcto
  Dado el usuario evaluador@periferia-ficticia.com creado en el User Pool
  Cuando envío usuario y clave a POST /api/auth/login
  Entonces el backend llama InitiateAuth (USER_PASSWORD_AUTH), valida el ID token y responde 200 con token, expiración y usuario

Escenario: Credenciales incorrectas
  Dado una clave equivocada
  Cuando intento entrar
  Entonces veo "Usuario o contraseña incorrectos." sin revelar si el usuario existe

Escenario: Contraseña temporal
  Dado un usuario con desafío NEW_PASSWORD_REQUIRED
  Cuando intenta entrar
  Entonces recibe un mensaje claro para que el administrador fije una contraseña permanente
```

- Reglas: el App Client es público y sin secreto; el ID token se verifica con `aws-jwt-verify` (`tokenUse: "id"`, `clientId`). Errores de Cognito traducidos a español.
- Prioridad: P0 · Puntos: 2 · Estado: Hecho.

### HU-05.3 · Roles: administrador y analista

**Como** dirección **quiero** que solo los administradores vean el observatorio de costos y prompts **para** proteger información interna.

```gherkin
Escenario: Administrador
  Dado un usuario en el grupo "admin" de Cognito
  Cuando abre /api/observatorio/resumen
  Entonces recibe 200 y ve el botón "Observatorio" en la cabecera

Escenario: Analista
  Dado un usuario sin grupo "admin"
  Cuando llama /api/observatorio/resumen
  Entonces recibe 403 con "Esta sección es solo para administradores."
  Y puede usar el chat con normalidad
```

- Reglas: el rol sale del claim `cognito:groups`; en modo local el usuario es admin.
- Prioridad: P1 · Puntos: 1 · Estado: Hecho.

### HU-05.4 · Usuario de prueba para evaluadores

**Como** evaluador de Periferia **quiero** un usuario listo con acceso completo **para** probar todo el producto durante la defensa.

```gherkin
Escenario: Usuario evaluador creado por infraestructura
  Dado que se ejecutó infra/powershell/02-cognito.ps1
  Entonces existe evaluador@periferia-ficticia.com con email verificado, contraseña permanente y grupo admin
  Y el script prueba el login sin imprimir tokens

Escenario: Prueba de humo del despliegue
  Dado el secreto TEST_PASSWORD en el environment aws-demo
  Cuando termina el despliegue
  Entonces el workflow verifica login 200 del evaluador
```

- Reglas: la contraseña del evaluador no se versiona; se entrega por canal privado junto con el link.
- Prioridad: P0 · Puntos: 1 · Estado: Hecho.

### HU-05.5 · Sesión segura en el navegador

**Como** analista **quiero** que mi sesión funcione en todas las pantallas y me devuelva al login si vence **para** no perder el hilo ni ver errores técnicos.

```gherkin
Escenario: Token en todas las llamadas
  Dado que inicié sesión
  Entonces cada llamada a /api, incluido el stream de /api/chat, lleva Authorization: Bearer
  Y las descargas de evidencia y control.csv usan fetch + blob sin poner el token en la URL

Escenario: Sesión vencida
  Dado un token expirado
  Cuando el backend responde 401
  Entonces la app vuelve al login con el aviso de sesión vencida

Escenario: Conversaciones aisladas
  Dado una conversación creada por otro usuario
  Cuando intento abrirla con mi token
  Entonces no se encuentra
```

- Prioridad: P1 · Puntos: 1 · Estado: Hecho.

### HU-05.6 · Protección contra intentos repetidos

**Como** líder de TI/Seguridad **quiero** limitar los intentos de login por IP **para** dificultar ataques de fuerza bruta.

```gherkin
Escenario: Exceso de intentos
  Dado 10 intentos fallidos desde la misma IP en 5 minutos
  Cuando intento de nuevo
  Entonces recibo 429 con "Demasiados intentos. Espera unos minutos."
```

- Prioridad: P2 · Puntos: 1 · Estado: Hecho.

## 3. Solución implementada

**Diseño.** Patrón estrategia: un `Autenticador` con `login` y `verificar`, con implementaciones Cognito y local, más un autenticador "cerrado" que nunca deja entrar. El backend expone rutas públicas de auth y un middleware Hono que deja `c.get("usuario")` disponible. El front nunca habla directamente con Cognito.

| Pieza | Ruta |
|---|---|
| Selección de modo y falla cerrada, rutas `/config`, `/login`, `/yo`, middleware y `soloAdmin` | `apps/backend/src/auth/index.ts` |
| Cognito: InitiateAuth por HTTP, traducción de errores, verificación del ID token, rol por grupo | `apps/backend/src/auth/cognito.ts` |
| Modo local: token HMAC-SHA256 de 8 h, comparación en tiempo constante | `apps/backend/src/auth/local.ts` |
| Límite de intentos por IP | `apps/backend/src/auth/limitador.ts` |
| Tipos (`EntornoAuth`, `VariablesAuth`) | `apps/backend/src/auth/tipos.ts` |
| Contrato (`ConfigAuth`, `RespuestaLogin`, `UsuarioDto` con `rol`) | `packages/contracts/src/index.ts` |
| Pantalla de login y manejo de sesión | `apps/web/src/componentes/Login.tsx`, `apps/web/src/App.tsx`, `apps/web/src/api/http.ts` |
| Sesiones ligadas al dueño | `apps/backend/src/agent/sesiones.ts`, `apps/backend/src/persistencia/sesiones.ts` |
| User Pool, App Client, grupo admin y usuario evaluador | `infra/powershell/02-cognito.ps1`, `infra/cloudshell/02-cognito.sh` |

**Configuración.** `AUTH_MODO=cognito`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` en el contenedor; el workflow de despliegue los fija y no despliega si faltan. Para desarrollo: `AUTH_MODO=local` con `AUTH_USUARIO` y `AUTH_CLAVE` en `.env`.

## 4. Verificación

- Pruebas manuales por HTTP en modo local y en el contenedor: sin token 401, login 200, rutas protegidas con token 200, observatorio detrás de `soloAdmin`.
- Prueba e2e en navegador: login, chat, observatorio y regreso al login ante sesión inválida, sin errores de consola.
- Despliegue en AWS: la prueba de humo del workflow confirmó `/api/casos` sin token → 401 y login del evaluador → 200 contra Cognito real.
- Validación del usuario en el link público con el usuario evaluador.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Login por el backend (InitiateAuth) con pantalla propia | Hosted UI de Cognito con redirecciones | Experiencia minimalista sin salir de la app y sin dominio extra que borrar |
| Verificar el ID token con `aws-jwt-verify` | Validación manual del JWT | Librería oficial, pequeña, con caché de JWKS |
| Falla cerrada siempre | Degradar a "abierto" si falta configuración | Un error de despliegue no debe exponer la clave de IA (pedido de Seguridad) |
| Roles por grupo de Cognito | Tabla propia de permisos | Cero estado adicional; el grupo se borra con el pool |
| Token en `localStorage` + Bearer | Cookie de sesión | Simplicidad con SSE y descargas fetch + blob; el riesgo XSS se mitiga con markdown saneado y sin HTML de terceros |

## 6. Pendientes para producción

- MFA para administradores y política de rotación de contraseñas.
- Refresh token y renovación silenciosa (hoy el ID token dura 8 h).
- Límite de intentos distribuido (hoy es en memoria por instancia) y WAF delante del servicio.
- Federación con el directorio corporativo (SSO SAML/OIDC) y roles por centro de costo.
- Revisión de almacenamiento del token (cookie `HttpOnly` si se agrega un BFF).
