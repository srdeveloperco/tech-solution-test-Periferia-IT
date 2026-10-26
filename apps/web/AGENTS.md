# apps/web — chat del agente

- React 19 + Vite. Solo conoce el backend por HTTP y `@oc/contracts` (`import type`).
- Diseño: conversación a la izquierda, lienzo en vivo a la derecha (lo que el agente hace por debajo).
- Los valores de la OC se dibujan desde el resultado de las herramientas (`herramienta_fin.resultado`), no desde el texto del modelo.
- Estados obligatorios en cada componente interactivo: default, hover, focus visible, activo, deshabilitado, cargando, error.
- Color solo para estado: ámbar = necesita confirmación, verde = OC creada, rojo = bloqueada. Tokens en OKLCH, neutros tintados.
- Sin modales para confirmar: hoja fija sobre el campo de texto. Sin texto con gradiente, sin glassmorphism decorativo, sin bordes laterales de color.
- Movimiento 150–250 ms con curvas ease-out; respeta `prefers-reduced-motion`.
- Montos con `Intl.NumberFormat("es-CO")` y números tabulares.
- Copys en español, cortos, sin rayas largas.
