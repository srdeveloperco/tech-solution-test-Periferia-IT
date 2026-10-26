#!/bin/bash
# Variables compartidas por todos los pasos. Se carga con:  source infra/cloudshell/00-variables.sh
# (Sin `set -e` a propósito: un archivo cargado con `source` no debe poder cerrar tu sesión de CloudShell.)
#
# Región por defecto: us-east-2 (confirmada sin productos de producción). Para cambiarla:
#   export REGION=otra-region

export REGION="${REGION:-us-east-2}"
export PROYECTO="perxia-reto03"
export AWS_REGION="$REGION"
export AWS_DEFAULT_REGION="$REGION"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ACCOUNT_ID

# Nombres exactos de TODO lo que se crea (prefijo único perxia-reto03).
export SVC="${PROYECTO}-oc-agent"            # Lightsail Container Service
export POOL_NAME="${PROYECTO}-usuarios"      # Cognito User Pool
export CLIENT_NAME="${PROYECTO}-web"         # Cognito App Client (público, sin secreto)
export ROLE="${PROYECTO}-gha-deploy"         # Rol IAM para GitHub Actions (OIDC)
export ROLE_POLICY="${PROYECTO}-lightsail-deploy"  # Política inline del rol
export GRUPO_ADMIN="admin"                          # Grupo Cognito con acceso total (chat + observatorio)
export TEST_USER="${TEST_USER:-evaluador@periferia-ficticia.com}"  # Usuario de prueba de los evaluadores

export REPO="srdeveloperco/tech-solution-test-Periferia-IT"
export OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

# Estado y temporales en infra/.generated/ (ignorado por git), dentro de la copia del repo.
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export RAIZ
export WORKDIR="$RAIZ/infra/.generated"
mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"
# Inventario de lo que ESTOS scripts crearon de verdad (IDs/ARNs). 99-eliminar lo lee y además verifica nombre/tag.
export ESTADO="$WORKDIR/estado.json"
[ -s "$ESTADO" ] || echo '{}' >"$ESTADO"

guardar_estado() { # guardar_estado CLAVE VALOR
  local tmp
  tmp="$(mktemp)"
  jq --arg k "$1" --arg v "$2" --arg c "$ACCOUNT_ID" --arg r "$REGION" \
    '.[$k] = $v | .CUENTA = $c | .REGION = $r | .ACTUALIZADO = (now | todate)' "$ESTADO" >"$tmp"
  mv "$tmp" "$ESTADO"
}
leer_estado() { # leer_estado CLAVE → valor o vacío
  jq -r --arg k "$1" '.[$k] // empty' "$ESTADO"
}

echo "Cuenta: $ACCOUNT_ID · Región: $REGION · Prefijo: $PROYECTO"
