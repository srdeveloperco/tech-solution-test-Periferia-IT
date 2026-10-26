#!/bin/bash
# BORRADO de todo lo creado por el reto. Por defecto es simulación (dry-run): solo muestra qué haría.
#   bash infra/cloudshell/99-eliminar.sh              # simulación (región por defecto us-east-2)
#   bash infra/cloudshell/99-eliminar.sh --ejecutar   # borra (pide confirmación escrita)
#
# Guardas:
#   - Lee el inventario infra/.generated/estado.json (debe ser de esta cuenta y región).
#   - Solo actúa sobre nombres que empiezan por "perxia-reto03" y verifica el tag proyecto=perxia-reto03.
#   - El proveedor OIDC de GitHub SOLO se borra si tiene el tag del reto y el estado no dice que ya existía.
set -euo pipefail
# shellcheck source=infra/cloudshell/00-variables.sh
source "$(dirname "$0")/00-variables.sh"

EJECUTAR="no"
[ "${1:-}" = "--ejecutar" ] && EJECUTAR="si"

exigir_prefijo() {
  case "$1" in
    perxia-reto03*) ;;
    *) echo "ABORTADO: '$1' no empieza por perxia-reto03. No se borra nada." >&2; exit 1 ;;
  esac
}
for nombre in "$SVC" "$POOL_NAME" "$CLIENT_NAME" "$ROLE" "$ROLE_POLICY"; do exigir_prefijo "$nombre"; done

cuenta_estado="$(leer_estado CUENTA)"
region_estado="$(leer_estado REGION)"
if [ -n "$cuenta_estado" ] && [ "$cuenta_estado" != "$ACCOUNT_ID" ]; then
  echo "ABORTADO: estado.json es de la cuenta $cuenta_estado, no de $ACCOUNT_ID." >&2; exit 1
fi
if [ -n "$region_estado" ] && [ "$region_estado" != "$REGION" ]; then
  echo "ABORTADO: estado.json es de la región $region_estado, no de $REGION." >&2; exit 1
fi
echo "Inventario registrado:"
jq -c 'del(.ACTUALIZADO)' "$ESTADO"

correr() {
  if [ "$EJECUTAR" = "si" ]; then
    echo "+ $*"
    "$@"
  else
    echo "[simulación] $*"
  fi
}

echo "Región: $REGION · Cuenta: $ACCOUNT_ID · Modo: $([ "$EJECUTAR" = si ] && echo BORRAR || echo simulación)"
if [ "$EJECUTAR" = "si" ]; then
  read -rp "Escribe exactamente 'perxia-reto03' para confirmar el borrado: " confirmacion
  [ "$confirmacion" = "perxia-reto03" ] || { echo "Confirmación incorrecta. No se borra nada."; exit 1; }
fi

# 1) Lightsail Container Service (borra también sus imágenes y despliegues)
echo "── 1) Lightsail: $SVC"
if aws lightsail get-container-services --region "$REGION" --service-name "$SVC" >/dev/null 2>&1; then
  tag="$(aws lightsail get-container-services --region "$REGION" --service-name "$SVC" \
    --query "containerServices[0].tags[?key=='proyecto'].value | [0]" --output text)"
  if [ "$tag" = "$PROYECTO" ]; then
    correr aws lightsail delete-container-service --region "$REGION" --service-name "$SVC"
  else
    echo "   existe pero sin tag proyecto=$PROYECTO: NO se borra (revísalo a mano)."
  fi
else
  echo "   no existe"
fi

# 2) Cognito User Pool (borra su App Client, el grupo admin y todos los usuarios, incluido el evaluador).
#    Se busca por nombre EXACTO y se verifica el tag.
echo "── 2) Cognito: $POOL_NAME"
POOL="$(aws cognito-idp list-user-pools --region "$REGION" --max-results 60 \
  --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text)"
if [ -n "$POOL" ] && [ "$POOL" != "None" ]; then
  tag="$(aws cognito-idp describe-user-pool --region "$REGION" --user-pool-id "$POOL" \
    --query 'UserPool.UserPoolTags.proyecto' --output text)"
  if [ "$tag" = "$PROYECTO" ]; then
    correr aws cognito-idp delete-user-pool --region "$REGION" --user-pool-id "$POOL"
  else
    echo "   $POOL se llama $POOL_NAME pero no tiene tag proyecto=$PROYECTO: NO se borra (revísalo a mano)."
  fi
else
  echo "   no existe"
fi

# 3) Rol IAM: primero la política inline, luego el rol. Solo si tiene el tag del proyecto.
echo "── 3) IAM: rol $ROLE"
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  tag="$(aws iam list-role-tags --role-name "$ROLE" --query "Tags[?Key=='proyecto'].Value | [0]" --output text)"
  if [ "$tag" = "$PROYECTO" ]; then
    if aws iam get-role-policy --role-name "$ROLE" --policy-name "$ROLE_POLICY" >/dev/null 2>&1; then
      correr aws iam delete-role-policy --role-name "$ROLE" --policy-name "$ROLE_POLICY"
    fi
    correr aws iam delete-role --role-name "$ROLE"
  else
    echo "   el rol existe pero no tiene tag proyecto=$PROYECTO: NO se borra."
  fi
else
  echo "   no existe"
fi

# 4) Proveedor OIDC de GitHub: SOLO si lo creó este reto (tag). Si ya existía, lo usa producción.
echo "── 4) IAM: proveedor OIDC de GitHub"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  tag="$(aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn "$OIDC_ARN" \
    --query "Tags[?Key=='proyecto'].Value | [0]" --output text)"
  if [ "$(leer_estado OIDC_CREADO)" = "no" ]; then
    echo "   ya existía antes del reto (estado OIDC_CREADO=no): se CONSERVA."
  elif [ "$tag" = "$PROYECTO" ]; then
    [ -n "$(leer_estado OIDC_CREADO)" ] || echo "   aviso: sin estado local; se decide solo por el tag proyecto=$PROYECTO."
    correr aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN"
  else
    echo "   existe pero NO es del reto (sin tag proyecto=$PROYECTO): se CONSERVA."
  fi
else
  echo "   no existe"
fi

# 5) Archivos locales (estado y temporales en infra/.generated/)
echo "── 5) Local: $WORKDIR"
if [ "$EJECUTAR" = "si" ]; then
  rm -rf "$WORKDIR"
  echo "   borrado"
else
  echo "[simulación] rm -rf $WORKDIR"
fi

if [ "$EJECUTAR" = "si" ]; then
  echo
  echo "── Verificación final (todo debe salir vacío o 'no existe')"
  sleep 5
  aws lightsail get-container-services --region "$REGION" \
    --query "containerServices[?starts_with(containerServiceName, '$PROYECTO')].[containerServiceName,state]" --output text
  aws cognito-idp list-user-pools --region "$REGION" --max-results 60 \
    --query "UserPools[?starts_with(Name, '$PROYECTO')].[Name,Id]" --output text
  aws iam list-roles --query "Roles[?starts_with(RoleName, '$PROYECTO')].RoleName" --output text
  echo "Listo. Si Lightsail aún aparece en estado DELETING, espera un minuto y vuelve a consultar."
fi
