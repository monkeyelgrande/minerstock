# MinerStock — Prompts para Stitch

> Versión 0.1 (2026-09-06). Cómo usarlo: crear un proyecto en Stitch (modo Web / Desktop), pegar primero el **bloque base** junto con el prompt de la primera pantalla, y en las siguientes pantallas volver a incluir el bloque base (o un resumen) para que el estilo se mantenga. Generar una pantalla por prompt.

---

## 0. Bloque base (incluir en cada prompt)

```
Diseña una pantalla de MinerStock, una aplicación web de escritorio (1440 px de ancho) para
el control de compras, bodegas y logística de una empresa minera. Los usuarios son
compradores, aprobadores, bodegueros y gerencia. La interfaz está en ESPAÑOL.

ESTILO VISUAL
- Aplicación administrativa tipo ERP, limpia, densa pero legible, sin ilustraciones decorativas.
- Fondo general gris muy claro (#F5F6F8). Tarjetas y tablas sobre blanco con borde sutil
  (#E5E7EB) y radio de 8 px. Sin sombras fuertes.
- Sidebar izquierda fija de 260 px, fondo azul-pizarra oscuro (#0F172A), texto gris claro,
  ítem activo con fondo #1E293B y una barra ámbar a la izquierda.
- Color de acento primario: ámbar minero (#F59E0B) para botones principales, ítem activo,
  enlaces importantes. Texto sobre ámbar en #1F2937.
- Colores semánticos para estados: gris (borrador), azul (enviada / pendiente), verde
  (aprobada / confirmada / recibida), naranja (parcial / en tránsito), rojo (rechazada /
  anulada / vencida). Los estados se muestran como chips redondeados con fondo suave y texto
  del mismo tono.
- Tipografía Inter. Títulos de página 24 px semibold, encabezados de tabla 12 px mayúsculas
  con espaciado, cuerpo 14 px.
- Iconografía lineal (estilo Lucide), 20 px.
- Botón primario ámbar sólido; secundario blanco con borde; destructivo rojo con borde.
- Inputs con borde #D1D5DB, alto 40 px, etiqueta encima en 13 px gris oscuro.

ESTRUCTURA COMÚN DE TODAS LAS PANTALLAS INTERNAS
- Sidebar con el logo "MinerStock" (icono de casco minero + texto) arriba, y el menú:
  Dashboard, Compras (Solicitudes, Aprobaciones, Cotizaciones, Comparativa, Órdenes de compra),
  Inventario (Recepciones, Stock, Kardex, Devoluciones, Ajustes, Conteos),
  Cuentas por pagar (Facturas, Pagos, Notas crédito, Estado de cuenta),
  Logística (Planillas, Recepción en mina, Novedades, En tránsito),
  Bodega (Vales de salida, Préstamos, Herramientas por persona),
  Reportes, Catálogo, Administración. Al final el usuario con avatar y rol.
- Topbar blanca de 64 px con: buscador global "Buscar documento o producto…", selector de
  bodega activa (dropdown con icono de almacén, ej. "Bodega Municipio"), campana de
  notificaciones con contador, avatar del usuario.
- Bajo la topbar: breadcrumb pequeño, título de página a la izquierda y botones de acción a
  la derecha.
```

---

## 1. Fase 0 — Base y catálogo

### 1.1 Login

```
[bloque base]

PANTALLA: Login. Es la única pantalla sin sidebar ni topbar.
Diseño dividido en dos columnas. Izquierda (45 %): panel azul-pizarra oscuro (#0F172A) con
el logo MinerStock grande en ámbar, el texto "Control de compras, bodegas y logística minera"
y debajo tres líneas cortas con icono: "Compras con aprobación", "Stock valorizado por
bodega", "Planillas de viaje y recepción en mina". Fondo con un patrón geométrico muy sutil.
Derecha (55 %): fondo blanco, formulario centrado de 400 px: título "Iniciar sesión",
campo Correo electrónico, campo Contraseña con icono de ojo, checkbox "Recordarme", enlace
"¿Olvidaste tu contraseña?", botón primario ámbar de ancho completo "Ingresar".
Pie con "© 2026 MinerStock".
```

### 1.2 Dashboard del comprador

