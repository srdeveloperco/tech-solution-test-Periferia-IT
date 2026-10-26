#!/bin/bash
# Paso 1: crea el Lightsail Container Service (micro, 1 nodo) y espera a que esté listo.
# Uso: REGION=us-east-2 bash infra/cloudshell/01-lightsail.sh
set -euo pipefail
# shellcheck source=infra/cloudshell/00-variables.sh
source "$(dirname "$0")/00-variables.sh"

if aws lightsail get-container-services --region "$REGION" --service-name "$SVC" >/dev/null 2>&1; then
  echo "El servicio $SVC ya existe; no se crea de nuevo."
else
  aws lightsail create-container-service \
    --region "$REGION" \
    --service-name "$SVC" \
    --power micro \
    --scale 1 \
    --tags "key=proyecto,value=$PROYECTO" "key=desechable,value=true" \
    --query 'containerService.state' --output text
fi

printf "Esperando estado READY"
for _ in $(seq 1 60); do
  # --query evita imprimir la configuración del despliegue (que incluye variables de entorno).
  estado="$(aws lightsail get-container-services --region "$REGION" --service-name "$SVC" \
    --query 'containerServices[0].state' --output text)"
  case "$estado" in
    READY | RUNNING) echo " → $estado"; break ;;
  esac
  printf "."
  sleep 10
done

aws lightsail get-container-services --region "$REGION" --service-name "$SVC" \
  --query 'containerServices[0].{servicio:containerServiceName,estado:state,potencia:power,nodos:scale,url:url}' \
  --output table
