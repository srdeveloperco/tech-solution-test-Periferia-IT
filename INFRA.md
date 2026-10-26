# INFRA.md — Despliegue en AWS (desechable) y borrado seguro

Guía comando a comando para **AWS CloudShell** (bash + AWS CLI v2, ya instalados al abrir CloudShell desde la consola).
Los mismos comandos sirven en una terminal local con AWS CLI v2 configurado (y Docker, solo para el plan B).

> **La cuenta es de producción y tiene otros productos.** Todo lo de este reto:
> - se llama `perxia-reto03-*`,
> - lleva los tags `proyecto=perxia-reto03` y `desechable=true`,
> - vive en **una región dedicada** que tú eliges (una donde no haya producción),
> - se borra con la sección [12. Borrado](#12-borrado-solo-lo-del-reto), que verifica nombre y tag antes de tocar algo.
>
> Nunca uses comandos de borrado con nombres distintos a los de la tabla de inventario.

Scripts equivalentes en `infra/cloudshell/` (para quien prefiera clonar el repo): `00-variables.sh`, `01-lightsail.sh`,
`02-cognito.sh`, `03-oidc-rol.sh`, `04-deploy-manual.sh`, `90-estado.sh`, `99-eliminar.sh`.

---

## 0. Inventario: lo único que se crea

| # | Recurso | Nombre exacto | Dónde | Lo crea | Costo aprox. | Cómo se borra |
|---|---|---|---|---|---|---|
| 1 | Lightsail Container Service (micro, 1 nodo) | `perxia-reto03-oc-agent` | `$REGION` | §3 | ≈ USD 10/mes, prorrateado por hora (unos centavos por día de prueba) | `aws lightsail delete-container-service` (borra imágenes y despliegues) |
| 2 | Cognito User Pool | `perxia-reto03-usuarios` | `$REGION` | §4 | USD 0 (nivel gratuito, < 10.000 usuarios activos/mes) | `aws cognito-idp delete-user-pool` (borra App Client y usuarios) |
| 2a | └ App Client público, sin secreto | `perxia-reto03-web` | dentro del pool | §4 | — | se borra con el pool |
| 2b | └ Grupo con acceso total (chat + observatorio) | `admin` | dentro del pool | §4 | — | se borra con el pool |
| 2c | └ Usuario de los evaluadores (grupo `admin`) | `evaluador@periferia-ficticia.com` | dentro del pool | §4 | — | se borra con el pool |
| 3 | Rol IAM para GitHub Actions | `perxia-reto03-gha-deploy` | global | §6 | USD 0 | `delete-role-policy` + `delete-role` |
| 3a | └ Política inline (solo Lightsail, solo `$REGION`) | `perxia-reto03-lightsail-deploy` | dentro del rol | §6 | — | `delete-role-policy` |
| 4 | Proveedor OIDC `token.actions.githubusercontent.com` | (ARN fijo de la cuenta) | global | §5 **solo si no existía** | USD 0 | **solo** si tiene tag `proyecto=perxia-reto03` |
| 5 | Carpeta de trabajo en CloudShell | `~/perxia-reto03` | tu CloudShell | §2 | USD 0 | `rm -rf ~/perxia-reto03` |

No se crean VPC, balanceadores, buckets, bases de datos gestionadas, ECR ni claves de acceso de IAM.
Lightsail no se conecta a las VPC de producción.

---

## 1. Antes de empezar

1. Entra a la consola de AWS con la cuenta admin y **cambia a la región elegida** (arriba a la derecha).
   Recomendado: una región sin productos de producción, por ejemplo `us-east-2` (Ohio). Lightsail Containers y Cognito deben estar disponibles en ella.
2. Abre **CloudShell** (icono `>_` en la barra superior).
3. Ten a mano: la clave del modelo (`ANTHROPIC_API_KEY`) y acceso de administrador al repo de GitHub.

---

## 2. Variables (pega esto primero, en cada sesión nueva de CloudShell)

```bash
export REGION=us-east-2            # ← cámbiala si producción usa esta región
export PROYECTO=perxia-reto03
export AWS_REGION=$REGION AWS_DEFAULT_REGION=$REGION
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export SVC=perxia-reto03-oc-agent
export POOL_NAME=perxia-reto03-usuarios
export CLIENT_NAME=perxia-reto03-web
export ROLE=perxia-reto03-gha-deploy
export ROLE_POLICY=perxia-reto03-lightsail-deploy
export GRUPO_ADMIN=admin
export TEST_USER=evaluador@periferia-ficticia.com
export TEST_PASSWORD='Perxia#Reto03-2026'   # clave del usuario de prueba (cámbiala si quieres; ≥12, mayúscula, minúscula, número y símbolo)
export REPO=srdeveloperco/tech-solution-test-Periferia-IT
export OIDC_ARN=arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com
export WORKDIR=$HOME/perxia-reto03
mkdir -p $WORKDIR && chmod 700 $WORKDIR
echo "Cuenta $ACCOUNT_ID · Región $REGION"
```

Comprueba que la cuenta y la región son las correctas antes de seguir.

---

## 3. Lightsail Container Service

```bash
aws lightsail create-container-service \
  --region $REGION \
  --service-name $SVC \
  --power micro \
  --scale 1 \
  --tags key=proyecto,value=$PROYECTO key=desechable,value=true \
  --query 'containerService.state' --output text
```

Espera a que quede `READY` (1 a 3 minutos):

```bash
until [ "$(aws lightsail get-container-services --region $REGION --service-name $SVC \
  --query 'containerServices[0].state' --output text)" = "READY" ]; do printf "."; sleep 10; done; echo " READY"
```

> ⚠️ Siempre usa `--query` con `get-container-services`: la respuesta completa incluye las variables de entorno del
> contenedor (entre ellas la clave del modelo).

---

## 4. Cognito: login obligatorio del link

El link **siempre exige login**. El backend autentica con `InitiateAuth` (flujo `USER_PASSWORD_AUTH`), valida el
ID token con `aws-jwt-verify` y lee el claim `cognito:groups`:

| Grupo | Ve |
|---|---|
| `admin` | todo: chat + observatorio |
| (sin grupo) | solo el chat |

Si faltan `COGNITO_*` en el contenedor, el backend **falla cerrado** (nadie entra; nunca queda abierto).
El App Client es público y **sin secreto**; no hay dominio de Hosted UI.

**4.1 User Pool** (login con email, solo administradores crean usuarios, sin MFA, contraseña ≥12 con mayúscula,
minúscula, número y símbolo):

```bash
export POOL_ID=$(aws cognito-idp create-user-pool \
  --region $REGION \
  --pool-name $POOL_NAME \
  --username-attributes email \
  --policies 'PasswordPolicy={MinimumLength=12,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true,TemporaryPasswordValidityDays=3}' \
  --admin-create-user-config AllowAdminCreateUserOnly=true \
  --mfa-configuration OFF \
  --deletion-protection INACTIVE \
  --user-pool-tags proyecto=$PROYECTO,desechable=true \
  --query 'UserPool.Id' --output text)
echo "POOL_ID=$POOL_ID"
```

**4.2 App Client** (público, sin secreto, usuario/contraseña + refresh):

```bash
export CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --region $REGION \
  --user-pool-id $POOL_ID \
  --client-name $CLIENT_NAME \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --prevent-user-existence-errors ENABLED \
  --token-validity-units AccessToken=hours,IdToken=hours,RefreshToken=days \
  --access-token-validity 8 --id-token-validity 8 --refresh-token-validity 1 \
  --query 'UserPoolClient.ClientId' --output text)
echo "CLIENT_ID=$CLIENT_ID"
```

**4.3 Grupo `admin`:**

```bash
aws cognito-idp create-group --region $REGION --user-pool-id $POOL_ID \
  --group-name $GRUPO_ADMIN --description "Acceso completo: chat + observatorio" \
  --query 'Group.GroupName' --output text
```

**4.4 Usuario de los evaluadores** (sin correo de invitación, email verificado, clave permanente, grupo `admin`):

```bash
aws cognito-idp admin-create-user --region $REGION --user-pool-id $POOL_ID \
  --username $TEST_USER \
  --user-attributes Name=email,Value=$TEST_USER Name=email_verified,Value=true "Name=name,Value=Evaluador Periferia" \
  --message-action SUPPRESS --query 'User.Username' --output text

aws cognito-idp admin-set-user-password --region $REGION --user-pool-id $POOL_ID \
  --username $TEST_USER --password "$TEST_PASSWORD" --permanent

aws cognito-idp admin-add-user-to-group --region $REGION --user-pool-id $POOL_ID \
  --username $TEST_USER --group-name $GRUPO_ADMIN
```

**4.5 Prueba de login** (imprime solo la vigencia y los grupos, nunca los tokens):

```bash
aws cognito-idp initiate-auth --region $REGION --client-id $CLIENT_ID --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "$(jq -n --arg u "$TEST_USER" --arg p "$TEST_PASSWORD" '{USERNAME:$u,PASSWORD:$p}')" \
  --query 'AuthenticationResult.ExpiresIn' --output text
aws cognito-idp admin-list-groups-for-user --region $REGION --user-pool-id $POOL_ID \
  --username $TEST_USER --query 'Groups[].GroupName' --output text
```

Si imprime `28800` y `admin`, el login funciona. Si cierras CloudShell, recupera los IDs así:

```bash
export POOL_ID=$(aws cognito-idp list-user-pools --region $REGION --max-results 60 \
  --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text)
export CLIENT_ID=$(aws cognito-idp list-user-pool-clients --region $REGION --user-pool-id $POOL_ID \
  --query "UserPoolClients[?ClientName=='$CLIENT_NAME'].ClientId | [0]" --output text)
echo "POOL_ID=$POOL_ID CLIENT_ID=$CLIENT_ID"
```

**4.6 Usuarios adicionales** (opcional). Cambia el correo, el nombre y la clave:

```bash
NUEVO=analista@periferia-ficticia.com
aws cognito-idp admin-create-user --region $REGION --user-pool-id $POOL_ID --username $NUEVO \
  --user-attributes Name=email,Value=$NUEVO Name=email_verified,Value=true "Name=name,Value=Analista Compras" \
  --message-action SUPPRESS --query 'User.Username' --output text
read -rsp "Clave para $NUEVO: " CLAVE; echo
aws cognito-idp admin-set-user-password --region $REGION --user-pool-id $POOL_ID \
  --username $NUEVO --password "$CLAVE" --permanent; unset CLAVE

# Solo si debe ver también el observatorio:
aws cognito-idp admin-add-user-to-group --region $REGION --user-pool-id $POOL_ID --username $NUEVO --group-name $GRUPO_ADMIN
# Para quitarle el acceso total más adelante:
# aws cognito-idp admin-remove-user-from-group --region $REGION --user-pool-id $POOL_ID --username $NUEVO --group-name $GRUPO_ADMIN
```

Equivalente en un solo script: `REGION=us-east-2 TEST_PASSWORD='Perxia#Reto03-2026' bash infra/cloudshell/02-cognito.sh`.

---

## 5. Proveedor OIDC de GitHub (verificar antes de crear)

GitHub Actions obtiene credenciales temporales por OIDC: no se guardan llaves de AWS en GitHub.
Este proveedor es único por cuenta y **puede que producción ya lo use**.

```bash
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN >/dev/null 2>&1; then
  echo "YA EXISTE → se reutiliza y NO se borrará al final"; echo "OIDC_CREADO=no" > $WORKDIR/oidc.txt
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd \
    --tags Key=proyecto,Value=$PROYECTO Key=desechable,Value=true
  echo "OIDC_CREADO=si" > $WORKDIR/oidc.txt
fi
cat $WORKDIR/oidc.txt
```

**Anota el resultado.** El borrado decide por el tag, no por este archivo, pero sirve de registro.

---

## 6. Rol IAM para GitHub Actions

**6.1 Trust policy**: solo este repo y solo el environment `aws-demo` pueden asumir el rol.

```bash
cat > $WORKDIR/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "GitHubActionsSoloEsteRepoYEnvironment",
    "Effect": "Allow",
    "Principal": { "Federated": "$OIDC_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": [
          "repo:srdeveloperco/tech-solution-test-Periferia-IT:environment:aws-demo",
          "repo:srdeveloperco/tech-solution-test-periferia-it:environment:aws-demo"
        ]
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name $ROLE \
  --description "GitHub Actions despliega el reto 03 en Lightsail (desechable)" \
  --assume-role-policy-document file://$WORKDIR/trust-policy.json \
  --max-session-duration 3600 \
  --tags Key=proyecto,Value=$PROYECTO Key=desechable,Value=true \
  --query 'Role.Arn' --output text
```

**6.2 Permisos mínimos**: solo subir imágenes y desplegar en Lightsail, solo en `$REGION`. No puede crear ni borrar nada.

```bash
cat > $WORKDIR/deploy-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "SoloDesplegarContenedoresLightsailEnLaRegionDelReto",
    "Effect": "Allow",
    "Action": [
      "lightsail:GetContainerServices",
      "lightsail:GetContainerImages",
      "lightsail:GetContainerServiceDeployments",
      "lightsail:GetContainerLog",
      "lightsail:CreateContainerServiceRegistryLogin",
      "lightsail:RegisterContainerImage",
      "lightsail:CreateContainerServiceDeployment"
    ],
    "Resource": "*",
    "Condition": { "StringEquals": { "aws:RequestedRegion": "$REGION" } }
  }]
}
EOF

aws iam put-role-policy --role-name $ROLE --policy-name $ROLE_POLICY \
  --policy-document file://$WORKDIR/deploy-policy.json

export ROLE_ARN=$(aws iam get-role --role-name $ROLE --query 'Role.Arn' --output text)
echo "AWS_ROLE_ARN=$ROLE_ARN"
```

**6.3 Resumen de valores para GitHub** (cópialos):

```bash
cat <<EOF
AWS_ROLE_ARN=$ROLE_ARN
AWS_REGION=$REGION
LIGHTSAIL_SERVICE=$SVC
COGNITO_REGION=$REGION
COGNITO_USER_POOL_ID=$POOL_ID
COGNITO_CLIENT_ID=$CLIENT_ID
PRESUPUESTO_USD=10
EOF
```

---

## 7. Configurar GitHub (en el navegador)

Repo `srdeveloperco/tech-solution-test-Periferia-IT` → **Settings**:

1. **Environments → New environment** → nombre `aws-demo` → *Configure environment*.
   (Opcional: en *Deployment branches* limita a `main` y `claude/compassionate-bardeen-ip65go`.)
2. En el environment `aws-demo` → **Environment secrets → Add secret**:
   - `ANTHROPIC_API_KEY` = tu clave del modelo.
   - `TEST_PASSWORD` = la clave del usuario evaluador (opcional: si existe, el deploy prueba el login de punta a punta).
3. **Secrets and variables → Actions → pestaña Variables → New repository variable** (a nivel de **repositorio**,
   porque el workflow decide si despliega antes de entrar al environment):

| Variable | Valor |
|---|---|
| `AWS_ROLE_ARN` | el de §6.3 |
| `AWS_REGION` | tu región, ej. `us-east-2` |
| `LIGHTSAIL_SERVICE` | `perxia-reto03-oc-agent` |
| `COGNITO_REGION` | tu región |
| `COGNITO_USER_POOL_ID` | el de §6.3 |
| `COGNITO_CLIENT_ID` | el de §6.3 |
| `PRESUPUESTO_USD` | `10` |
| `TEST_USER` | `evaluador@periferia-ficticia.com` (opcional; es el valor por defecto) |

Mientras `AWS_ROLE_ARN` no exista, el workflow **Deploy** corre CI y se salta el despliegue.
Si falta cualquier `COGNITO_*` o `ANTHROPIC_API_KEY`, el deploy se detiene antes de desplegar (falla cerrado).

---

## 8. Desplegar y obtener la URL

**Opción A (recomendada): GitHub Actions.**
Haz push a `claude/compassionate-bardeen-ip65go` o a `main`. También puedes ir a **Actions → Deploy → Re-run all jobs**.
El workflow: CI (lint, límites, tipos, demo, build) → `docker build` → sube la imagen a Lightsail → despliega con
`AUTH_MODO=cognito` y `NODE_ENV=production` → espera `ACTIVE` → prueba de humo: `/api/health` = 200,
`/api/casos` sin token = 401 y login del evaluador = 200 (si existe el secreto `TEST_PASSWORD`).
La URL queda en el resumen del job y en el environment `aws-demo`.
(El botón *Run workflow* aparece cuando el workflow ya está en la rama por defecto.)

**Consultar la URL desde CloudShell:**

```bash
aws lightsail get-container-services --region $REGION --service-name $SVC \
  --query 'containerServices[0].{estado:state,version:currentDeployment.version,despliegue:currentDeployment.state,url:url}' \
  --output table
```

**Verificar acceso cerrado y login desde CloudShell:**

```bash
export URL=$(aws lightsail get-container-services --region $REGION --service-name $SVC \
  --query 'containerServices[0].url' --output text); URL=${URL%/}

# Sin token → debe responder 401
curl -s -o /dev/null -w "/api/casos sin token → %{http_code}\n" $URL/api/casos

# Login del evaluador → debe responder 200 (no se imprime el token)
curl -s -o /dev/null -w "login → %{http_code}\n" -X POST $URL/api/auth/login \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg u "$TEST_USER" --arg c "$TEST_PASSWORD" '{usuario:$u,clave:$c}')"
```

---

## 8.1 Acceso para evaluadores

Comparte estos tres datos (la URL sale del comando anterior):

| Dato | Valor |
|---|---|
| URL | `https://perxia-reto03-oc-agent.<id>.<región>.cs.amazonlightsail.com/` |
| Usuario | `evaluador@periferia-ficticia.com` |
| Clave | `Perxia#Reto03-2026` (o la que pusiste en `TEST_PASSWORD`) |

El usuario pertenece al grupo `admin`: ve el chat y el observatorio. Para crear más usuarios, ver §4.6.

---

## 9. Control de costos (dos capas)

1. **En la aplicación**: `PRESUPUESTO_USD=10` es el tope global de gasto en IA. Al alcanzarlo, el agente deja de
   llamar al modelo y lo informa en el chat. Además hay topes por turno (`AGENT_MAX_ITERACIONES`) y por sesión
   (`AGENT_MAX_TOKENS_SESION`).
2. **En el proveedor (recomendado)**: en la consola de Anthropic crea un *workspace* para el reto, genera la clave ahí y
   fija su **límite de gasto en USD 10**. Si algo falla en la app, el proveedor corta igual.

Infraestructura: Lightsail micro tiene precio fijo (≈ USD 10/mes prorrateado por hora); Cognito queda en nivel gratuito.
Bórralo al terminar la defensa para no acumular horas.

---

## 10. Plan B: despliegue manual desde CloudShell

Por si GitHub Actions no está disponible. Necesita Docker (CloudShell lo trae en la mayoría de regiones; si no, usa
una terminal local con Docker y AWS CLI v2, con las mismas variables de §2).

```bash
# lightsailctl: plugin oficial para subir imágenes a Lightsail
mkdir -p ~/bin && curl -fsSL https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl -o ~/bin/lightsailctl
chmod +x ~/bin/lightsailctl && export PATH=$HOME/bin:$PATH

# código
git clone https://github.com/$REPO.git $WORKDIR/repo
cd $WORKDIR/repo && git checkout claude/compassionate-bardeen-ip65go

# imagen → Lightsail
docker build --platform linux/amd64 -t $SVC:manual .
SALIDA=$(aws lightsail push-container-image --region $REGION --service-name $SVC --label app --image $SVC:manual 2>&1)
echo "$SALIDA" | tail -2
export IMAGEN=$(echo "$SALIDA" | grep -oE ":${SVC}\.app\.[0-9]+" | tail -1)
echo "Imagen: $IMAGEN"     # ej. :perxia-reto03-oc-agent.app.1
```

```bash
# configuración del contenedor (la clave se escribe oculta; el archivo se borra tras desplegar)
read -rsp "ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY; echo
export ANTHROPIC_API_KEY POOL_ID CLIENT_ID REGION IMAGEN
umask 077
jq '.app.image = $ENV.IMAGEN
  | .app.environment.ANTHROPIC_API_KEY = $ENV.ANTHROPIC_API_KEY
  | .app.environment.AUTH_MODO = "cognito"
  | .app.environment.NODE_ENV = "production"
  | .app.environment.COGNITO_REGION = $ENV.REGION
  | .app.environment.COGNITO_USER_POOL_ID = $ENV.POOL_ID
  | .app.environment.COGNITO_CLIENT_ID = $ENV.CLIENT_ID
  | .app.environment.PRESUPUESTO_USD = "10"' \
  infra/lightsail/containers.template.json > $WORKDIR/containers.json
unset ANTHROPIC_API_KEY

aws lightsail create-container-service-deployment --region $REGION --service-name $SVC \
  --containers file://$WORKDIR/containers.json \
  --public-endpoint file://infra/lightsail/endpoint.json \
  --query 'containerService.nextDeployment.version' --output text
rm -f $WORKDIR/containers.json
```

Luego consulta el estado y la URL con el comando de §8 hasta ver `ACTIVE`.
Equivalente en un solo script: `REGION=us-east-2 bash infra/cloudshell/04-deploy-manual.sh` (requiere §4 hecho).

---

## 11. Verificación, logs y datos efímeros

```bash
# Estado de todo lo del reto (sin secretos)
aws lightsail get-container-services --region $REGION \
  --query "containerServices[?starts_with(containerServiceName,'$PROYECTO')].[containerServiceName,state,url]" --output table
aws cognito-idp list-user-pools --region $REGION --max-results 60 \
  --query "UserPools[?starts_with(Name,'$PROYECTO')].[Name,Id]" --output table
aws iam list-roles --query "Roles[?starts_with(RoleName,'$PROYECTO')].[RoleName,Arn]" --output table

# Logs del contenedor (últimas líneas)
aws lightsail get-container-log --region $REGION --service-name $SVC --container-name app \
  --query 'logEvents[-30:].message' --output text
```

**Datos efímeros.** Dentro del contenedor, `out/` guarda `control.csv`, `log.jsonl`, `sap/ordenes.jsonl`, las
evidencias y la base de observabilidad **SQLite** (`out/observatorio.db`, vía `bun:sqlite`). Todo eso **se pierde al
redesplegar o reiniciar** el contenedor; es aceptable para la demo (el PRD pide archivos, sin base de datos).
En producción iría a almacenamiento gestionado: la observabilidad a una base administrada (por ejemplo RDS/Aurora
o DynamoDB) y las evidencias y el log de control a S3 con versionado.

---

## 12. Borrado (solo lo del reto)

Orden: contenedor → Cognito → rol → OIDC (solo si es nuestro) → archivos locales. Cada paso comprueba nombre y tag.
Primero carga las variables de §2 en la misma sesión.

**12.1 Lightsail** (borra el servicio, sus imágenes y despliegues):

```bash
aws lightsail get-container-services --region $REGION --service-name $SVC --query 'containerServices[0].containerServiceName' --output text \
  && aws lightsail delete-container-service --region $REGION --service-name $SVC
```

**12.2 Cognito** (borra también el App Client, el grupo `admin` y todos los usuarios, incluido el evaluador; busca por nombre exacto y verifica el tag antes de borrar):

```bash
POOL=$(aws cognito-idp list-user-pools --region $REGION --max-results 60 \
  --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text)
TAG=$(aws cognito-idp describe-user-pool --region $REGION --user-pool-id $POOL \
  --query 'UserPool.UserPoolTags.proyecto' --output text)
echo "Pool $POOL · tag proyecto=$TAG"
[ "$TAG" = "$PROYECTO" ] && aws cognito-idp delete-user-pool --region $REGION --user-pool-id $POOL
```

**12.3 Rol IAM** (primero la política inline, luego el rol; verifica el tag):

```bash
TAG=$(aws iam list-role-tags --role-name $ROLE --query "Tags[?Key=='proyecto'].Value | [0]" --output text)
echo "Rol $ROLE · tag proyecto=$TAG"
if [ "$TAG" = "$PROYECTO" ]; then
  aws iam delete-role-policy --role-name $ROLE --policy-name $ROLE_POLICY
  aws iam delete-role --role-name $ROLE
fi
```

**12.4 Proveedor OIDC — SOLO si lo creó este reto:**

```bash
TAG=$(aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn $OIDC_ARN \
  --query "Tags[?Key=='proyecto'].Value | [0]" --output text 2>/dev/null)
echo "OIDC tag proyecto=$TAG"
if [ "$TAG" = "$PROYECTO" ]; then
  aws iam delete-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN
else
  echo "No es del reto (ya existía): se CONSERVA."
fi
```

**12.5 Archivos de CloudShell:**

```bash
rm -rf $HOME/perxia-reto03
```

**12.6 Verificación final** (todo debe salir vacío; Lightsail puede tardar un minuto en desaparecer):

```bash
aws lightsail get-container-services --region $REGION \
  --query "containerServices[?starts_with(containerServiceName,'$PROYECTO')].[containerServiceName,state]" --output text
aws cognito-idp list-user-pools --region $REGION --max-results 60 \
  --query "UserPools[?starts_with(Name,'$PROYECTO')].Name" --output text
aws iam list-roles --query "Roles[?starts_with(RoleName,'$PROYECTO')].RoleName" --output text
```

**Alternativa con guardas:** `REGION=us-east-2 bash infra/cloudshell/99-eliminar.sh` muestra qué borraría (simulación);
con `--ejecutar` borra tras pedir que escribas `perxia-reto03`. Nunca toca recursos sin el prefijo o sin el tag.

**12.7 Fuera de AWS:**
- GitHub → Settings: borra el environment `aws-demo` (con sus secretos `ANTHROPIC_API_KEY` y `TEST_PASSWORD`) y las variables `AWS_ROLE_ARN`, `AWS_REGION`, `COGNITO_*`, `LIGHTSAIL_SERVICE`, `PRESUPUESTO_USD`, `TEST_USER`.
- Consola de Anthropic: revoca la clave del reto (o archiva el workspace).

---

## 13. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Deploy: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | el job no usa el environment `aws-demo` o el nombre del repo no coincide | revisa §6.1 y que el environment se llame exactamente `aws-demo` |
| Deploy se salta el job "Desplegar" | falta la variable de repositorio `AWS_ROLE_ARN` | §7 paso 3 |
| `push-container-image` pide lightsailctl | plugin no instalado | §10, primeras líneas |
| Despliegue `FAILED` | el contenedor no responde 200 en `/api/health` | `get-container-log` (§11) |
| Login falla con `NotAuthorizedException` | clave incorrecta o App Client sin `ALLOW_USER_PASSWORD_AUTH` | repite §4.4 / revisa §4.2 |
| `InvalidPasswordException` | la clave no cumple la política (≥12, mayúscula, minúscula, número, símbolo) | usa otra clave en `TEST_PASSWORD` |
| Nadie puede entrar al link | faltan `COGNITO_*` en el contenedor (el backend falla cerrado) | revisa las variables de §7 y redespliega |
| `create-open-id-connect-provider`: `EntityAlreadyExists` | el proveedor ya existía | normal: se reutiliza (§5) |
