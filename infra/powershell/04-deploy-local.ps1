# Plan B: despliegue desde tu maquina con Docker local (si GitHub Actions no esta disponible).
# Requisitos: Docker Desktop corriendo, AWS CLI v2 con el perfil juan, lightsailctl (el script ayuda a instalarlo),
# y los pasos 01 y 02 hechos (servicio Lightsail y Cognito).
# Uso:
#   $env:ANTHROPIC_API_KEY = "..."     # opcional; si falta se pide oculta. Nunca se imprime.
#   $env:TEST_PASSWORD = '...'         # opcional; si existe, se prueba el login al final.
#   .\infra\powershell\04-deploy-local.ps1
. (Join-Path $PSScriptRoot "00-variables.ps1")

$esWindows = ($env:OS -eq "Windows_NT")

# --- 0) Valores de Cognito (del estado local o buscando por nombre) ---------------------------
$e = Get-Estado
$POOL_ID = $e["POOL_ID"]
$CLIENT_ID = $e["CLIENT_ID"]
if (-not $POOL_ID) {
  $POOL_ID = Invoke-Aws cognito-idp list-user-pools --max-results 60 `
    --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text
}
if (-not $POOL_ID -or $POOL_ID -eq "None") { throw "No hay User Pool $POOL_NAME. Corre primero 02-cognito.ps1." }
if (-not $CLIENT_ID) {
  $CLIENT_ID = Invoke-Aws cognito-idp list-user-pool-clients --user-pool-id $POOL_ID `
    --query "UserPoolClients[?ClientName=='$CLIENT_NAME'].ClientId | [0]" --output text
}
if (-not $CLIENT_ID -or $CLIENT_ID -eq "None") { throw "No hay App Client $CLIENT_NAME. Corre primero 02-cognito.ps1." }

# --- 1) Docker ------------------------------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "No se encontro Docker. Instala/abre Docker Desktop." }
if (-not (Test-Nativo { docker info })) { throw "Docker no responde. Abre Docker Desktop y espera a que este listo." }

# --- 2) lightsailctl (plugin que usa 'aws lightsail push-container-image') ------------------
if (-not (Get-Command lightsailctl -ErrorAction SilentlyContinue)) {
  if ($esWindows) {
    $destino = Join-Path $env:LOCALAPPDATA "lightsailctl"
    $r = Read-Host "Falta lightsailctl. Escribe 'si' para descargarlo en $destino y agregarlo a tu PATH"
    if ($r -ne "si") { throw "lightsailctl es necesario para subir la imagen a Lightsail." }
    if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing `
      -Uri "https://s3.us-west-2.amazonaws.com/lightsailctl/latest/windows-amd64/lightsailctl.exe" `
      -OutFile (Join-Path $destino "lightsailctl.exe")
    $env:Path = "$destino;$env:Path"
    $pathUsuario = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($pathUsuario -notlike "*$destino*") {
      [Environment]::SetEnvironmentVariable("Path", "$destino;$pathUsuario", "User")
    }
    Write-Host "lightsailctl instalado en $destino"
  } else {
    Write-Host "Instala lightsailctl y vuelve a ejecutar:"
    Write-Host "  macOS (Apple Silicon): sudo curl -fsSL https://s3.us-west-2.amazonaws.com/lightsailctl/latest/darwin-arm64/lightsailctl -o /usr/local/bin/lightsailctl && sudo chmod +x /usr/local/bin/lightsailctl"
    Write-Host "  macOS (Intel):         sudo curl -fsSL https://s3.us-west-2.amazonaws.com/lightsailctl/latest/darwin-amd64/lightsailctl -o /usr/local/bin/lightsailctl && sudo chmod +x /usr/local/bin/lightsailctl"
    Write-Host "  Linux (x86_64):        sudo curl -fsSL https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl -o /usr/local/bin/lightsailctl && sudo chmod +x /usr/local/bin/lightsailctl"
    throw "Falta lightsailctl."
  }
}

# --- 3) Imagen -------------------------------------------------------------------------------
$sello = Get-Date -Format "yyyyMMddHHmm"
$etiqueta = "${SVC}:local-$sello"
Write-Host "Construyendo $etiqueta ..."
& docker build --platform linux/amd64 -t $etiqueta $RAIZ
if ($LASTEXITCODE -ne 0) { throw "docker build fallo (codigo $LASTEXITCODE)." }

