#!/bin/bash
# Paso 2: Cognito. User Pool (login con email) + App Client público (sin secreto) + grupo admin + usuario evaluador.
# El backend llama InitiateAuth (USER_PASSWORD_AUTH), valida el ID token con aws-jwt-verify y lee `cognito:groups`:
#   grupo "admin" → chat + observatorio · sin grupo → solo chat.
# Uso: REGION=us-east-2 TEST_PASSWORD='Perxia#Reto03-2026' bash infra/cloudshell/02-cognito.sh
set -euo pipefail
# shellcheck source=infra/cloudshell/00-variables.sh
source "$(dirname "$0")/00-variables.sh"

guardar() { # guardar CLAVE VALOR → estado.env (sin duplicar)
  sed -i "/^export $1=/d" "$ESTADO"
  echo "export $1=\"$2\"" >>"$ESTADO"
}

# 2.1 User Pool: login con email, solo administradores crean usuarios, sin MFA,
#     contraseña ≥12 con mayúscula, minúscula, número y símbolo.
POOL_ID="$(aws cognito-idp list-user-pools --region "$REGION" --max-results 60 \
  --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text)"
if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
  POOL_ID="$(aws cognito-idp create-user-pool \
    --region "$REGION" \
    --pool-name "$POOL_NAME" \
    --username-attributes email \
    --policies 'PasswordPolicy={MinimumLength=12,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true,TemporaryPasswordValidityDays=3}' \
    --admin-create-user-config AllowAdminCreateUserOnly=true \
    --mfa-configuration OFF \
    --deletion-protection INACTIVE \
    --user-pool-tags "proyecto=$PROYECTO,desechable=true" \
    --query 'UserPool.Id' --output text)"
  echo "User Pool creado: $POOL_ID"
else
  echo "User Pool ya existía: $POOL_ID"
fi
guardar POOL_ID "$POOL_ID"

# 2.2 App Client público, sin secreto, solo usuario/contraseña + refresh
CLIENT_ID="$(aws cognito-idp list-user-pool-clients --region "$REGION" --user-pool-id "$POOL_ID" \
  --query "UserPoolClients[?ClientName=='$CLIENT_NAME'].ClientId | [0]" --output text)"
if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
  CLIENT_ID="$(aws cognito-idp create-user-pool-client \
    --region "$REGION" \
    --user-pool-id "$POOL_ID" \
    --client-name "$CLIENT_NAME" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --prevent-user-existence-errors ENABLED \
    --token-validity-units AccessToken=hours,IdToken=hours,RefreshToken=days \
    --access-token-validity 8 --id-token-validity 8 --refresh-token-validity 1 \
    --query 'UserPoolClient.ClientId' --output text)"
  echo "App Client creado: $CLIENT_ID"
else
  echo "App Client ya existía: $CLIENT_ID"
fi
guardar CLIENT_ID "$CLIENT_ID"

# 2.3 Grupo admin (acceso total: chat + observatorio)
if ! aws cognito-idp get-group --region "$REGION" --user-pool-id "$POOL_ID" --group-name "$GRUPO_ADMIN" >/dev/null 2>&1; then
  aws cognito-idp create-group --region "$REGION" --user-pool-id "$POOL_ID" --group-name "$GRUPO_ADMIN" \
    --description "Acceso completo: chat + observatorio" --query 'Group.GroupName' --output text
fi

# 2.4 Usuario de los evaluadores (sin correo de invitación, email verificado, contraseña permanente, grupo admin)
if ! aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL_ID" --username "$TEST_USER" >/dev/null 2>&1; then
  aws cognito-idp admin-create-user --region "$REGION" --user-pool-id "$POOL_ID" \
    --username "$TEST_USER" \
    --user-attributes "Name=email,Value=$TEST_USER" "Name=email_verified,Value=true" "Name=name,Value=Evaluador Periferia" \
    --message-action SUPPRESS --query 'User.Username' --output text
fi
if [ -z "${TEST_PASSWORD:-}" ]; then
  read -rsp "Contraseña para $TEST_USER (≥12, mayúscula, minúscula, número y símbolo; sugerida en INFRA.md): " TEST_PASSWORD
  echo
fi
aws cognito-idp admin-set-user-password --region "$REGION" --user-pool-id "$POOL_ID" \
  --username "$TEST_USER" --password "$TEST_PASSWORD" --permanent
aws cognito-idp admin-add-user-to-group --region "$REGION" --user-pool-id "$POOL_ID" \
  --username "$TEST_USER" --group-name "$GRUPO_ADMIN"

# 2.5 Prueba de inicio de sesión (solo imprime la vigencia, nunca los tokens)
PARAMS="$(jq -n --arg u "$TEST_USER" --arg p "$TEST_PASSWORD" '{USERNAME: $u, PASSWORD: $p}')"
vigencia="$(aws cognito-idp initiate-auth --region "$REGION" --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH --auth-parameters "$PARAMS" \
  --query 'AuthenticationResult.ExpiresIn' --output text)"
unset PARAMS
echo "Login OK (token válido por ${vigencia}s). Grupos de $TEST_USER:"
aws cognito-idp admin-list-groups-for-user --region "$REGION" --user-pool-id "$POOL_ID" \
  --username "$TEST_USER" --query 'Groups[].GroupName' --output text

echo
echo "Valores para GitHub (variables) / contenedor:"
echo "  COGNITO_REGION=$REGION"
echo "  COGNITO_USER_POOL_ID=$POOL_ID"
echo "  COGNITO_CLIENT_ID=$CLIENT_ID"
