# BORRADO de todo lo creado por el reto. Por defecto es SIMULACION: solo muestra que haria.
#   .\infra\powershell\99-eliminar.ps1             # simulacion
#   .\infra\powershell\99-eliminar.ps1 -Ejecutar   # borra (pide escribir perxia-reto03)
#
# Guardas:
#   - Solo nombres que empiezan por "perxia-reto03"; el estado local debe ser de esta cuenta y region.
#   - Cada recurso se verifica por nombre exacto Y tag proyecto=perxia-reto03 antes de borrarlo.
#   - El proveedor OIDC de GitHub SOLO se borra si tiene el tag del reto y el estado local no dice que ya existia.
param([switch]$Ejecutar)

. (Join-Path $PSScriptRoot "00-variables.ps1")

$e = Get-Estado

foreach ($n in @($SVC, $POOL_NAME, $CLIENT_NAME, $ROLE, $ROLE_POLICY)) {
  if (-not $n.StartsWith("perxia-reto03")) { throw "ABORTADO: '$n' no empieza por perxia-reto03. No se borra nada." }
}
if ($e["CUENTA"] -and $e["CUENTA"] -ne $ACCOUNT_ID) { throw ("ABORTADO: estado.json es de la cuenta " + $e["CUENTA"] + ", no de $ACCOUNT_ID.") }
if ($e["REGION"] -and $e["REGION"] -ne $REGION) { throw ("ABORTADO: estado.json es de la region " + $e["REGION"] + ", no de $REGION.") }
if ($e["LIGHTSAIL_SERVICIO"] -and $e["LIGHTSAIL_SERVICIO"] -ne $SVC) { throw "ABORTADO: el servicio registrado no coincide con $SVC." }
if ($e["ROLE_NAME"] -and $e["ROLE_NAME"] -ne $ROLE) { throw "ABORTADO: el rol registrado no coincide con $ROLE." }

function Invoke-Paso {
  param([string]$Descripcion, [scriptblock]$Accion)
  if ($Ejecutar) { Write-Host "+ $Descripcion"; & $Accion } else { Write-Host "[simulacion] $Descripcion" }
}

if ($Ejecutar) { $modo = "BORRAR" } else { $modo = "simulacion" }
Write-Host "Cuenta $ACCOUNT_ID - Region $REGION - Modo: $modo"
if ($Ejecutar) {
  $confirmacion = Read-Host "Escribe exactamente 'perxia-reto03' para confirmar el borrado"
  if ($confirmacion -ne "perxia-reto03") { throw "Confirmacion incorrecta. No se borra nada." }
}

# 1) Lightsail Container Service (borra tambien sus imagenes y despliegues)
Write-Host "-- 1) Lightsail: $SVC"
if (Test-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].state" --output text) {
  $tag = Invoke-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].tags[?key=='proyecto'].value | [0]" --output text
  if ($tag -eq $PROYECTO) {
    Invoke-Paso "aws lightsail delete-container-service --service-name $SVC" {
      Invoke-Aws lightsail delete-container-service --service-name $SVC | Out-Null
    }
  } else {
    Write-Host "   existe pero sin tag proyecto=${PROYECTO}: NO se borra (revisalo a mano)."
  }
} else { Write-Host "   no existe" }

# 2) Cognito User Pool (borra su App Client, el grupo admin y todos los usuarios, incluido el evaluador)
Write-Host "-- 2) Cognito: $POOL_NAME"
$pool = Invoke-Aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text
if ($pool -and $pool -ne "None") {
  if ($e["POOL_ID"] -and $e["POOL_ID"] -ne $pool) { Write-Host ("   aviso: el estado local registraba " + $e["POOL_ID"] + "; en AWS el pool con ese nombre es $pool") }
  $nombre = Invoke-Aws cognito-idp describe-user-pool --user-pool-id $pool --query "UserPool.Name" --output text
  $tag = Invoke-Aws cognito-idp describe-user-pool --user-pool-id $pool --query "UserPool.UserPoolTags.proyecto" --output text
  if ($nombre -eq $POOL_NAME -and $tag -eq $PROYECTO) {
    Invoke-Paso "aws cognito-idp delete-user-pool --user-pool-id $pool" {
      Invoke-Aws cognito-idp delete-user-pool --user-pool-id $pool | Out-Null
    }
  } else {
    Write-Host "   $pool no tiene nombre/tag del reto: NO se borra."
  }
} else { Write-Host "   no existe" }

# 3) Rol IAM: primero la politica inline, luego el rol (solo con tag del reto)
Write-Host "-- 3) IAM: rol $ROLE"
if (Test-Aws iam get-role --role-name $ROLE) {
  $tag = Invoke-Aws iam list-role-tags --role-name $ROLE --query "Tags[?Key=='proyecto'].Value | [0]" --output text
  if ($tag -eq $PROYECTO) {
    if (Test-Aws iam get-role-policy --role-name $ROLE --policy-name $ROLE_POLICY) {
      Invoke-Paso "aws iam delete-role-policy --role-name $ROLE --policy-name $ROLE_POLICY" {
        Invoke-Aws iam delete-role-policy --role-name $ROLE --policy-name $ROLE_POLICY | Out-Null
      }
    }
    Invoke-Paso "aws iam delete-role --role-name $ROLE" {
      Invoke-Aws iam delete-role --role-name $ROLE | Out-Null
    }
  } else {
    Write-Host "   el rol existe pero sin tag proyecto=${PROYECTO}: NO se borra."
  }
} else { Write-Host "   no existe" }

# 4) Proveedor OIDC de GitHub: SOLO si lo creo este reto
Write-Host "-- 4) IAM: proveedor OIDC de GitHub"
if (Test-Aws iam get-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN) {
  $tag = Invoke-Aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn $OIDC_ARN --query "Tags[?Key=='proyecto'].Value | [0]" --output text
  if ($e["OIDC_CREADO"] -eq "no") {
    Write-Host "   ya existia antes del reto (estado local OIDC_CREADO=no): se CONSERVA."
  } elseif ($tag -eq $PROYECTO) {
    if (-not $e["OIDC_CREADO"]) { Write-Host "   aviso: sin estado local; se decide solo por el tag proyecto=$PROYECTO." }
    Invoke-Paso "aws iam delete-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN" {
      Invoke-Aws iam delete-open-id-connect-provider --open-id-connect-provider-arn $OIDC_ARN | Out-Null
    }
  } else {
    Write-Host "   existe pero NO es del reto (sin tag proyecto=$PROYECTO): se CONSERVA."
  }
} else { Write-Host "   no existe" }

# 5) Archivos locales (estado y temporales)
Write-Host "-- 5) Local: $WORKDIR"
Invoke-Paso "borrar $WORKDIR" { Remove-Item -Recurse -Force $WORKDIR -ErrorAction SilentlyContinue }

if ($Ejecutar) {
  Write-Host ""
  Write-Host "-- Verificacion final (todo debe salir vacio)"
  Start-Sleep -Seconds 5
  Invoke-Aws lightsail get-container-services --query "containerServices[?starts_with(containerServiceName, '$PROYECTO')].[containerServiceName,state]" --output text
  Invoke-Aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?starts_with(Name, '$PROYECTO')].[Name,Id]" --output text
  Invoke-Aws iam list-roles --query "Roles[?starts_with(RoleName, '$PROYECTO')].RoleName" --output text
  Write-Host "Listo. Si Lightsail aparece en DELETING, espera un minuto y consulta con 90-estado.ps1."
}
