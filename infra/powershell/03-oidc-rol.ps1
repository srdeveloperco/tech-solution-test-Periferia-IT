# Paso 3: identidad de GitHub Actions en AWS (OIDC, sin llaves de larga duracion).
# - Proveedor OIDC de GitHub: si YA existe (puede usarlo produccion) se reutiliza y NUNCA se borra.
# - Rol perxia-reto03-gha-deploy: solo este repo + environment aws-demo; solo desplegar en Lightsail en la region.
# Uso:  .\infra\powershell\03-oidc-rol.ps1        (region por defecto us-east-2)
. (Join-Path $PSScriptRoot "00-variables.ps1")

# 3.1 Proveedor OIDC
if (Test-Aws iam get-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN) {
  Write-Host "El proveedor OIDC de GitHub ya existe en la cuenta: se REUTILIZA y no se borrara al final."
  if ((Get-Estado)["OIDC_CREADO"] -ne "si") { Set-Estado "OIDC_CREADO" "no" }
} else {
  Invoke-Aws iam create-open-id-connect-provider `
    --url https://token.actions.githubusercontent.com `
    --client-id-list sts.amazonaws.com `
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd `
    --tags "Key=proyecto,Value=$PROYECTO" "Key=desechable,Value=true" `
    --query "OpenIDConnectProviderArn" --output text | Out-Null
  Set-Estado "OIDC_CREADO" "si"
  Write-Host "Proveedor OIDC creado por este reto (tag proyecto=$PROYECTO)."
}
Set-Estado "OIDC_ARN" $OIDC_ARN

# 3.2 Politicas desde las plantillas del repo (UTF-8 sin BOM)
$rutaTrust = Join-Path $WORKDIR "trust-policy.json"
$rutaPolitica = Join-Path $WORKDIR "deploy-policy.json"
$trust = (Read-Utf8 (Join-Path $RAIZ "infra/iam/trust-policy.template.json")).Replace("__ACCOUNT_ID__", $ACCOUNT_ID)
$politica = (Read-Utf8 (Join-Path $RAIZ "infra/iam/deploy-policy.template.json")).Replace("__REGION__", $REGION)
Write-Utf8 $rutaTrust $trust
Write-Utf8 $rutaPolitica $politica

# 3.3 Rol con trust policy limitada al repo y al environment aws-demo
if (Test-Aws iam get-role --role-name $ROLE) {
  Invoke-Aws iam update-assume-role-policy --role-name $ROLE --policy-document "file://$rutaTrust" | Out-Null
  Write-Host "Rol $ROLE ya existia: trust policy actualizada."
} else {
  Invoke-Aws iam create-role `
    --role-name $ROLE `
    --description "GitHub Actions despliega el reto 03 en Lightsail (desechable)" `
    --assume-role-policy-document "file://$rutaTrust" `
    --max-session-duration 3600 `
    --tags "Key=proyecto,Value=$PROYECTO" "Key=desechable,Value=true" `
    --query "Role.Arn" --output text | Out-Null
  Write-Host "Rol creado: $ROLE"
  Set-Estado "ROLE_CREADO" "si"
}

# 3.4 Politica inline minima (solo Lightsail, solo en la region del reto)
Invoke-Aws iam put-role-policy --role-name $ROLE --policy-name $ROLE_POLICY `
  --policy-document "file://$rutaPolitica" | Out-Null

$ROLE_ARN = Invoke-Aws iam get-role --role-name $ROLE --query "Role.Arn" --output text
Set-Estado "ROLE_NAME" $ROLE
Set-Estado "ROLE_POLICY" $ROLE_POLICY
Set-Estado "ROLE_ARN" $ROLE_ARN

$e = Get-Estado
Write-Host ""
Write-Host "Valores para GitHub (Settings > Secrets and variables > Actions > Variables):"
Write-Host "  AWS_ROLE_ARN=$ROLE_ARN"
Write-Host "  AWS_REGION=$REGION"
Write-Host "  LIGHTSAIL_SERVICE=$SVC"
Write-Host "  COGNITO_REGION=$REGION"
Write-Host ("  COGNITO_USER_POOL_ID=" + $e["POOL_ID"])
Write-Host ("  COGNITO_CLIENT_ID=" + $e["CLIENT_ID"])
Write-Host "  PRESUPUESTO_USD=10"
