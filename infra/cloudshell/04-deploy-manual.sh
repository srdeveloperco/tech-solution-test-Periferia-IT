#!/bin/bash
# Plan B: despliegue manual desde CloudShell (o una terminal local con Docker + AWS CLI v2),
# por si GitHub Actions no está disponible. Ejecútalo desde una copia del repo:
#   git clone https://github.com/srdeveloperco/tech-solution-test-Periferia-IT.git ~/perxia-reto03/repo
#   cd ~/perxia-reto03/repo && git checkout claude/compassionate-bardeen-ip65go
#   bash infra/cloudshell/04-deploy-manual.sh      (región por defecto us-east-2)
set -euo pipefail
# shellcheck source=infra/cloudshell/00-variables.sh
source "$(dirname "$0")/00-variables.sh"
POOL_ID="$(leer_estado POOL_ID)"
CLIENT_ID="$(leer_estado CLIENT_ID)"
: "${POOL_ID:?Falta POOL_ID en infra/.generated/estado.json: corre primero 02-cognito.sh}"
: "${CLIENT_ID:?Falta CLIENT_ID en infra/.generated/estado.json: corre primero 02-cognito.sh}"

# 1) lightsailctl (plugin oficial para subir imágenes a Lightsail)
if ! command -v lightsailctl >/dev/null 2>&1; then
  mkdir -p "$HOME/bin"
  curl -fsSL "https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl" -o "$HOME/bin/lightsailctl"
  chmod +x "$HOME/bin/lightsailctl"
  export PATH="$HOME/bin:$PATH"
fi

# 2) Imagen
ETIQUETA="$SVC:manual-$(date +%Y%m%d%H%M)"
docker build --platform linux/amd64 -t "$ETIQUETA" "$RAIZ"

# 3) Subir a Lightsail y tomar la referencia ":servicio.app.N"
salida="$(aws lightsail push-container-image --region "$REGION" --service-name "$SVC" --label app --image "$ETIQUETA" 2>&1)"
echo "$salida" | tail -3
IMAGEN="$(echo "$salida" | grep -oE ":${SVC}\.app\.[0-9]+" | tail -1)"
[ -n "$IMAGEN" ] || { echo "No se encontró la referencia de la imagen en la salida." >&2; exit 1; }
echo "Imagen registrada: $IMAGEN"

# 4) Configuración del contenedor (la clave se pide oculta y el archivo se borra al final)
read -rsp "ANTHROPIC_API_KEY (no se mostrará): " ANTHROPIC_API_KEY
echo
export IMAGEN ANTHROPIC_API_KEY POOL_ID CLIENT_ID
umask 077
jq '.app.image = $ENV.IMAGEN
  | .app.environment.ANTHROPIC_API_KEY = $ENV.ANTHROPIC_API_KEY
  | .app.environment.AUTH_MODO = "cognito"
  | .app.environment.NODE_ENV = "production"
  | .app.environment.COGNITO_REGION = $ENV.REGION
  | .app.environment.COGNITO_USER_POOL_ID = $ENV.POOL_ID
  | .app.environment.COGNITO_CLIENT_ID = $ENV.CLIENT_ID
  | .app.environment.PRESUPUESTO_USD = ($ENV.PRESUPUESTO_USD // "10")
  | .app.environment.LLM_MODELO_ROUTER = ($ENV.LLM_MODELO_ROUTER // .app.environment.LLM_MODELO_ROUTER)
  | .app.environment.LLM_MODELO_OPERADOR = ($ENV.LLM_MODELO_OPERADOR // .app.environment.LLM_MODELO_OPERADOR)
  | .app.environment.LLM_MODELO_ASESOR = ($ENV.LLM_MODELO_ASESOR // .app.environment.LLM_MODELO_ASESOR)
  | .app.environment.LLM_MODELO_CONVERSADOR = ($ENV.LLM_MODELO_CONVERSADOR // .app.environment.LLM_MODELO_CONVERSADOR)' \
  "$RAIZ/infra/lightsail/containers.template.json" >"$WORKDIR/containers.json"
unset ANTHROPIC_API_KEY

# 5) Desplegar (la salida se filtra con --query para no imprimir variables de entorno)
VERSION="$(aws lightsail create-container-service-deployment --region "$REGION" --service-name "$SVC" \
  --containers "file://$WORKDIR/containers.json" \
  --public-endpoint "file://$RAIZ/infra/lightsail/endpoint.json" \
  --query 'containerService.nextDeployment.version' --output text)"
rm -f "$WORKDIR/containers.json"
echo "Despliegue versión $VERSION en curso..."

# 6) Esperar a que la versión quede ACTIVA
for _ in $(seq 1 60); do
  read -r actual estado <<<"$(aws lightsail get-container-services --region "$REGION" --service-name "$SVC" \
    --query 'containerServices[0].[currentDeployment.version, currentDeployment.state]' --output text)"
  siguiente="$(aws lightsail get-container-services --region "$REGION" --service-name "$SVC" \
    --query 'containerServices[0].nextDeployment.state' --output text)"
  if [ "$actual" = "$VERSION" ] && [ "$estado" = "ACTIVE" ]; then break; fi
  if [ "$siguiente" = "FAILED" ] || { [ "$siguiente" = "None" ] && [ "$actual" != "$VERSION" ]; }; then
    echo "El despliegue falló. Revisa logs: aws lightsail get-container-log --region $REGION --service-name $SVC --container-name app" >&2
    exit 1
  fi
  sleep 10
done

URL="$(aws lightsail get-container-services --region "$REGION" --service-name "$SVC" --query 'containerServices[0].url' --output text)"
curl -fsS "${URL%/}/api/health" && echo
echo "/api/casos sin token → $(curl -s -o /dev/null -w '%{http_code}' "${URL%/}/api/casos") (esperado 401)"
guardar_estado URL "$URL"
echo "Listo: $URL"
