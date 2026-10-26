# EP-04 · Interfaz conversacional con lienzo en vivo

| Campo | Valor |
|---|---|
| Épica | EP-04 Interfaz conversacional con lienzo en vivo |
| Objetivo de negocio | Que la analista procese una OC conversando, vea en tiempo real lo que hace el agente y decida las excepciones en un vistazo, sin abrir SAP ni archivos |
| Estado | Hecho |
| Prioridad | Alta (P0) |
| Estimación | 21 puntos |
| Sesiones de origen | S1, S3, S5, S6 |
| Trazabilidad PRD | §6.1 (front de chat: historial, entrada, "pensando", llamadas a herramientas visibles, confirmación resaltada), CA3, CA4, CA5, §11 (prompt de ejemplo) |

## 1. Levantamiento

**Sesiones de origen.** S1 (proceso actual), S3 (experiencia de usuario con la analista), S5 (costos y observabilidad), S6 (revisión y aceptación).

**Hallazgos.**

- Analista administrativa (S1): "Hoy tengo abiertos el correo, el Excel, el PDF de la cotización y SAP al mismo tiempo. Lo que quiero es ver todo junto y que me diga qué está mal."
- Analista administrativa (S3): "Si el sistema me pide confirmar algo, quiero ver los dos valores al lado, no leer un párrafo."
- Analista administrativa (S3): "No me gustan las ventanas que salen encima y me tapan lo que estaba leyendo."
- Contabilidad/Auditoría (S1): "Necesito saber de dónde salió cada dato de la orden: si lo puso la solicitud, la cotización o el maestro."
- Dirección administrativa y financiera (S5): "Quiero ver cuánto cuesta cada conversación y qué modelo la atendió."
- Equipo Perxia (S6): "El evaluador tiene que entender el agente sin explicación: que se vea lo que pasa por debajo."

**Necesidades.**

1. Una sola pantalla con la conversación y una vista viva del trabajo del agente (paquete, controles, OC, evidencia, resultado).
2. Confirmación humana visible y fácil, con los valores en disputa lado a lado.
3. Trazabilidad visual de cada campo de la OC.
4. Historial de conversaciones y acceso al observatorio.
5. Uso en portátil de día y también en el celular.

**Restricciones.** El front solo importa tipos de `@oc/contracts` (sin lógica de negocio). Ninguna cifra mostrada en el lienzo puede salir del texto del modelo: sale de los resultados de herramientas (CA2). Login obligatorio (ver EP-05).

## 2. Historias de usuario

### HU-04.1 · Conversación con el agente en streaming

**Como** analista administrativa **quiero** escribirle al agente en lenguaje natural y ver su respuesta mientras se escribe **para** no esperar en blanco y entender qué está haciendo.

```gherkin
Escenario: Respuesta en streaming
  Dado que inicié sesión y estoy en una conversación nueva
  Cuando escribo "procesa sol-001" y presiono Enter
  Entonces veo el indicador de "pensando" y luego el texto del agente aparece progresivamente
  Y el texto final reemplaza lo acumulado cuando llega el evento "mensaje"

Escenario: Detener un turno
  Dado que el agente está respondiendo
  Cuando presiono "Detener"
  Entonces el turno se corta sin cerrar la sesión y puedo reintentar

Escenario: Error del proveedor
  Dado que el proveedor del modelo no responde
  Cuando envío un mensaje
  Entonces veo un mensaje claro en el chat y la conversación sigue disponible (CA5)
```

- Reglas: el markdown del agente se sanea antes de mostrarse (marked + DOMPurify).
- Prioridad: P0 · Puntos: 3 · Estado: Hecho.

### HU-04.2 · Llamadas a herramientas visibles

**Como** analista **quiero** ver cada herramienta que ejecuta el agente con su resultado resumido **para** confiar en lo que me dice y poder revisar el detalle si lo necesito.

```gherkin
Escenario: Filas de herramientas en vivo
  Dado que pedí "procesa sol-004"
  Cuando el agente llama oc_leer_paquete, oc_validar, oc_construir_payload, oc_generar_evidencia y oc_crear
  Entonces veo una fila por herramienta con nombre legible, estado, resumen de una línea y duración en ms

Escenario: Ver argumentos y resultado
  Dado una fila de herramienta terminada
  Cuando la despliego
  Entonces veo los argumentos enviados y el resultado completo en formato monoespaciado

Escenario: Ruta, modelo y costo del turno
  Dado que el turno terminó
  Entonces veo el chip "Operador · <modelo>" y si fue "enrutado por reglas, sin costo"
  Y veo el costo del turno en USD y la marca "Cifras verificadas"
```

- Reglas: el chip de ruta sale del evento `ruta`; la marca de verificación, del evento `verificacion` (PRD CA2, CA4).
- Prioridad: P0 · Puntos: 3 · Estado: Hecho.

### HU-04.3 · Hoja de confirmación sin modal

**Como** analista **quiero** que las excepciones me pidan confirmación en un panel fijo con los dos valores comparados **para** decidir sin perder el contexto de la conversación.

