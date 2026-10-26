# Inventario: lo registrado en infra/.generated/estado.json contra lo que existe en AWS (solo lectura, sin secretos).
# Uso:  .\infra\powershell\90-estado.ps1
. (Join-Path $PSScriptRoot "00-variables.ps1")

$e = Get-Estado
$filas = New-Object System.Collections.Generic.List[object]

function Add-Fila {
  param([string]$Recurso, [string]$Nombre, [string]$Registrado, [string]$EnAws, [string]$Tag)
  $filas.Add([pscustomobject]@{ Recurso = $Recurso; Nombre = $Nombre; Registrado = $Registrado; EnAWS = $EnAws; TagProyecto = $Tag })
}

# 1) Lightsail
if (Test-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].state" --output text) {
  $estado = Invoke-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].state" --output text
  $tag = Invoke-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].tags[?key=='proyecto'].value | [0]" --output text
  Add-Fila "Lightsail container service" $SVC ([string]$e["LIGHTSAIL_CREADO"]) "existe ($estado)" $tag
} else {
  Add-Fila "Lightsail container service" $SVC ([string]$e["LIGHTSAIL_CREADO"]) "no existe" "-"
}

# 2) Cognito (pool + app client + grupo + usuario)
$pool = Invoke-Aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text
if ($pool -and $pool -ne "None") {
  $tag = Invoke-Aws cognito-idp describe-user-pool --user-pool-id $pool --query "UserPool.UserPoolTags.proyecto" --output text
  Add-Fila "Cognito User Pool" "$POOL_NAME ($pool)" ([string]$e["POOL_ID"]) "existe" $tag
  $cliente = Invoke-Aws cognito-idp list-user-pool-clients --user-pool-id $pool --query "UserPoolClients[?ClientName=='$CLIENT_NAME'].ClientId | [0]" --output text
  Add-Fila "  App Client" "$CLIENT_NAME ($cliente)" ([string]$e["CLIENT_ID"]) "existe" "(del pool)"
  $grupo = Test-Aws cognito-idp get-group --user-pool-id $pool --group-name $GRUPO_ADMIN
  Add-Fila "  Grupo" $GRUPO_ADMIN ([string]$e["GRUPO_ADMIN"]) ($(if ($grupo) { "existe" } else { "no existe" })) "(del pool)"
  $usuario = Test-Aws cognito-idp admin-get-user --user-pool-id $pool --username $TEST_USER
  Add-Fila "  Usuario evaluador" $TEST_USER ([string]$e["TEST_USER"]) ($(if ($usuario) { "existe" } else { "no existe" })) "(del pool)"
} else {
  Add-Fila "Cognito User Pool" $POOL_NAME ([string]$e["POOL_ID"]) "no existe" "-"
}

# 3) Rol IAM
if (Test-Aws iam get-role --role-name $ROLE) {
  $tag = Invoke-Aws iam list-role-tags --role-name $ROLE --query "Tags[?Key=='proyecto'].Value | [0]" --output text
  Add-Fila "IAM role (+ politica inline)" $ROLE ([string]$e["ROLE_ARN"]) "existe" $tag
} else {
  Add-Fila "IAM role (+ politica inline)" $ROLE ([string]$e["ROLE_ARN"]) "no existe" "-"
}

# 4) Proveedor OIDC de GitHub
if (Test-Aws iam get-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN) {
  $tag = Invoke-Aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn $OIDC_ARN --query "Tags[?Key=='proyecto'].Value | [0]" --output text
  if ($tag -eq $PROYECTO -and $e["OIDC_CREADO"] -ne "no") { $nota = "existe (del reto: se borra)" } else { $nota = "existe (NO es del reto: se conserva)" }
  Add-Fila "IAM OIDC provider" "token.actions.githubusercontent.com" ("OIDC_CREADO=" + [string]$e["OIDC_CREADO"]) $nota $tag
} else {
  Add-Fila "IAM OIDC provider" "token.actions.githubusercontent.com" ("OIDC_CREADO=" + [string]$e["OIDC_CREADO"]) "no existe" "-"
}

Write-Host ""
Write-Host "Cuenta $ACCOUNT_ID - Region $REGION - Estado local: $ESTADO"
$filas | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
if ($e["URL"]) { Write-Host ("URL registrada: " + $e["URL"]) }
Write-Host "No se crean VPC, ECR, S3, Lambda ni bases de datos gestionadas."
