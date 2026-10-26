# Variables y utilidades compartidas. Se carga con punto (dot-source) desde cada script:
#   . .\infra\powershell\00-variables.ps1
# Compatible con Windows PowerShell 5.1 y PowerShell 7. Archivo en ASCII a proposito
# (PowerShell 5.1 lee los .ps1 sin BOM como ANSI y los acentos pueden romper el parseo).
#
# Region por defecto: us-east-2 (confirmada sin productos de produccion). Para cambiarla:
#   $env:AWS_REGION = "otra-region"

$ErrorActionPreference = "Stop"

# Perfil de AWS CLI del usuario (admin, ya autenticado). Ademas se pasa --profile en cada llamada.
$PERFIL = "juan"
$env:AWS_PROFILE = $PERFIL

if (-not $env:AWS_REGION) { $env:AWS_REGION = "us-east-2" }
$REGION = $env:AWS_REGION
$env:AWS_DEFAULT_REGION = $REGION

# Nombres exactos de TODO lo que se crea (prefijo unico perxia-reto03).
$PROYECTO = "perxia-reto03"
$SVC = "perxia-reto03-oc-agent"                # Lightsail Container Service
$POOL_NAME = "perxia-reto03-usuarios"          # Cognito User Pool
$CLIENT_NAME = "perxia-reto03-web"             # Cognito App Client (publico, sin secreto)
$GRUPO_ADMIN = "admin"                         # Grupo con acceso total (chat + observatorio)
$ROLE = "perxia-reto03-gha-deploy"             # Rol IAM para GitHub Actions (OIDC)
$ROLE_POLICY = "perxia-reto03-lightsail-deploy" # Politica inline del rol
$REPO = "srdeveloperco/tech-solution-test-Periferia-IT"
if ($env:TEST_USER) { $TEST_USER = $env:TEST_USER } else { $TEST_USER = "evaluador@periferia-ficticia.com" }

# Raiz del repo. Estado y temporales en infra/.generated/ (ignorado por git).
$RAIZ = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") "..")).Path
$WORKDIR = Join-Path (Join-Path $RAIZ "infra") ".generated"
if (-not (Test-Path $WORKDIR)) { New-Item -ItemType Directory -Path $WORKDIR | Out-Null }
# Inventario de lo que ESTOS scripts crearon de verdad (IDs/ARNs). 99-eliminar lo lee y ademas verifica nombre/tag.
$ESTADO = Join-Path $WORKDIR "estado.json"

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

# Ejecuta aws con --profile y --region explicitos. Lanza si el codigo de salida no es 0.
function Invoke-Aws {
  $ErrorActionPreference = "Continue"
  $salida = & aws @args --profile $PERFIL --region $REGION
  if ($LASTEXITCODE -ne 0) {
    throw ("Fallo: aws " + ($args[0..1] -join " ") + " (codigo $LASTEXITCODE)")
  }
  if ($null -eq $salida) { return "" }
  return (($salida | Out-String).Trim())
}

# Devuelve $true si el comando aws termina bien (para comprobar si algo existe). No imprime nada.
function Test-Aws {
  $ErrorActionPreference = "Continue"
  & aws @args --profile $PERFIL --region $REGION 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

# Ejecuta un comando nativo descartando toda su salida y devuelve $true si termino bien.
# (En 5.1, redirigir stderr con ErrorActionPreference=Stop lo convierte en error terminante.)
function Test-Nativo {
  param([scriptblock]$Comando)
  $ErrorActionPreference = "Continue"
  & $Comando *> $null
  return ($LASTEXITCODE -eq 0)
}

# Escribe UTF-8 SIN BOM (Out-File en 5.1 agrega BOM y el AWS CLI falla al leer file://).
function Write-Utf8 {
  param([string]$Ruta, [string]$Contenido)
  $codificacion = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Ruta, $Contenido, $codificacion)
}

function Read-Utf8 {
  param([string]$Ruta)
  return [System.IO.File]::ReadAllText($Ruta)
}

# Estado de lo creado (LIGHTSAIL_*, POOL_*, CLIENT_ID, ROLE_*, OIDC_*) en infra/.generated/estado.json
function Get-Estado {
  $h = @{}
  if (Test-Path $ESTADO) {
    $o = (Read-Utf8 $ESTADO) | ConvertFrom-Json
    foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }
  }
  return $h
}

function Set-Estado {
  param([string]$Clave, [string]$Valor)
  $h = Get-Estado
  $h[$Clave] = $Valor
  $h["CUENTA"] = $ACCOUNT_ID
  $h["REGION"] = $REGION
  $h["ACTUALIZADO"] = (Get-Date).ToString("s")
  Write-Utf8 $ESTADO ($h | ConvertTo-Json)
}

# Lee un secreto oculto y lo devuelve en texto plano (compatible 5.1 y 7, Windows/macOS/Linux).
function Read-Secreto {
  param([string]$Mensaje)
  $seguro = Read-Host -Prompt $Mensaje -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

# Codigo HTTP de una peticion (200, 401, ...) sin lanzar. 0 si no hubo respuesta.
function Get-CodigoHttp {
  param([string]$Url, [string]$Metodo = "GET", [string]$Cuerpo = $null)
  try {
    if ($Cuerpo) {
      $r = Invoke-WebRequest -Uri $Url -Method $Metodo -UseBasicParsing -ContentType "application/json" -Body $Cuerpo -TimeoutSec 20
    } else {
      $r = Invoke-WebRequest -Uri $Url -Method $Metodo -UseBasicParsing -TimeoutSec 20
    }
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

# ---------------------------------------------------------------------------
# Identidad y confirmacion (una vez por ventana de PowerShell)
# ---------------------------------------------------------------------------

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "No se encontro AWS CLI v2 (comando 'aws'). Instalalo y vuelve a intentar."
}

$ACCOUNT_ID = Invoke-Aws sts get-caller-identity --query Account --output text
$IDENTIDAD = Invoke-Aws sts get-caller-identity --query Arn --output text
$OIDC_ARN = "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

$marca = "$ACCOUNT_ID/$REGION/$PERFIL"
if ($env:PERXIA_CONFIRMADO -ne $marca) {
  Write-Host ""
  Write-Host "  Perfil : $PERFIL"
  Write-Host "  Cuenta : $ACCOUNT_ID"
  Write-Host "  Usuario: $IDENTIDAD"
  Write-Host "  Region : $REGION"
  Write-Host "  Prefijo: $PROYECTO (solo se crean/borran recursos con este prefijo y tag proyecto=$PROYECTO)"
  Write-Host ""
  $respuesta = Read-Host "Escribe 'si' para continuar en ESTA cuenta y region"
  if ($respuesta -ne "si") { throw "Cancelado: no se hizo ningun cambio." }
  $env:PERXIA_CONFIRMADO = $marca
}