```
[bloque base]

PANTALLA: Dashboard (rol comprador). Título "Buenos días, Carlos" con subtítulo con la fecha.
Fila superior de 4 tarjetas KPI: "Solicitudes aprobadas sin OC" (7), "OC pendientes de
recibir" (4), "Facturas por vencer esta semana" ($12.450.000), "Planillas en tránsito" (2).
Cada KPI con icono a la izquierda, número grande y una nota pequeña de variación.
Debajo, dos columnas 2/3 y 1/3:
- Izquierda: tarjeta "Órdenes de compra recientes" con tabla compacta: Número (OC-00231),
  Proveedor, Fecha, Total, Estado (chips), % recibido (barra de progreso delgada).
- Derecha: tarjeta "Pendientes por hacer" como lista de tareas con icono y enlace:
  "3 cotizaciones vencen mañana", "Planilla PL-00087 recibida con 2 novedades",
  "Stock bajo mínimo en Bodega Mina Norte: 5 productos".
Fila inferior: tarjeta ancha "Compras por mes" con gráfico de barras de los últimos 6 meses
en ámbar, y a la derecha tarjeta "Top proveedores" con lista y montos.
```

### 1.3 Productos — listado

```
[bloque base]

PANTALLA: Catálogo > Productos (listado). Título "Productos", botones "Importar" (secundario)
y "Nuevo producto" (primario).
Barra de filtros en una tarjeta: buscador por SKU o nombre, dropdown Categoría, dropdown Tipo
(Consumible / Retornable), toggle "Solo activos".
Tabla con columnas: SKU (monoespaciado), Producto (nombre + categoría en gris debajo), Unidad
base, Tipo (chip: Consumible gris / Retornable azul), Stock total (número + unidad), Costo
promedio ($), Estado (Activo verde / Inactivo gris), y columna de acciones con iconos ver,
editar, más.
Filas de ejemplo con productos mineros: "Pala punta cuadrada", "Cemento gris 50 kg",
"Broca 7/8 x 6 ft", "Guantes de carnaza", "ACPM (galón)", "Cable acerado 1/2".
Paginación abajo a la derecha "1–20 de 348" con flechas y selector de tamaño de página.
```

### 1.4 Producto — formulario

```
[bloque base]

PANTALLA: Catálogo > Productos > Editar "Cemento gris 50 kg". Título con el nombre del
producto y chip "Activo". Botones "Cancelar" y "Guardar cambios".
Pestañas horizontales: Datos generales (activa), Unidades alternas, Parámetros por bodega,
Imagen.
Pestaña Datos generales: formulario en dos columnas dentro de una tarjeta: SKU, Nombre,
Categoría (dropdown), Tipo (radio: Consumible / Retornable), Unidad base (dropdown "UND"),
Stock mínimo por defecto, Descripción (textarea ancho completo), toggle Activo.
Debajo, una segunda tarjeta "Unidades alternas" que muestra cómo se verá esa pestaña:
tabla con columnas Unidad, Factor (cuántas unidades base contiene), Uso por defecto en
compras (radio), acciones; filas "BULTO = 1 UND", "PALLET = 40 UND"; y un texto
explicativo en gris: "El stock siempre se guarda en la unidad base. Al comprar o entregar
en otra unidad, el sistema convierte usando el factor." Botón "Agregar unidad".
```

### 1.5 Maestro simple con drawer (Proveedores)

```
[bloque base]

PANTALLA: Catálogo > Proveedores. Título "Proveedores", botón "Nuevo proveedor".
Tabla: NIT, Razón social, Contacto (nombre + teléfono debajo), Ciudad, Condición de pago
(chip "Contado" o "Crédito 30 días"), Saldo pendiente ($), Estado, acciones.
A la derecha está abierto un panel lateral (drawer) de 480 px sobre un fondo oscurecido,
con título "Nuevo proveedor", formulario: Tipo de documento (dropdown), Número (NIT),
Razón social, Nombre de contacto, Teléfono, Correo, Dirección, Ciudad, Días de plazo de
pago (número; 0 = contado), Notas, toggle Activo. Pie del drawer con botones "Cancelar" y
"Guardar".
```

