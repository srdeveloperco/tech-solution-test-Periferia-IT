---
name: nueva-regla-control
description: Agregar o modificar una regla de control de órdenes de compra (RC1–RC10 o una nueva RC) de punta a punta. Úsala cuando cambie una validación, un umbral, el tipo de una regla (bloqueo, confirmación o derivado) o cómo se informa al usuario.
---

# Cambiar una regla de control de punta a punta

Una regla vive en cinco lugares. Si tocas uno, revisa los cinco, en este orden:

1. **Dominio puro** (`packages/domain/src/`)
   - La regla es una función pura: recibe paquete + maestros y devuelve hallazgos. Sin IO.
   - Umbrales como constantes nombradas (`TOLERANCIA_COTIZACION = 0.02`, `TOLERANCIA_MONTO = 1`).
   - Tipo correcto: **bloqueo** (impide crear), **confirmación** (requiere `confirmado = true` del humano) o **derivado** (valor completado desde maestros que se informa).
   - Cada hallazgo trae `codigo`, `titulo`, `detalle`, `accion_sugerida` y, si compara dos valores, `comparacion`.
   - Actualiza la fila de la regla en `controles` (estado `ok | bloqueo | confirmacion | derivado | no_aplica`).

2. **Test** (opcional en esta fase): si existe suite, agrega un caso que pasa y uno que falla junto a la regla (`*.test.ts`).

3. **Conocimiento** (`apps/backend/src/knowledge/ordenes-compra.md`): explica la regla en lenguaje de negocio, qué la dispara y qué hacer. El agente lo consulta.

4. **Comportamiento** (`apps/backend/agent/*.md`): solo si cambia cómo debe conversar (por ejemplo, una confirmación nueva que debe preguntar con ambos valores). No dupliques la regla en el prompt: el prompt dice *cómo* actuar, el dominio decide *qué* pasa.

5. **Verificación**
   - `bun run demo.ts`: confirma el resultado esperado por caso (sol-001 crea, sol-002/003 bloquean, sol-004/005/006 piden confirmación; sol-005 queda `retroactiva = true`).
   - `bun run verify` en verde.
   - Si cambió la matriz de controles, actualiza la sección 5 de `SOLUCION.md`.
   - `bun run modulo:build` si cambió el prompt o el conocimiento (el módulo se genera desde las fuentes).

## Reglas que no se rompen
- El modelo nunca decide si una regla pasa: lo decide el código y el modelo lo comunica.
- Una confirmación nunca se convierte en bloqueo ni al revés sin que lo diga el PRD (sección 7.3).
- Fixtures inmutables: si necesitas otro escenario, créalo en un test, no editando `fixtures/`.
