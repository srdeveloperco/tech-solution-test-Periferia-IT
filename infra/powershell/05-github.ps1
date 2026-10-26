# Paso 5 (opcional): configura GitHub con la CLI 'gh' (environment, variables y secretos).
# Si no tienes gh, haz lo mismo en la UI (INFRA.md, seccion "Configurar GitHub").
# Requisitos: gh instalado y autenticado (gh auth login) con permisos de admin en el repo; pasos 02 y 03 hechos.
# Uso:  .\infra\powershell\05-github.ps1
. (Join-Path $PSScriptRoot "00-variables.ps1")

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "No se encontro 'gh'. Instala GitHub CLI (https://cli.github.com) o configura GitHub desde la UI."
}
if (-not (Test-Nativo { gh auth status })) { throw "gh no esta autenticado. Ejecuta: gh auth login" }

$e = Get-Estado
foreach ($clave in @("ROLE_ARN", "POOL_ID", "CLIENT_ID")) {
  if (-not $e[$clave]) { throw "Falta $clave en infra/.generated/estado.json. Corre 02-cognito.ps1 y 03-oidc-rol.ps1." }
}

function Invoke-Gh {
  & gh @args
  if ($LASTEXITCODE -ne 0) { throw ("Fallo: gh " + ($args[0..1] -join " ") + " (codigo $LASTEXITCODE)") }
}

# 1) Environment aws-demo (la trust policy del rol solo acepta este environment)
Invoke-Gh api --method PUT "repos/$REPO/environments/aws-demo" --silent

# 2) Variables de repositorio (el workflow decide si despliega antes de entrar al environment)
$variables = [ordered]@{
  AWS_ROLE_ARN         = $e["ROLE_ARN"]
  AWS_REGION           = $REGION
  LIGHTSAIL_SERVICE    = $SVC
  COGNITO_REGION       = $REGION
  COGNITO_USER_POOL_ID = $e["POOL_ID"]
  COGNITO_CLIENT_ID    = $e["CLIENT_ID"]
  PRESUPUESTO_USD      = "10"
  TEST_USER            = $TEST_USER
}
foreach ($nombre in $variables.Keys) {
  Invoke-Gh variable set $nombre --repo $REPO --body $variables[$nombre]
  Write-Host "variable $nombre = $($variables[$nombre])"
}

# 3) Secretos del environment (gh los pide de forma interactiva; no quedan en el historial)
Write-Host ""
Write-Host "Pega la clave del modelo cuando gh la pida (ANTHROPIC_API_KEY):"
Invoke-Gh secret set ANTHROPIC_API_KEY --repo $REPO --env aws-demo
if ($env:TEST_PASSWORD) {
  Invoke-Gh secret set TEST_PASSWORD --repo $REPO --env aws-demo --body $env:TEST_PASSWORD
  Write-Host "secreto TEST_PASSWORD configurado (el deploy probara el login)."
} else {
  Write-Host "TEST_PASSWORD no definido: el deploy omitira la prueba de login (opcional)."
}

Write-Host ""
Write-Host "GitHub listo. Haz push a la rama o re-ejecuta el workflow Deploy para desplegar."