### 1.6 Usuarios y roles

```
[bloque base]

PANTALLA: Administración > Usuarios. Título "Usuarios", botón "Nuevo usuario".
Tabla: Usuario (avatar + nombre + correo), Roles (varios chips: Comprador, Aprobador,
Bodeguero, Solicitante, Tesorería, Consulta, Administrador), Bodegas asignadas (chips
pequeños o "Todas"), Último acceso, Estado, acciones.
Drawer abierto a la derecha "Editar usuario — Ana Gómez": Nombre, Correo, Roles
(multi-select con chips), Bodegas asignadas (multi-select: Bodega Municipio, Bodega Mina
Norte, Bodega Mina Sur), Bodega por defecto, toggle Activo, botón secundario "Restablecer
contraseña". Pie con Cancelar / Guardar.
```

---

## 2. Fase 1 — Compras

### 2.1 Solicitudes de compra — listado

```
[bloque base]

PANTALLA: Compras > Solicitudes. Título "Solicitudes de compra", botón "Nueva solicitud".
Fila de pestañas-filtro con contadores: Todas (42), Borrador (3), Pendientes de aprobación
(5), Aprobadas (12), En proceso (9), Atendidas (13). Filtros: rango de fechas, Bodega
destino, Prioridad, Solicitante.
Tabla: Número (SC-00118), Fecha, Bodega destino, Solicitante, Prioridad (chip: Urgente
rojo, Alta naranja, Normal gris), Ítems (cantidad), Avance (barra delgada "ordenado /
despachado" con dos tonos), Estado (chip), acciones.
```

### 2.2 Solicitud de compra — formulario

```
[bloque base]

PANTALLA: Compras > Solicitudes > Nueva solicitud. Título "Nueva solicitud de compra" con
chip "Borrador". Botones: "Guardar borrador" (secundario), "Enviar a aprobación" (primario).
Tarjeta "Datos generales" en 4 columnas: Bodega destino (dropdown), Fecha requerida (date
picker), Prioridad (dropdown), Solicitante (solo lectura con el usuario actual). Debajo
Observaciones (textarea).
Tarjeta "Ítems" con un editor de líneas: tabla editable con columnas Producto (buscador
con autocompletado que muestra SKU + nombre), Unidad (dropdown con conversión visible
debajo en gris: "1 CAJA = 12 UND"), Cantidad, Equivalente en unidad base (calculado, solo
lectura), Observación, botón eliminar. Tres filas de ejemplo y una fila vacía al final
con el texto "Buscar producto para agregar…". Pie de la tarjeta: "3 ítems".
Barra inferior fija con los mismos botones de acción.
```

### 2.3 Solicitud — detalle

```
[bloque base]

PANTALLA: Compras > Solicitudes > SC-00118. Cabecera con número grande "SC-00118", chip
de estado "En proceso" (azul), y botones "PDF", "Anular" (destructivo, con borde).
Diseño en dos columnas 2/3 y 1/3.
Columna izquierda: tarjeta "Datos" con bodega destino, fecha, prioridad, solicitante,
observaciones en formato etiqueta/valor. Tarjeta "Ítems" con tabla: Producto, Cantidad
solicitada, Ordenado (con OC asociada como enlace OC-00231), Despachado (con planilla como
enlace), Pendiente (resaltado si > 0), y una barra de avance por fila.
Columna derecha: tarjeta "Línea de tiempo" con puntos verticales: "Creada por Ana Gómez ·
2 sep 08:14", "Enviada a aprobación · 2 sep 08:20", "Aprobada por Luis Pérez · 2 sep
10:02 · 'OK, prioridad mina norte'", "OC-00231 generada · 3 sep". Tarjeta "Documentos
relacionados" con enlaces a cotizaciones, OC y planillas. Tarjeta "Adjuntos" vacía con
zona para arrastrar archivos.
```

### 2.4 Bandeja de aprobaciones

