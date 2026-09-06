# MinerStock — Módulos, pantallas y permisos

> Versión 0.1 (2026-09-06). Inventario de pantallas por módulo. Sirve como base para el diseño en Stitch y para el mapa de rutas de Angular.

## 1. Estructura general de la app

**Layout**: sidebar izquierda colapsable con los módulos; topbar con buscador global (por número de documento o producto), selector de **bodega activa**, campana de notificaciones, menú de usuario. Contenido con breadcrumb y título.

**Patrones de pantalla** (se repiten en todos los módulos):
- **Listado**: tabla con filtros (estado, fechas, bodega, proveedor, texto), paginación, ordenamiento, chips de estado con color, botón "Nuevo", acciones por fila (ver, editar si borrador, PDF, anular).
- **Formulario de documento**: cabecera (datos generales) + **editor de ítems** (buscador de producto, unidad con conversión visible "1 CAJA = 12 UND", cantidad, precio si aplica, subtotal) + totales + barra de acciones (Guardar borrador, Confirmar/Enviar, Cancelar).
- **Detalle de documento**: cabecera en modo lectura, ítems, línea de tiempo de estados (quién y cuándo), documentos relacionados (padre e hijos), adjuntos, botones de transición según estado y rol.
- **Maestro simple**: tabla + diálogo lateral (drawer) para crear/editar.

**Rutas Angular** (prefijo por módulo): `/auth`, `/dashboard`, `/catalogo/*`, `/compras/*`, `/inventario/*`, `/pagos/*`, `/logistica/*`, `/bodega/*`, `/reportes/*`, `/admin/*`.

## 2. Módulos y pantallas

### 2.1 Autenticación
| Pantalla | Contenido |
|---|---|
| Login | email, contraseña, recordar sesión |
| Recuperar contraseña | email → enlace (fase posterior) |
| Perfil | datos, cambio de contraseña, bodega por defecto |

### 2.2 Dashboard (según rol)
- **Comprador**: solicitudes aprobadas sin OC, cotizaciones por vencer, OC emitidas pendientes de recibir, facturas por vencer, planillas en tránsito.
- **Aprobador**: bandeja de aprobaciones pendientes (solicitudes y OC) con aprobar/rechazar en línea.
- **Bodeguero**: planillas por recibir en mi bodega, novedades abiertas, stock bajo mínimo, préstamos vencidos.
- **Gerencia**: valor total de inventario por bodega, compras del mes, cartera con proveedores, consumo por centro de costo.

### 2.3 Catálogo (maestros)
| Pantalla | Notas |
|---|---|
| Sedes | tabla + drawer |
| Bodegas | tabla + drawer; sede, código |
| Unidades | tabla + drawer |
| Categorías | árbol simple |
| Productos | listado con filtros por categoría/tipo; formulario con pestañas: datos, **unidades alternas** (tabla de conversiones), parámetros por bodega (mínimos), imagen |
| Proveedores | tabla + formulario; pestaña de estado de cuenta (enlace a pagos) |
| Vehículos | tabla + drawer |
| Choferes | tabla + drawer; alerta licencia vencida |
| Centros de costo | tabla + drawer |
| Receptores | tabla + drawer; persona o área |

### 2.4 Compras
| Pantalla | Notas |
|---|---|
| Solicitudes: listado | filtros por estado, bodega, prioridad, solicitante |
| Solicitud: formulario | bodega destino, fecha requerida, prioridad, ítems (producto, unidad, cantidad, nota); botón Enviar a aprobación |
| Solicitud: detalle | estado, ítems con columnas "ordenado" y "despachado", aprobación, documentos relacionados |
| Bandeja de aprobaciones | solicitudes y OC pendientes; aprobar / rechazar con comentario |
| Cotizaciones: listado | por proveedor, estado, vigencia |
| Cotización: formulario | proveedor, fechas; "Traer ítems de solicitudes" (selector de solicitudes aprobadas con ítems pendientes); precio, IVA, plazo por ítem; adjunto |
| **Comparativa** | filtro por solicitudes/productos; matriz producto × proveedor con precio, plazo; marcar ganador por celda; botón "Generar órdenes de compra" (crea una OC por proveedor ganador) |
| Órdenes de compra: listado | estado, proveedor, fechas, total, % recibido |
| OC: formulario | proveedor, bodega entrega, condiciones de pago, ítems con unidad de compra y precio; totales |
| OC: detalle | estado + aprobación (quién, cuándo, comentario), ítems con recibido/pendiente/devuelto, recepciones, facturas, PDF (desde aprobada), botones: Enviar a aprobación / Emitir / Registrar recepción / Anular / Cerrar |
### 2.5 Inventario
| Pantalla | Notas |
|---|---|
| Recepciones de compra: listado | por OC, proveedor, bodega, estado |
| Recepción: formulario | se abre desde una OC; muestra ordenado / ya recibido / pendiente por ítem; se ingresa cantidad recibida (en unidad de compra), remisión, fotos; Confirmar |
| Devoluciones a proveedor | listado; formulario desde una recepción: ítems y cantidades a devolver, motivo; Confirmar |
| **Stock** | tabla bodega × producto: cantidad, unidad base, costo promedio, valor total, mínimo, semáforo; filtros por bodega/categoría; vista "todas las bodegas" con columnas por bodega y columnas de **en tránsito** y **en préstamo** |
| **Kardex** | por producto y bodega: fecha, documento (enlace), tipo, entrada, salida, saldo, costo, valor |
| Ajustes | listado; formulario: bodega, motivo, ítems con cantidad (+/−); Confirmar |
| Conteos físicos | listado; formulario: bodega, agregar productos (o toda la bodega/categoría), columna sistema vs contado, diferencia; Cerrar conteo → genera ajuste |