```gherkin
Escenario: Cotización distinta a la solicitud (sol-004)
  Dado que el agente validó sol-004 y oc_crear quedó "pendiente" por RC5
  Entonces sobre el campo de entrada aparece la hoja "Necesito tu confirmación"
  Y veo "Solicitud $ 25.000.000" y "Cotización $ 26.500.000" lado a lado con la diferencia "6,0 %"

Escenario: Confirmar y crear
  Dado que la hoja de confirmación está visible
  Cuando presiono "Confirmar y crear OC"
  Entonces se envía la petición con confirmar = { caso: "sol-004" } y el mensaje "Confirmo"
  Y el lienzo muestra el sello "OC 4500000001"

Escenario: Posponer
  Dado que la hoja está visible
  Cuando presiono "Ahora no"
  Entonces la hoja se oculta y la OC sigue pendiente
```

- Reglas: nunca se usa una ventana modal; el estado de espera se resalta en ámbar (PRD CA3).
- Prioridad: P0 · Puntos: 3 · Estado: Hecho.

### HU-04.4 · Lienzo en vivo del trabajo del agente

**Como** analista **quiero** ver a la derecha cómo se arma la OC paso a paso **para** revisar en un vistazo qué pasó y qué falta.

```gherkin
Escenario: Riel de etapas
  Dado que el agente procesa un caso
  Entonces veo el riel "Leer paquete → Validar → Construir OC → Evidencia → Crear en SAP"
  Y cada etapa cambia a en curso, ok, bloqueo o espera según los eventos de herramientas

Escenario: Paquete y controles
  Dado que terminó oc_leer_paquete
  Entonces veo hojas de documento para solicitud, cotización, aprobación, correo y factura si existe
  Y al terminar oc_validar veo RC1 a RC10 marcándose en secuencia con "Cumple", "Bloquea", "Confirmar", "Derivado" o "No aplica"

Escenario: Fuente de cada campo de la OC
  Dado que terminó oc_construir_payload
  Cuando paso el cursor por un campo de la OC estilo SAP
  Entonces veo su fuente: solicitud, cotización, maestro.proveedores o derivado

Escenario: Sello del resultado (sol-002)
  Dado que pedí "procesa sol-002"
  Entonces el sello dice "Bloqueada, no se creó" con "Proveedor no registrado" y la acción sugerida
```

- Reglas: el lienzo se alimenta solo de `herramienta_fin.resultado` (sin cifras del texto del modelo).
- Prioridad: P0 · Puntos: 5 · Estado: Hecho.

### HU-04.5 · Historial, bandeja de casos y descargas

**Como** analista **quiero** retomar conversaciones anteriores, ver los casos disponibles y descargar evidencias y el log de control **para** continuar mi trabajo y entregar soportes.

```gherkin
Escenario: Retomar una conversación
  Dado que tengo conversaciones previas
  Cuando abro el historial y elijo una
  Entonces se cargan sus mensajes y el lienzo se reconstruye desde los resultados de herramientas

Escenario: Bandeja como estado vacío
  Dado que inicio una conversación nueva
  Entonces el lienzo muestra la bandeja con sol-001 a sol-006, proveedor, valor y estado
  Y al hacer clic en un caso se envía "Procesa la solicitud <caso>"

Escenario: Descargar evidencia y control
  Dado que una OC tiene evidencia generada
  Cuando presiono descargar PDF o control.csv
  Entonces el archivo se descarga con fetch autenticado, sin exponer el token en la URL
```

- Prioridad: P1 · Puntos: 3 · Estado: Hecho.

### HU-04.6 · Experiencia en celular y temas claro y oscuro

**Como** analista **quiero** usar el agente desde el celular y con el tema de mi sistema **para** revisar casos fuera del escritorio.

```gherkin
Escenario: Conmutador en móvil
  Dado una pantalla de menos de 900 px
  Entonces veo una sola columna con el conmutador "Conversación | Lienzo"
  Y un punto indica actividad nueva en el lienzo

Escenario: Tema automático
  Dado que mi sistema está en modo oscuro
  Entonces la interfaz usa la paleta oscura sin recargar

Escenario: Reducir movimiento
  Dado que mi sistema pide reducir movimiento
  Entonces las transiciones se desactivan
```

- Prioridad: P1 · Puntos: 2 · Estado: Hecho.

### HU-04.7 · Observatorio para administradores

**Como** integrante de la dirección **quiero** una vista con el gasto, los modelos y las trazas de cada interacción **para** controlar costos y mejorar los prompts.

```gherkin
Escenario: Presupuesto y totales
  Dado que soy admin y abro "Observatorio"
  Entonces veo "US$ gastados de US$ 10,00", interacciones, llamadas, tokens, costo promedio y latencia p50/p95

Escenario: Detalle de una interacción
  Dado la lista de interacciones
  Cuando abro una
  Entonces veo la ruta, cada llamada al modelo (system prompt plegable, mensajes, variables, respuesta, tokens, costo) y cada herramienta

Escenario: Usuario sin rol admin
  Dado que soy analista sin grupo admin
  Cuando intento abrir el observatorio
  Entonces veo "Esta sección es solo para administradores."
```