```
[bloque base]

PANTALLA: Compras > Aprobaciones (rol aprobador). Título "Bandeja de aprobaciones" con
subtítulo "8 documentos esperan tu decisión".
Pestañas: Solicitudes de compra (5), Órdenes de compra (3), Historial.
Lista de tarjetas (no tabla) una debajo de otra; cada tarjeta muestra a la izquierda el
número y tipo (OC-00234 · Orden de compra), proveedor o bodega, solicitante, fecha, número
de ítems y el total en grande ($8.320.000); al centro un resumen de los 3 primeros ítems
con "+4 más"; a la derecha botones "Ver detalle" (secundario), "Rechazar" (rojo con borde)
y "Aprobar" (verde sólido).
Sobre la lista hay un modal abierto "Rechazar OC-00234" con textarea "Motivo del rechazo
(obligatorio)" y botones Cancelar / Confirmar rechazo.
```

### 2.5 Cotización — formulario

```
[bloque base]

PANTALLA: Compras > Cotizaciones > Nueva cotización. Título "Nueva cotización" chip
"Borrador". Botones "Guardar borrador", "Marcar como recibida".
Tarjeta "Proveedor y vigencia": Proveedor (buscador), Fecha, Válida hasta, Adjunto
(zona de carga "Sube la cotización del proveedor en PDF o foto").
Tarjeta "Ítems" con botón "Traer ítems de solicitudes aprobadas" en la esquina; tabla
editable: Producto, Solicitud origen (SC-00118, enlace gris), Unidad, Cantidad, Precio
unitario ($), IVA % (dropdown 0 / 19), Plazo entrega (días), Subtotal (calculado),
eliminar. Totales alineados a la derecha: Subtotal, IVA, Total.
Un modal abierto encima "Traer ítems de solicitudes aprobadas": lista de solicitudes con
checkbox por ítem, mostrando producto, cantidad pendiente de cotizar y bodega; botón
"Agregar 6 ítems seleccionados".
```

### 2.6 Comparativa de cotizaciones

```
[bloque base]

PANTALLA: Compras > Comparativa. Título "Comparativa de cotizaciones". Filtros: Solicitudes
(multi-select con chips SC-00118, SC-00120), Producto, Solo con cotización vigente.
Botón primario "Generar órdenes de compra (2 proveedores)".
Contenido principal: una matriz. Primera columna fija: Producto (nombre + SKU + cantidad
requerida, ej. "Cemento gris 50 kg · 200 BULTO"). Luego una columna por proveedor
(Ferretería El Minero, Distribuciones Andina, Cementos del Valle), cada celda con precio
unitario grande, IVA pequeño, plazo "3 días", y un radio button para seleccionar. La
celda con el menor precio tiene fondo verde muy suave y una etiqueta "Mejor precio"; la
seleccionada tiene borde ámbar. Si un proveedor no cotizó el producto, la celda muestra
"—" en gris. Última columna: "Seleccionado" con el proveedor elegido y el subtotal.
Pie de la matriz: totales por proveedor de lo seleccionado y total general.
```

### 2.7 Orden de compra — detalle

```
[bloque base]

PANTALLA: Compras > Órdenes de compra > OC-00231. Cabecera: "OC-00231", chip "Recibida
parcial" (naranja), proveedor "Ferretería El Minero" con NIT debajo, y botones "PDF",
"Registrar recepción" (primario), menú "Más" (Cerrar, Anular).
Banda de estado horizontal tipo stepper: Borrador → Pendiente aprobación → Aprobada →
Emitida → Recibida parcial → Recibida → Cerrada, con los pasos completados en verde, el
actual en ámbar y los siguientes en gris. Bajo el paso Aprobada, texto pequeño "Luis Pérez
· 3 sep 10:15".
Dos columnas 2/3 y 1/3.
Izquierda: tarjeta "Ítems": Producto, Unidad de compra, Cantidad, Precio, IVA, Total,
Recibido (con barra de progreso y "120 / 200"), Devuelto, Pendiente. Totales al pie.
Tarjeta "Recepciones" con tabla: RC-00102 · 4 sep · 120 bultos · Remisión 5521 · Confirmada.
Tarjeta "Facturas" con FP-00045 · $4.100.000 · Vence 4 oct · Pendiente.
Derecha: tarjeta "Condiciones": bodega de entrega, fecha esperada, forma de pago
"Crédito 30 días", comprador. Tarjeta "Aprobación" con avatar del aprobador, fecha y
comentario. Tarjeta "Origen": solicitudes SC-00118, SC-00120 y cotización CO-00077 como
enlaces. Tarjeta "Actividad" con línea de tiempo.
```

