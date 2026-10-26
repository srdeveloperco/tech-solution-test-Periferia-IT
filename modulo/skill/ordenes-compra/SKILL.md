---
name: ordenes-compra
description: Conocimiento del proceso de órdenes de compra de Periferia en SAP (controles RC1–RC10, qué hacer ante cada bloqueo, glosario SAP y política de OC retroactivas). Úsalo al preparar o revisar una OC.
---
<!-- Generado por scripts/modulo.ts desde apps/backend. No editar a mano. -->

# Conocimiento del proceso: órdenes de compra en SAP

## El proceso

1. El **solicitante** envía un correo a compras con tres adjuntos: la solicitud (Excel), la cotización del proveedor y el correo de aprobación de su líder.
2. El **líder aprobador** ya respondió «Aprobado» por correo. El agente verifica esa aprobación; no la solicita.
3. La **analista administrativa** crea la OC en SAP y adjunta el correo de aprobación en PDF como evidencia.
4. **Contabilidad y auditoría** consultan el log de control (`control.csv`): una fila por cada intento, con su resultado.

Una OC se crea por cada compra. Los valores salen de la solicitud, la cotización y los maestros (proveedores, centros de costo, indicadores de IVA y condiciones de pago).

## Controles (RC1 a RC10)

| Regla | Qué verifica | Si falla | Qué sugerir |
|---|---|---|---|
| RC1 | El proveedor existe en el maestro (por NIT; si no hay NIT, por nombre) y está activo. | Bloqueo | Pedir a compras o datos maestros que cree o reactive el proveedor, y reprocesar. |
| RC2 | Hay aprobación, dice «Aprobado» y viene de un aprobador del centro de costo. | Bloqueo | Pedir al solicitante la aprobación de un líder autorizado para ese centro de costo. |
| RC3 | El valor total no supera el tope del aprobador en ese centro de costo. | Bloqueo | Escalar la aprobación a un aprobador con tope suficiente. |
| RC4 | La subárea pertenece al centro de costo. | Bloqueo | Pedir al solicitante corregir la subárea o el centro de costo en la solicitud. |
| RC5 | Cotización y solicitud difieren máximo 2 %. Sin cotización también se pregunta. | Confirmación | Mostrar ambos valores y pedir visto bueno; si no, pedir cotización actualizada. |
| RC6 | Si la solicitud no trae indicador de IVA, se toma el del proveedor. | Confirmación + derivado | Confirmar que el IVA del proveedor aplica a esta compra. |
| RC7 | Si no trae condiciones de pago, se toman las del proveedor. | Derivado (solo se informa) | Informar el valor tomado del maestro. |
| RC8 | Hay factura con fecha anterior a la solicitud: compra **retroactiva**. | Confirmación + marca en control | Confirmar y dejar la marca `retroactiva = true` para medición. |
| RC9 | La aprobación es de la misma fecha de la solicitud o posterior. | Confirmación | Preguntar si la aprobación previa es válida para esta compra. |
| RC10 | Cantidad × valor unitario = valor total (±1 peso). | Bloqueo | Pedir al solicitante corregir la solicitud. |

Los **bloqueos** impiden crear la OC. Las **confirmaciones** permiten crearla solo con el visto bueno explícito de la analista. Los **derivados** son valores completados desde maestros que se informan.

## Compras retroactivas

Una OC es retroactiva cuando la factura llegó antes de la solicitud: se compró primero y se formalizó después, saltándose la cotización y el control previo. La dirección quiere medir cuántas hay. El agente no las rechaza: pide confirmación, las crea si la analista acepta y las deja marcadas en el control. Decidir si se toleran o se rechazan es una decisión de la dirección, no del agente.

## Glosario SAP

- **OC (orden de compra, PO)**: documento de compra en SAP. Número desde 4500000001.
- **Sociedad 1000 / organización de compras 1000**: valores fijos de Periferia en este proceso.
- **Posición**: línea de la OC (10, 20, 30…). Texto breve de máximo 40 caracteres.
- **Centro de costo y subárea**: dónde se imputa el gasto.
- **Indicador de IVA**: C0 excluido, C1 IVA 19 %, C2 IVA 5 %.
- **Condiciones de pago**: Z000 inmediato, Z015 15 días, Z030 30 días, Z060 60 días.
- **Evidencia**: el correo de aprobación en PDF con su huella sha256, adjunto a la OC.
- **Idempotencia**: si la misma solicitud se intenta crear dos veces, SAP devuelve la OC existente.

## A quién acudir

- Proveedor inexistente o inactivo: datos maestros / compras.
- Aprobación faltante, insuficiente o de otra persona: el solicitante y su líder.
- Errores en la solicitud (subárea, cantidades, valores): el solicitante.
- Diferencias con la cotización: el solicitante, que puede pedir cotización actualizada al proveedor.
