# Paso 1: Lightsail Container Service (micro, 1 nodo, tags del proyecto) y espera a READY.
# Uso:  .\infra\powershell\01-lightsail.ps1        (region por defecto us-east-2)
. (Join-Path $PSScriptRoot "00-variables.ps1")

if (Test-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].state" --output text) {
  Write-Host "El servicio $SVC ya existe; no se crea de nuevo."
  if ((Get-Estado)["LIGHTSAIL_CREADO"] -ne "si") { Set-Estado "LIGHTSAIL_CREADO" "existia" }
} else {
  $estado = Invoke-Aws lightsail create-container-service `
    --service-name $SVC `
    --power micro `
    --scale 1 `
    --tags "key=proyecto,value=$PROYECTO" "key=desechable,value=true" `
    --query "containerService.state" --output text
  Write-Host "Creado: $SVC ($estado)"
  Set-Estado "LIGHTSAIL_CREADO" "si"
}
Set-Estado "LIGHTSAIL_SERVICIO" $SVC
Set-Estado "LIGHTSAIL_ARN" (Invoke-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].arn" --output text)

Write-Host -NoNewline "Esperando estado READY"
for ($i = 0; $i -lt 60; $i++) {
  # Siempre con --query: la respuesta completa incluye las variables de entorno del contenedor.
  $estado = Invoke-Aws lightsail get-container-services --service-name $SVC --query "containerServices[0].state" --output text
  if ($estado -eq "READY" -or $estado -eq "RUNNING") { Write-Host " -> $estado"; break }
  Write-Host -NoNewline "."
  Start-Sleep -Seconds 10
}

Invoke-Aws lightsail get-container-services --service-name $SVC `
  --query "containerServices[0].{servicio:containerServiceName,estado:state,potencia:power,nodos:scale,url:url}" `
  --output table