---

## 3. Fase 2 en adelante (pantallas distintivas, para más adelante)

### 3.1 Stock por bodega

```
[bloque base]

PANTALLA: Inventario > Stock. Título "Stock", botones "Exportar" y "Nuevo ajuste".
Fila de 4 KPI: Valor total inventario ($186.400.000), Productos bajo mínimo (12, rojo),
En tránsito ($9.200.000), En préstamo (34 herramientas).
Filtros: Bodega (Todas / Municipio / Mina Norte / Mina Sur), Categoría, buscador, toggle
"Solo bajo mínimo".
Tabla con columnas fijas Producto y Unidad, luego una columna por bodega (Municipio, Mina
Norte, Mina Sur) mostrando cantidad con un punto de color rojo si está bajo mínimo, luego
columnas En tránsito (naranja), En préstamo (azul), Total, Costo promedio, Valor total.
Al hacer clic en una celda se abre a la derecha un panel con el kardex resumido de ese
producto en esa bodega (mostrar el panel abierto para "Cemento gris 50 kg · Mina Norte").
```

### 3.2 Recepción en mina

```
[bloque base]

PANTALLA: Logística > Recepción en mina > Planilla PL-00087. Título "Recibir planilla
PL-00087", subtítulo "Desde Bodega Municipio · Vehículo WLK-482 · Chofer Jorge Ruiz ·
Despachada 5 sep 06:30". Chip "Despachada" (naranja). Botón primario "Confirmar recepción".
Tarjeta "Ítems": tabla con Producto, Enviado (solo lectura), Recibido (input numérico,
prellenado con lo enviado), Faltante (calculado, en rojo si > 0), Dañado (input), Sobrante
(input), Novedad (textarea corto que se habilita si hay diferencia), Foto (icono de cámara).
Una fila con diferencia resaltada en fondo rojo muy suave: "Cemento gris 50 kg · Enviado
200 · Recibido 196 · Faltante 4 · 'Bultos rotos en el viaje'".
Tarjeta "Evidencia" con zona de carga obligatoria "Foto de la planilla firmada por el
chofer" mostrando una miniatura ya cargada, y campo Observaciones generales.
Resumen a la derecha en tarjeta pegajosa: "18 ítems · 17 sin novedad · 1 con faltante",
y el botón Confirmar repetido.
```

### 3.3 Préstamo — detalle con devolución

```
[bloque base]

PANTALLA: Bodega > Préstamos > PR-00042. Cabecera "PR-00042", chip "Parcial" (naranja),
receptor "Pedro Salazar · Frente 2", fecha préstamo 1 sep, fecha esperada de devolución
8 sep (en rojo con etiqueta "Vencido hace 2 días"). Botones "PDF" y "Registrar devolución"
(primario).
Tarjeta "Herramientas": Producto, Prestado, Devuelto, Dañado, Perdido, Pendiente (resaltado),
ej. "Pala punta cuadrada · 3 · 2 · 0 · 0 · 1", "Radio portátil · 2 · 2 · 0 · 0 · 0".
Modal abierto "Registrar devolución": por cada ítem con pendiente, cantidad a devolver y
un selector de estado (Bueno / Dañado / Perdido) con nota; botones Cancelar / Confirmar
devolución.
Tarjeta "Historial" con las devoluciones anteriores.
```

---

## 4. Consejos de uso en Stitch

- Generar primero **Login** y **Dashboard**; si el resultado del estilo convence, fijarlo como referencia y generar el resto usando "mantener el estilo de la pantalla anterior" o pegando el bloque base completo.
- Si Stitch cambia la paleta, repetir los códigos de color en el prompt y decir explícitamente "no uses degradados ni ilustraciones".
- Para pantallas con tablas largas, pedir "muestra al menos 8 filas de datos realistas" para evaluar la densidad.
- Exportar cada pantalla a HTML/Tailwind; de ahí se trasladan la estructura y los tokens (colores, radios, espaciados) al proyecto Angular con PrimeNG.