# --- 4) Subir a Lightsail y tomar la referencia ":servicio.app.N" ----------------------------
Write-Host "Subiendo la imagen a Lightsail ..."
$ErrorActionPreference = "Continue"
$salida = & aws lightsail push-container-image --service-name $SVC --label app --image $etiqueta `
  --profile $PERFIL --region $REGION 2>&1
$codigoPush = $LASTEXITCODE
$ErrorActionPreference = "Stop"
$texto = ($salida | ForEach-Object { "$_" }) -join "`n"
if ($codigoPush -ne 0) { Write-Host $texto; throw "push-container-image fallo (codigo $codigoPush)." }
$coincidencias = [regex]::Matches($texto, ":" + [regex]::Escape($SVC) + "\.app\.\d+")
if ($coincidencias.Count -eq 0) { Write-Host $texto; throw "No se encontro la referencia de la imagen en la salida." }
$IMAGEN = $coincidencias[$coincidencias.Count - 1].Value
Write-Host "Imagen registrada: $IMAGEN"

# --- 5) containers.json (la clave nunca se imprime; el archivo se borra al terminar) --------
if ($env:ANTHROPIC_API_KEY) { $clave = $env:ANTHROPIC_API_KEY } else { $clave = Read-Secreto "ANTHROPIC_API_KEY (no se mostrara)" }
if (-not $clave) { throw "Falta ANTHROPIC_API_KEY." }

$cfg = (Read-Utf8 (Join-Path $RAIZ "infra/lightsail/containers.template.json")) | ConvertFrom-Json
$cfg.app.image = $IMAGEN
$vars = $cfg.app.environment
$vars.ANTHROPIC_API_KEY = $clave
$vars.AUTH_MODO = "cognito"
$vars.NODE_ENV = "production"
$vars.COGNITO_REGION = $REGION
$vars.COGNITO_USER_POOL_ID = $POOL_ID
$vars.COGNITO_CLIENT_ID = $CLIENT_ID
if ($env:PRESUPUESTO_USD) { $vars.PRESUPUESTO_USD = $env:PRESUPUESTO_USD }
# Modelos por agente: se respetan los de la plantilla salvo que definas la variable de entorno.
foreach ($nombre in @("LLM_MODELO_ROUTER", "LLM_MODELO_OPERADOR", "LLM_MODELO_ASESOR", "LLM_MODELO_CONVERSADOR")) {
  $valor = [Environment]::GetEnvironmentVariable($nombre)
  if ($valor) { $vars.$nombre = $valor }
}

$rutaContenedores = Join-Path $WORKDIR "containers.json"
$rutaEndpoint = Join-Path $RAIZ "infra/lightsail/endpoint.json"
Write-Utf8 $rutaContenedores ($cfg | ConvertTo-Json -Depth 10)
$clave = $null
try {
  # --query: la respuesta completa incluye las variables de entorno; solo pedimos la version.
  $VERSION = Invoke-Aws lightsail create-container-service-deployment --service-name $SVC `
    --containers "file://$rutaContenedores" `
    --public-endpoint "file://$rutaEndpoint" `
    --query "containerService.nextDeployment.version" --output text
} finally {
  Remove-Item -Force $rutaContenedores -ErrorAction SilentlyContinue
}
Write-Host "Despliegue version $VERSION en curso (2 a 5 minutos) ..."

# --- 6) Esperar a que la version quede ACTIVE -----------------------------------------------
$listo = $false
for ($i = 0; $i -lt 60; $i++) {
  $fila = Invoke-Aws lightsail get-container-services --service-name $SVC `
    --query "containerServices[0].[currentDeployment.version, currentDeployment.state, nextDeployment.state]" --output text
  $partes = $fila -split "\s+"
  $actual = $partes[0]; $estado = $partes[1]; $siguiente = $partes[2]
  Write-Host "  actual=$actual estado=$estado siguiente=$siguiente"
  if ($actual -eq $VERSION -and $estado -eq "ACTIVE") { $listo = $true; break }
  if ($siguiente -eq "FAILED" -or ($siguiente -eq "None" -and $actual -ne $VERSION)) {
    throw "El despliegue $VERSION fallo. Logs: aws lightsail get-container-log --service-name $SVC --container-name app --profile $PERFIL --region $REGION"
  }
  Start-Sleep -Seconds 10
}
if (-not $listo) { throw "Tiempo agotado esperando el despliegue $VERSION." }

# --- 7) URL y pruebas de humo ---------------------------------------------------------------
$URL = (Invoke-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].url" --output text).TrimEnd([char]"/")
Set-Estado "URL" $URL
Write-Host ""
Write-Host ("/api/health         -> " + (Get-CodigoHttp "$URL/api/health") + "  (esperado 200)")
Write-Host ("/api/casos sin token -> " + (Get-CodigoHttp "$URL/api/casos") + "  (esperado 401)")
if ($env:TEST_PASSWORD) {
  $cuerpo = [ordered]@{ usuario = $TEST_USER; clave = $env:TEST_PASSWORD } | ConvertTo-Json
  Write-Host ("login evaluador     -> " + (Get-CodigoHttp "$URL/api/auth/login" "POST" $cuerpo) + "  (esperado 200)")
}
Write-Host ""
Write-Host "Listo: $URL"
Write-Host "Usuario: $TEST_USER"