- Prioridad: P1 · Puntos: 2 · Estado: Hecho (datos detallados en EP-06).

## 3. Solución implementada

**Diseño.** React 19 + Vite 8, CSS propio con tokens OKLCH (sin Tailwind). El backend sirve el build en producción; en desarrollo Vite hace proxy de `/api` a `:8080`. El estado del chat y del lienzo se deriva de los eventos SSE de `POST /api/chat` (`apps/web/src/api/chat.ts`).

**Principios de diseño** (aplicando la guía de diseño de producto usada en el proyecto):

- Escena física: analista en portátil, de día, entre correos. Por eso tema claro por defecto y oscuro automático.
- Color solo para estado: ámbar = confirmación, verde = creada, rojo = bloqueo, siempre con ícono y texto. Acciones primarias en tinta oscura.
- Tipografía del sistema (SF Pro en Mac), escala 1.2 y números tabulares para montos.
- Movimiento de 160 a 280 ms con curvas de salida exponencial (`--t-rapida: 160ms`, `--t-media: 220ms`), solo `opacity` y `transform`, sin rebotes; respeta `prefers-reduced-motion`.
- Bans: sin glassmorphism decorativo, sin texto con gradiente, sin bordes laterales de color, sin modales como primera opción, sin grids de tarjetas idénticas.

**Componentes.**

| Pieza | Ruta |
|---|---|
| Raíz, acceso y rutas (`#/observatorio`) | `apps/web/src/App.tsx` |
| Pantalla dividida y conmutador móvil | `apps/web/src/componentes/Espacio.tsx` |
| Conversación, mensajes y markdown seguro | `apps/web/src/componentes/chat/Conversacion.tsx`, `Mensaje.tsx`, `Markdown.tsx` |
| Fila de herramienta | `apps/web/src/componentes/chat/FilaHerramienta.tsx` |
| Hoja de confirmación | `apps/web/src/componentes/chat/HojaConfirmacion.tsx` |
| Historial y campo de entrada | `apps/web/src/componentes/chat/Historial.tsx`, `Compositor.tsx`, `Bienvenida.tsx` |
| Lienzo: riel, paquete, controles, OC, evidencia, sello, bandeja | `apps/web/src/componentes/lienzo/Riel.tsx`, `PaqueteVista.tsx`, `ControlesVista.tsx`, `OrdenVista.tsx`, `EvidenciaVista.tsx`, `Sello.tsx`, `Bandeja.tsx`, `Lienzo.tsx` |
| Estado derivado de eventos | `apps/web/src/estado/chat.ts`, `apps/web/src/estado/lienzo.ts` |
| Guards de tipos sin `any` | `apps/web/src/api/guards.ts` |
| HTTP autenticado y descargas fetch + blob | `apps/web/src/api/http.ts` |
| Observatorio | `apps/web/src/componentes/observatorio/Observatorio.tsx`, `Detalle.tsx` |
| Medidor de presupuesto | `apps/web/src/componentes/Presupuesto.tsx` |
| Tokens y estilos | `apps/web/src/estilos/tokens.css`, `base.css`, `chat.css`, `lienzo.css`, `espacio.css`, `observatorio.css`, `login.css` |
| Modo demostración (`?demo=sol-004&auto=1`) | `apps/web/src/demo/` |

## 4. Verificación

- Typecheck y `vite build` en verde; Biome sin errores (6 avisos intencionales de CSS).
- Recorrido e2e con Playwright contra el backend real (proveedor determinista, login local): login, `sol-004` con hoja de confirmación, "Confirmar y crear OC" con sello `OC 4500000001`, `sol-002` bloqueada con acción sugerida, pregunta de proceso, observatorio y vista móvil. **Cero errores de consola.**
- Capturas en escritorio (1440×900) y móvil (390×844), claro y oscuro, con tres rondas de revisión de diseño.
- Prueba en vivo en el link público con los modelos reales de Anthropic: flujo completo validado por el usuario.

## 5. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Pantalla dividida con lienzo vivo | Chat simple con tablas en markdown | El evaluador y la analista ven el trabajo del agente sin leer JSON; el lienzo usa datos de herramientas, no del modelo |
| Hoja de confirmación fija sobre el campo de entrada | Ventana modal | La modal tapa el contexto; la hoja mantiene visible la conversación y el lienzo |
| SSE para eventos | WebSocket | Unidireccional basta, funciona sobre HTTP/1.1 y se autentica igual que el resto |
| CSS propio con tokens OKLCH | Tailwind o librería de componentes | Control fino de la estética y menor peso; evita el aspecto genérico |
| Hash routing (`#/observatorio`) | Router con rutas de servidor | Un solo `index.html` servido por el backend, sin configuración extra |
| Modo demostración con grabaciones | Depender siempre del backend | Permite diseñar y presentar sin clave ni red |

## 6. Pendientes para producción

- Auditoría de accesibilidad WCAG 2.1 AA con lector de pantalla y navegación solo con teclado.
- Internacionalización si se extiende a otras filiales.
- Tests de componentes y e2e automatizados en CI (hoy la verificación e2e fue manual con Playwright).
- Paginación del historial y del observatorio para volúmenes altos.
