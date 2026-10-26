# Paso 2: Cognito. User Pool (login con email) + App Client publico sin secreto + grupo admin + usuario evaluador.
# El backend llama InitiateAuth (USER_PASSWORD_AUTH), valida el ID token y lee cognito:groups:
#   grupo "admin" -> chat + observatorio; sin grupo -> solo chat.
# Uso (region por defecto us-east-2):
#   $env:TEST_PASSWORD = 'Perxia#Reto03-2026'     # opcional; si falta se pide oculta
#   .\infra\powershell\02-cognito.ps1
. (Join-Path $PSScriptRoot "00-variables.ps1")

# 2.1 User Pool: login con email, solo administradores crean usuarios, sin MFA,
#     contrasena >= 12 con mayuscula, minuscula, numero y simbolo.
$POOL_ID = Invoke-Aws cognito-idp list-user-pools --max-results 60 `
  --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text
if (-not $POOL_ID -or $POOL_ID -eq "None") {
  $POOL_ID = Invoke-Aws cognito-idp create-user-pool `
    --pool-name $POOL_NAME `
    --username-attributes email `
    --policies "PasswordPolicy={MinimumLength=12,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true,TemporaryPasswordValidityDays=3}" `
    --admin-create-user-config AllowAdminCreateUserOnly=true `
    --mfa-configuration OFF `
    --deletion-protection INACTIVE `
    --user-pool-tags "proyecto=$PROYECTO,desechable=true" `
    --query "UserPool.Id" --output text
  Write-Host "User Pool creado: $POOL_ID"
  Set-Estado "POOL_CREADO" "si"
} else {
  Write-Host "User Pool ya existia: $POOL_ID"
  if ((Get-Estado)["POOL_CREADO"] -ne "si") { Set-Estado "POOL_CREADO" "existia" }
}
Set-Estado "POOL_NAME" $POOL_NAME
Set-Estado "POOL_ID" $POOL_ID
Set-Estado "POOL_ARN" (Invoke-Aws cognito-idp describe-user-pool --user-pool-id $POOL_ID --query "UserPool.Arn" --output text)

# 2.2 App Client publico, sin secreto, solo usuario/contrasena + refresh
$CLIENT_ID = Invoke-Aws cognito-idp list-user-pool-clients --user-pool-id $POOL_ID `
  --query "UserPoolClients[?ClientName=='$CLIENT_NAME'].ClientId | [0]" --output text
if (-not $CLIENT_ID -or $CLIENT_ID -eq "None") {
  $CLIENT_ID = Invoke-Aws cognito-idp create-user-pool-client `
    --user-pool-id $POOL_ID `
    --client-name $CLIENT_NAME `
    --no-generate-secret `
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH `
    --prevent-user-existence-errors ENABLED `
    --token-validity-units "AccessToken=hours,IdToken=hours,RefreshToken=days" `
    --access-token-validity 8 --id-token-validity 8 --refresh-token-validity 1 `
    --query "UserPoolClient.ClientId" --output text
  Write-Host "App Client creado: $CLIENT_ID"
} else {
  Write-Host "App Client ya existia: $CLIENT_ID"
}
Set-Estado "CLIENT_NAME" $CLIENT_NAME
Set-Estado "CLIENT_ID" $CLIENT_ID

# 2.3 Grupo admin
if (-not (Test-Aws cognito-idp get-group --user-pool-id $POOL_ID --group-name $GRUPO_ADMIN)) {
  Invoke-Aws cognito-idp create-group --user-pool-id $POOL_ID --group-name $GRUPO_ADMIN `
    --description "Acceso completo: chat + observatorio" --query "Group.GroupName" --output text | Out-Null
  Write-Host "Grupo creado: $GRUPO_ADMIN"
}

# 2.4 Usuario de los evaluadores: email verificado, sin correo de invitacion, clave permanente, grupo admin
if (-not (Test-Aws cognito-idp admin-get-user --user-pool-id $POOL_ID --username $TEST_USER)) {
  Invoke-Aws cognito-idp admin-create-user --user-pool-id $POOL_ID `
    --username $TEST_USER `
    --user-attributes "Name=email,Value=$TEST_USER" "Name=email_verified,Value=true" "Name=name,Value=Evaluador Periferia" `
    --message-action SUPPRESS --query "User.Username" --output text | Out-Null
  Write-Host "Usuario creado: $TEST_USER"
}

if ($env:TEST_PASSWORD) {
  $TEST_PASSWORD = $env:TEST_PASSWORD
} else {
  $TEST_PASSWORD = Read-Secreto "Clave para $TEST_USER (>=12, mayuscula, minuscula, numero y simbolo)"
}
Invoke-Aws cognito-idp admin-set-user-password --user-pool-id $POOL_ID `
  --username $TEST_USER --password $TEST_PASSWORD --permanent | Out-Null
Invoke-Aws cognito-idp admin-add-user-to-group --user-pool-id $POOL_ID `
  --username $TEST_USER --group-name $GRUPO_ADMIN | Out-Null

# 2.5 Prueba de login (solo imprime la vigencia y los grupos, nunca los tokens).
#     Los parametros van en un archivo temporal UTF-8 sin BOM que se borra enseguida.
$rutaAuth = Join-Path $WORKDIR "auth.json"
$auth = [ordered]@{ USERNAME = $TEST_USER; PASSWORD = $TEST_PASSWORD } | ConvertTo-Json
Write-Utf8 $rutaAuth $auth
try {
  $vigencia = Invoke-Aws cognito-idp initiate-auth --client-id $CLIENT_ID --auth-flow USER_PASSWORD_AUTH `
    --auth-parameters "file://$rutaAuth" --query "AuthenticationResult.ExpiresIn" --output text
} finally {
  Remove-Item -Force $rutaAuth -ErrorAction SilentlyContinue
}
$grupos = Invoke-Aws cognito-idp admin-list-groups-for-user --user-pool-id $POOL_ID `
  --username $TEST_USER --query "Groups[].GroupName" --output text
Write-Host "Login OK (token valido por ${vigencia}s). Grupos de ${TEST_USER}: $grupos"
Set-Estado "GRUPO_ADMIN" $GRUPO_ADMIN
Set-Estado "TEST_USER" $TEST_USER

Write-Host ""
Write-Host "Valores para GitHub (variables) y el contenedor:"
Write-Host "  COGNITO_REGION=$REGION"
Write-Host "  COGNITO_USER_POOL_ID=$POOL_ID"
Write-Host "  COGNITO_CLIENT_ID=$CLIENT_ID"
