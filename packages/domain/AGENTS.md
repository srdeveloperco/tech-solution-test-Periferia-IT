# packages/domain — reglas puras

- Esquemas zod del PRD (Solicitud, Paquete 7.2, OrdenCompra 7.4) y reglas RC1–RC10 como funciones puras.
- Sin IO: nada de `fs`, `path`, red, HTTP ni SDK del LLM. Entra un dato, sale un dato. (`node:crypto` para sha256 está permitido.)
- Los umbrales (2 %, ± 1 unidad) son constantes nombradas.
- Normalización explícita: NIT sin puntos ni dígito de verificación, montos en formato colombiano, fechas ISO.
- Si cambias una regla, sigue la skill `nueva-regla-control`.
