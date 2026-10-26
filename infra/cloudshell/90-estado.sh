#!/bin/bash
# Estado de todo lo del reto (solo lectura, sin imprimir secretos).
# Uso: bash infra/cloudshell/90-estado.sh      (región por defecto us-east-2)
set -euo pipefail
# shellcheck source=infra/cloudshell/00-variables.sh
source "$(dirname "$0")/00-variables.sh"

echo "── Inventario registrado en $ESTADO"
jq . "$ESTADO"
echo
echo "── Lightsail ($SVC)"
aws lightsail get-container-services --region "$REGION" \
  --query "containerServices[?starts_with(containerServiceName, '$PROYECTO')].{servicio:containerServiceName,estado:state,version:currentDeployment.version,despliegue:currentDeployment.state,url:url}" \
  --output table 2>/dev/null || echo "  (ninguno)"

echo "── Cognito"
aws cognito-idp list-user-pools --region "$REGION" --max-results 60 \
  --query "UserPools[?starts_with(Name, '$PROYECTO')].{nombre:Name,id:Id}" --output table

echo "── IAM (rol)"
aws iam list-roles --query "Roles[?starts_with(RoleName, '$PROYECTO')].{rol:RoleName,arn:Arn}" --output table

echo "── IAM (proveedor OIDC de GitHub)"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  tag="$(aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn "$OIDC_ARN" \
    --query "Tags[?Key=='proyecto'].Value | [0]" --output text)"
  if [ "$tag" = "$PROYECTO" ]; then echo "  existe y es del reto (se borra al final)"; else echo "  existe y NO es del reto (no se toca)"; fi
else
  echo "  no existe"
fi
