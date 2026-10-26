#!/bin/bash
# Paso 3: identidad de GitHub Actions en AWS (OIDC, sin llaves de larga duración).
# - Proveedor OIDC de GitHub: si YA existe (puede usarlo producción) se reutiliza y NUNCA se borra.
# - Rol perxia-reto03-gha-deploy: solo este repo + environment aws-demo; solo desplegar en Lightsail en $REGION.
# Uso: bash infra/cloudshell/03-oidc-rol.sh      (región por defecto us-east-2)
set -euo pipefail
# shellcheck source=infra/cloudshell/00-variables.sh
source "$(dirname "$0")/00-variables.sh"

# 3.1 Proveedor OIDC
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "El proveedor OIDC de GitHub ya existe en la cuenta: se REUTILIZA y no se borrará al final."
  [ "$(leer_estado OIDC_CREADO)" = "si" ] || guardar_estado OIDC_CREADO no
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd \
    --tags "Key=proyecto,Value=$PROYECTO" "Key=desechable,Value=true" \
    --query 'OpenIDConnectProviderArn' --output text
  guardar_estado OIDC_CREADO si
  echo "Proveedor OIDC creado por este reto (tag proyecto=$PROYECTO)."
fi
guardar_estado OIDC_ARN "$OIDC_ARN"

# 3.2 Rol con trust policy limitada al repo y al environment aws-demo
sed "s/__ACCOUNT_ID__/$ACCOUNT_ID/" "$RAIZ/infra/iam/trust-policy.template.json" >"$WORKDIR/trust-policy.json"
sed "s/__REGION__/$REGION/" "$RAIZ/infra/iam/deploy-policy.template.json" >"$WORKDIR/deploy-policy.json"

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "file://$WORKDIR/trust-policy.json"
  echo "Rol $ROLE ya existía: trust policy actualizada."
else
  aws iam create-role \
    --role-name "$ROLE" \
    --description "GitHub Actions despliega el reto 03 en Lightsail (desechable)" \
    --assume-role-policy-document "file://$WORKDIR/trust-policy.json" \
    --max-session-duration 3600 \
    --tags "Key=proyecto,Value=$PROYECTO" "Key=desechable,Value=true" \
    --query 'Role.Arn' --output text
  guardar_estado ROLE_CREADO si
fi

# 3.3 Política inline mínima (solo Lightsail, solo en la región del reto)
aws iam put-role-policy --role-name "$ROLE" --policy-name "$ROLE_POLICY" \
  --policy-document "file://$WORKDIR/deploy-policy.json"

ROLE_ARN="$(aws iam get-role --role-name "$ROLE" --query 'Role.Arn' --output text)"
guardar_estado ROLE_NAME "$ROLE"
guardar_estado ROLE_POLICY "$ROLE_POLICY"
guardar_estado ROLE_ARN "$ROLE_ARN"
echo
echo "Variable para GitHub:  AWS_ROLE_ARN=$ROLE_ARN"
