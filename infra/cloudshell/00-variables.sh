#!/bin/bash
# Variables compartidas por todos los pasos. Se carga con:  source infra/cloudshell/00-variables.sh
# (Sin `set -e` a propósito: un archivo cargado con `source` no debe poder cerrar tu sesión de CloudShell.)
#
# Antes de cargarlo, elige una región SIN productos de producción:
#   export REGION=us-east-2

if [ -z "${REGION:-}" ]; then
  echo "Define primero la región dedicada al reto, por ejemplo:  export REGION=us-east-2" >&2
  # shellcheck disable=SC2317
  return 1 2>/dev/null || exit 1
fi

export REGION
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

# Carpeta de trabajo en CloudShell (archivos temporales y estado de lo creado).
export WORKDIR="$HOME/perxia-reto03"
mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"
export ESTADO="$WORKDIR/estado.env"
touch "$ESTADO"
# shellcheck disable=SC1090
source "$ESTADO"

echo "Cuenta: $ACCOUNT_ID · Región: $REGION · Prefijo: $PROYECTO"