### 2.6 Cuentas por pagar
| Pantalla | Notas |
|---|---|
| Facturas: listado | proveedor, estado, vencimiento, saldo; semáforo de vencidas |
| Factura: formulario | proveedor, número del proveedor, fechas, seleccionar recepciones a cubrir (de una OC), subtotal e IVA calculados desde los ítems (editables), **retención** a nivel de factura, total a pagar; adjunto |
| Pagos: listado | |
| Pago: formulario | proveedor, fecha, medio, referencia, valor; tabla de facturas pendientes del proveedor para aplicar el valor (con notas crédito disponibles) |
| Notas crédito | listado; se crean desde devolución; aplicar a facturas |
| **Estado de cuenta por proveedor** | facturas, pagos, notas crédito, saldo; exportar |

### 2.7 Logística
| Pantalla | Notas |
|---|---|
| Planillas: listado | origen, destino, vehículo, chofer, estado, fecha |
| Planilla: formulario | origen, destino, vehículo, chofer, fecha; ítems con stock disponible visible; "Traer pendientes de solicitudes" del destino; Despachar |
| Planilla: detalle + PDF | ítems, recepciones, novedades; PDF para el chofer |
| **Recepción en mina** | se abre desde una planilla "despachada" hacia mi bodega; por ítem: enviado / recibido / faltante / dañado / sobrante + nota + foto; **foto de la planilla firmada** (obligatoria); Confirmar |
| Novedades | listado de abiertas/resueltas; resolver con comentario |
| En tránsito | vista de lo que va en camino por destino |

### 2.8 Bodega (consumo)
| Pantalla | Notas |
|---|---|
| Vales de salida: listado | bodega, receptor, centro de costo, fecha |
| Vale: formulario | receptor (con centro de costo por defecto), ítems con unidad y stock disponible; Confirmar; PDF |
| Préstamos: listado | abiertos, vencidos (rojo), devueltos; por receptor |
| Préstamo: formulario | receptor, fecha esperada de devolución, ítems retornables; Confirmar; PDF |
| Préstamo: detalle | ítems con prestado / devuelto / dañado / perdido; botón **Registrar devolución** (diálogo por ítem con cantidad y estado) |
| Herramientas por persona | qué tiene cada receptor en su poder |

### 2.9 Reportes
Kardex valorizado, inventario valorizado por bodega y categoría, consumo por centro de costo y receptor, compras por proveedor y producto, comparativo de precios históricos por producto, novedades de transporte, préstamos vencidos, cartera por proveedor y vencimientos, solicitudes pendientes de atender. Todos con filtros de fechas y exportación a Excel/PDF.

### 2.10 Administración
| Pantalla | Notas |
|---|---|
| Usuarios | crear, roles, bodegas asignadas, activar/desactivar |
| Roles y permisos | matriz rol × permiso |
| Configuración | datos de empresa y logo, IVA por defecto, consecutivos (prefijo y próximo número) |
| Log de actividad | quién hizo qué, filtro por usuario/documento |

## 3. Matriz de permisos (inicial)

| Acción | admin | solicitante | aprobador | comprador | tesoreria | bodeguero | consulta |
|---|---|---|---|---|---|---|---|
| Maestros: gestionar | ✔ | | | ✔ proveedores | | | |
| Solicitudes: crear/enviar | ✔ | ✔ | | ✔ | | ✔ | |
| Solicitudes/OC: aprobar | ✔ | | ✔ | | | | |
| Cotizaciones, comparativa, OC | ✔ | | | ✔ | | | |
| Recepciones de compra, devoluciones a proveedor | ✔ | | | ✔ | | ✔ (bodega municipio) | |
| Facturas, pagos, notas crédito | ✔ | | | | ✔ | | |
| Planillas: crear/despachar | ✔ | | | ✔ | | ✔ (bodega origen) | |
| Recepción en mina, novedades | ✔ | | | | | ✔ (bodega destino) | |
| Vales, préstamos, devoluciones de préstamo | ✔ | | | | | ✔ | |
| Ajustes y conteos | ✔ | | | | | ✔ | |
| Anular documentos confirmados | ✔ | | | | | | |
| Stock, kardex, reportes | ✔ | (su bodega) | ✔ | ✔ | ✔ (cartera) | (sus bodegas) | ✔ |
| Usuarios y configuración | ✔ | | | | | | |

Los permisos se definen granulares en la base (`purchase_requests.create`, `purchase_orders.approve`, `shipments.dispatch`, …) y los roles son solo agrupaciones editables.

## 4. Orden de construcción sugerido (mapa a fases)

| Fase | Pantallas |
|---|---|
| 0 | Login, layout, dashboard vacío, todos los maestros, usuarios, configuración |
| 1 | Solicitudes, bandeja de aprobaciones, cotizaciones, comparativa, OC + PDF |
| 2 | Recepciones, stock, kardex, devoluciones a proveedor, ajustes, conteos |
| 3 | Facturas, pagos, notas crédito, estado de cuenta |
| 4 | Planillas + PDF, recepción en mina, novedades, en tránsito |
| 5 | Vales + PDF, préstamos + devoluciones, herramientas por persona, alertas de mínimos |
| 6 | Dashboards por rol, reportes, notificaciones, log de actividad |
