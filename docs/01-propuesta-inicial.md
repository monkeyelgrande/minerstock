# MinerStock — Propuesta de planeamiento

> Documento vivo. Versión 0.3 (2026-09-06). Incorpora las decisiones de la primera y segunda revisión. Planeamiento funcional cerrado.
> Documentos relacionados: [02-modelo-de-datos.md](02-modelo-de-datos.md), [03-modulos-y-pantallas.md](03-modulos-y-pantallas.md).

## 1. Qué es el sistema

Control de abastecimiento y bodega para una empresa minera con varias bodegas (en el municipio y en las minas). Cubre el ciclo completo:

**Necesidad en la mina → Solicitud de compra (aprobada) → Cotización con proveedores → Orden de compra (aprobada) → Recepciones parciales y facturas del proveedor → Pagos → Planilla de viaje (vehículo + chofer) → Recepción en bodega de la mina → Entregas y préstamos al personal → Stock valorizado e historial (kardex) en cada bodega.**

## 2. Decisiones tomadas

| Tema | Decisión | Implicación en el diseño |
|---|---|---|
| Aprobaciones | Sí hay aprobaciones | Toda solicitud de compra y toda orden de compra deben ser aprobadas por el rol **Aprobador** antes de continuar. Sin montos ni umbrales. |
| Conectividad | Hay internet; solo web por ahora | Sin modo offline. App responsive, pero pensada primero para escritorio. |
| Unidades | Se compra por caja y se entrega por unidad | Cada producto tiene **unidad base** (en la que se guarda el stock) y unidades alternas con factor de conversión. Compras y entregas se hacen en cualquier unidad; el kardex siempre en unidad base. |
| Valorización | Sí | El kardex guarda costo unitario en cada movimiento; los saldos llevan **costo promedio ponderado**. Reportes de inventario y consumo en pesos. |
| Préstamos | Sí, hay herramientas que se prestan y devuelven | Productos tipo **retornable**. Documento de **préstamo** controlado **por cantidad** (3 palas, no pala #017), con devolución total o parcial, estado de la herramienta al devolver y control de pendientes por persona. |
| Impuestos | IVA por ítem, retención a nivel de factura | Los ítems de cotización, OC y factura llevan `tax_rate`. La factura del proveedor tiene un campo de **retención** que se descuenta del total a pagar. |
| Planilla firmada | Se registra foto de la planilla firmada | La planilla se imprime, el chofer la firma en papel, y al recibir en la mina se adjunta la **foto de la planilla firmada** como evidencia. |
| Empresas | Una sola empresa, varias bodegas | Sin multi-tenant. Se mantiene un maestro simple de **sedes** (municipio, mina A, mina B) para agrupar bodegas y reportar por mina. |
| Pagos | Sí, control de pagos a proveedores | Módulo de **cuentas por pagar**: facturas del proveedor, pagos, abonos, notas crédito por devoluciones, saldo por proveedor. |
| Consecutivos | Globales | Un consecutivo por tipo de documento (SC-0001, CO-0001, OC-0001, RC-0001, PL-0001, RM-0001, VS-0001, PR-0001, DV-0001, AJ-0001, FP-0001, PG-0001). |
| Devoluciones a proveedor | Sí | Documento de **devolución a proveedor** ligado a la recepción; descarga stock y genera nota crédito en cuentas por pagar. |
| Recepción parcial de OC | Sí, varias entregas y varias facturas por OC | Una OC tiene N recepciones y N facturas. Cada recepción es un ingreso independiente al stock; la factura se asocia a una o varias recepciones. |
| Librería de UI | Tailwind CSS + PrimeNG | El diseño se hará en Stitch (que genera Tailwind); PrimeNG aporta tablas, diálogos y formularios. |

## 3. Actores (roles)

| Rol | Dónde está | Qué hace |
|---|---|---|
| **Administrador** | Oficina | Maestros, usuarios, configuración (datos de empresa, consecutivos, IVA por defecto), ve todo, anula documentos. |
| **Solicitante** | Mina | Crea solicitudes de compra para su bodega. |
| **Aprobador** | Oficina / gerencia | Aprueba o rechaza solicitudes y órdenes de compra. |
| **Comprador** | Municipio | Cotiza, arma la comparativa, crea OC, registra recepciones de compra, facturas y devoluciones a proveedor, arma planillas de viaje. |
| **Tesorería / pagos** | Oficina | Registra pagos a proveedores. Puede ser el mismo comprador o el administrador. |
| **Bodeguero** | Municipio o mina | Recibe planillas, registra novedades, hace entregas, préstamos, devoluciones de préstamo, ajustes y conteos en sus bodegas. |
| **Consulta** | Gerencia | Solo lectura: dashboard y reportes. |

Un usuario puede tener varios roles y se le asignan las bodegas sobre las que opera.

## 4. Flujo y documentos

Cada paso es un **documento** con consecutivo, estados y referencia al documento anterior. Un documento confirmado no se edita: se anula (si no tiene documentos hijos) o se corrige con otro documento.

### 4.1 Solicitud de compra (SC)
- Quién: solicitante o comprador.
- Contiene: bodega destino, fecha requerida, prioridad, ítems (producto, unidad, cantidad, observación).
- Estados: `borrador → enviada → aprobada | rechazada → en proceso → atendida → cerrada` / `anulada`.
- Cada ítem lleva acumulados de cantidad ordenada y cantidad despachada a la mina, para saber qué falta.

### 4.2 Cotización (CO)
- Quién: comprador.
- Una por proveedor, con ítems tomados de una o varias solicitudes aprobadas (o libres).
- Contiene: proveedor, fecha, validez, ítems con unidad, cantidad, precio unitario, IVA, plazo de entrega. Adjunto (foto/PDF de la cotización real).
- **Comparativa**: mismo producto en columnas por proveedor; se elige el ganador por ítem. Desde ahí se generan las OC.
- Estados: `borrador → recibida → seleccionada (parcial o total) | descartada`.

### 4.3 Orden de compra (OC)
- Quién: la crea el comprador; **siempre la aprueba el aprobador** antes de poder emitirse al proveedor.
- Una por proveedor. Contiene condiciones de pago (contado / crédito a N días), bodega de entrega, ítems con unidad de compra, factor, cantidad, precio, IVA por ítem, total.
- Estados: `borrador → pendiente aprobación → aprobada | rechazada → emitida → recibida parcial → recibida → cerrada` / `anulada`. Si se rechaza, vuelve a borrador con el comentario del aprobador para corregir y reenviar.
- PDF para enviar al proveedor (solo disponible desde `aprobada`).

### 4.4 Recepción de compra (RC)
- Quién: comprador o bodeguero municipio.
- Contra una OC, permite parciales: cantidad recibida por ítem, número de remisión del proveedor, fotos.
- Convierte a unidad base y **genera entradas** en la bodega, actualizando el costo promedio.
- La OC pasa a recibida parcial / recibida según acumulados.

### 4.5 Factura de proveedor (FP) y pagos (PG)
- Factura: número, fechas de emisión y vencimiento, subtotal, IVA, **retención** (a nivel de factura), total a pagar; se asocia a una o varias recepciones de la misma OC. Estados: `pendiente → parcial → pagada` / `anulada`.
- Pago: fecha, medio (efectivo, transferencia, cheque), referencia, valor; se aplica a una o varias facturas del proveedor.
- Nota crédito: la genera una devolución a proveedor y se aplica a facturas pendientes.
- Vista de **estado de cuenta por proveedor**: facturas, pagos, notas crédito, saldo, vencidas.

### 4.6 Devolución a proveedor (DV)
- Quién: comprador.
- Referencia una recepción; ítems y cantidades a devolver, motivo (defectuoso, error, sobrante).
- **Genera salidas** de la bodega al costo de ingreso y crea la nota crédito.

### 4.7 Planilla de viaje (PL)
- Quién: comprador o bodeguero municipio.
- Contiene: bodega origen, bodega destino, vehículo, chofer, fecha de salida, ítems (cantidad en base y opcionalmente en unidad de empaque para el papel), a qué solicitud atiende cada ítem.
- Al despachar: **salida de la bodega origen**. Mientras no se reciba, la mercancía figura como **en tránsito** (se calcula desde las planillas despachadas, no es una bodega).
- Estados: `borrador → despachada → recibida parcial → recibida → cerrada` / `anulada`.
- PDF: es el documento que viaja con el chofer. Vehículo y chofer son opcionales para traslados internos entre bodegas de la misma sede.

### 4.8 Recepción en mina (RM)
- Quién: bodeguero de la bodega destino.
- Contra la planilla: cantidad recibida por ítem, y si hay diferencia, la **novedad** (faltante, sobrante, dañado) con motivo y foto.
- Se adjunta la **foto de la planilla firmada** por el chofer y el bodeguero como evidencia de la entrega.
- **Genera entradas** en la bodega de la mina por lo efectivamente recibido en buen estado.
- Las novedades quedan abiertas en un listado hasta que el municipio las resuelva (reclamo al proveedor, descuento al chofer, ajuste).

### 4.9 Vale de salida / entrega (VS)
- Quién: bodeguero.
- Contiene: receptor (persona o área), centro de costo, fecha, ítems en cualquier unidad, cantidad.
- **Genera salidas** al costo promedio. Es el consumo real de la mina.

### 4.10 Préstamo (PR) y devolución de préstamo
- Quién: bodeguero.
- Solo productos retornables. Contiene: receptor, fecha, fecha esperada de devolución, ítems y cantidades. Se controla **por cantidad**, sin serial por unidad.
- Al prestar: **salida** de la bodega; la herramienta figura **en préstamo** a nombre del receptor.
- Devolución: total o parcial, con estado (bueno, dañado, perdido). Bueno → **entrada** a bodega; dañado → entrada y ajuste de baja; perdido → se cierra sin entrada y queda registrado.
- Listado de préstamos pendientes y vencidos por persona.

### 4.11 Ajustes (AJ) y conteos
- Ajuste con motivo (daño, pérdida, corrección, vencimiento). Entra o sale al costo promedio.
- Conteo físico: se registra lo contado por producto, el sistema muestra diferencias y al cerrar genera el ajuste.

## 5. Principio central: el kardex

Todo cambio de stock pasa por una sola tabla de **movimientos de inventario**. Ningún documento modifica saldos directamente; al confirmarse, crea sus movimientos dentro de una transacción:

| Documento confirmado | Movimiento | Costo usado |
|---|---|---|
| Recepción de compra | Entrada bodega | Precio de la OC (convertido a unidad base) |
| Devolución a proveedor | Salida bodega | Costo de la recepción original |
| Planilla despachada | Salida bodega origen | Costo promedio |
| Recepción en mina | Entrada bodega destino | Costo de la planilla |
| Vale de salida | Salida bodega | Costo promedio |
| Préstamo | Salida bodega | Costo promedio |
| Devolución de préstamo | Entrada bodega (+ ajuste si dañado) | Costo del préstamo |
| Ajuste / conteo | Entrada o salida | Costo promedio |

Los saldos por bodega/producto (cantidad y costo promedio) se mantienen en una tabla desnormalizada para consultas rápidas, alertas de stock mínimo y valorización. Siempre son recalculables desde el kardex.

## 6. Propuesta técnica

**Backend (Laravel 13)**
- API REST bajo `/api`, Sanctum (login con email y contraseña, token).
- Roles y permisos con `spatie/laravel-permission`; asignación usuario ↔ bodegas.
- Módulos de dominio: `Catalog`, `Purchasing`, `Payables`, `Inventory`, `Logistics`, `Reports`.
- Lógica de negocio en *Actions* transaccionales (`ConfirmGoodsReceipt`, `DispatchShipment`, `ReceiveShipment`, `ConfirmIssue`, `ReturnLoan`…). Los controladores validan y delegan.
- Máquina de estados por documento (enum + transiciones permitidas). Aprobaciones con un registro genérico de aprobaciones.
- Consecutivos con tabla de secuencias y bloqueo en transacción.
- PDF con `barryvdh/laravel-dompdf` (OC, planilla, vale, préstamo).
- Log de actividad con `spatie/laravel-activitylog`.
- Tests de las acciones que tocan stock y cuentas por pagar.

**Frontend (Angular 21)**
- Standalone components + signals.
- **Tailwind CSS + PrimeNG** (tema Aura con preset Tailwind). Layout administrativo: sidebar por módulos, topbar con usuario y bodega activa.
- Guards por rol, interceptor de token y de errores, formularios reactivos.
- Estructura: `core/` (auth, http, guards, layout), `shared/` (tabla genérica, buscador de productos, editor de ítems reutilizable, selector de unidad con conversión), `features/` por módulo.

**Infra**
- MySQL, deploy en Virtualmin como el template. Colas de Laravel para PDF y notificaciones (más adelante).

**Limpieza del template**: retirar categorías/reviews/videos, README y `deploy.sh` a MinerStock, nombre de BD `minerstock`.

## 7. Fases

| Fase | Contenido | Resultado |
|---|---|---|
| **0. Base** ✅ | Limpieza del template, login, usuarios, roles, layout, configuración, maestros (sedes, bodegas, unidades, categorías, productos con conversiones, proveedores, vehículos, choferes, receptores, centros de costo). | Se entra al sistema y se cargan catálogos. |
| **1. Compras** ✅ | Solicitudes con aprobación → cotizaciones + comparativa → OC con aprobación y PDF. | Ciclo de compra completo. |
| **2. Inventario** ✅ | Recepciones parciales, kardex, saldos valorizados, devoluciones a proveedor, ajustes, conteos. | Stock real y valorizado por bodega. |
| **3. Cuentas por pagar** | Facturas ligadas a recepciones, pagos, notas crédito, estado de cuenta por proveedor. | Control de lo que se debe y se ha pagado. |
| **4. Logística** | Planillas con vehículo y chofer, tránsito, recepción en mina con novedades, PDF de planilla. | Mercancía llega a la mina con control. |
| **5. Consumo en mina** | Vales de salida, préstamos y devoluciones, alertas de stock mínimo. | Descarga de inventario y control de herramientas. |
| **6. Visibilidad** | Dashboard, reportes (kardex, valorizado, consumo por centro de costo, compras por proveedor, novedades, préstamos vencidos, cartera), notificaciones. | Gerencia ve el estado global. |

Cada fase se entrega funcionando de punta a punta antes de pasar a la siguiente.

## 8. Puntos abiertos

Ninguno pendiente. Los cuatro puntos menores de la versión 0.2 (aprobación de OC, préstamos por cantidad, IVA por ítem y retención por factura, foto de la planilla firmada) quedaron resueltos e incorporados en la tabla de decisiones. El planeamiento funcional está cerrado; lo que sigue es el diseño de pantallas y la construcción por fases.
