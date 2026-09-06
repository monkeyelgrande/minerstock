# MinerStock — Modelo de datos

> Versión 0.1 (2026-09-06). Primera pasada detallada. Nombres de tablas en inglés (convención Laravel), etiquetas de pantalla en español.
> Convenciones: todas las tablas tienen `id`, `created_at`, `updated_at`. Las cantidades de stock son `decimal(14,3)`; los valores en pesos `decimal(14,2)`. Los documentos guardan `created_by` (usuario). Los maestros tienen `is_active`.

## 1. Seguridad y configuración

### users
| Campo | Tipo | Nota |
|---|---|---|
| name, email, password | | email único |
| is_active | bool | |
| default_warehouse_id | FK warehouses, null | bodega que se abre por defecto |

### roles, permissions, model_has_roles, role_has_permissions
Tablas de `spatie/laravel-permission`. Roles iniciales: `admin`, `solicitante`, `aprobador`, `comprador`, `tesoreria`, `bodeguero`, `consulta`.

### user_warehouse
`user_id`, `warehouse_id`. Bodegas sobre las que el usuario puede operar. Admin y consulta ven todas.

### settings
`key` (único), `value` (json). Claves iniciales: `company` (nombre, NIT, dirección, logo), `default_tax_rate`. Las aprobaciones de solicitudes y OC son siempre obligatorias, no se configuran.

### document_sequences
| Campo | Nota |
|---|---|
| doc_type | `SC, CO, OC, RC, DV, FP, PG, PL, RM, VS, PR, AJ, CF` |
| prefix | ej. `OC-` |
| next_number | int; se lee con `lockForUpdate` dentro de la transacción del documento |
| padding | 5 → `OC-00001` |

## 2. Maestros

### sites (sedes)
`name`, `type` (`municipio` \| `mina`), `address`, `is_active`.

### warehouses (bodegas)
`site_id`, `code`, `name`, `is_active`. Unicidad de `code`.

### units (unidades)
`code` (UND, KG, LT, M, CAJA, BULTO, GAL…), `name`, `allows_decimals` (bool).

### product_categories
`name`, `parent_id` (null, para subcategorías).

### products
| Campo | Tipo | Nota |
|---|---|---|
| sku | string único | código interno |
| name, description | | |
| category_id | FK | |
| base_unit_id | FK units | unidad en la que se guarda el stock |
| kind | enum `consumible` \| `retornable` | retornable = se presta |
| default_min_stock | decimal | alerta global; se puede sobreescribir por bodega |
| barcode | string null | para después |
| image_path | null | |

### product_units (unidades alternas / conversiones)
| Campo | Nota |
|---|---|
| product_id, unit_id | único por pareja |
| factor | cuántas unidades base contiene 1 de esta unidad (caja = 12 UND → factor 12) |
| is_default_purchase | bool; unidad sugerida al comprar |

La unidad base se considera implícitamente con factor 1. Todo documento con ítems guarda `unit_id`, `factor` (copiado en el momento) y `quantity`, y deriva `qty_base = quantity × factor`.

### warehouse_product (parámetros por bodega)
`warehouse_id`, `product_id`, `min_stock`, `max_stock` (null). Opcional; si no existe se usa `default_min_stock`.

### suppliers (proveedores)
`document_type`, `document_number` (NIT, único), `name`, `contact_name`, `phone`, `email`, `address`, `city`, `payment_terms_days` (0 = contado), `notes`, `is_active`.

### vehicles
`plate` (único), `type` (camión, camioneta, moto…), `brand`, `capacity_kg`, `ownership` (`propio` \| `tercero`), `owner_name`, `is_active`.

### drivers (choferes)
`document_number` (único), `name`, `phone`, `license_number`, `license_category`, `license_expires_at`, `is_active`.

### cost_centers (centros de costo)
`code`, `name`, `site_id` (null), `is_active`. Ej: Frente 1, Planta, Mantenimiento, Campamento.

### recipients (receptores)
| Campo | Nota |
|---|---|
| type | `persona` \| `area` |
| name | |
| document_number | null |
| phone | null |
| cost_center_id | FK null; centro de costo por defecto al entregar |
| site_id | FK null |

## 3. Compras

### purchase_requests (solicitudes de compra, SC)
| Campo | Nota |
|---|---|
| number | `SC-00001` |
| warehouse_id | bodega destino |
| requested_by | FK users |
| required_date | fecha requerida |
| priority | `baja` \| `normal` \| `alta` \| `urgente` |
| status | `borrador, enviada, aprobada, rechazada, en_proceso, atendida, cerrada, anulada` |
| notes | |
| approved_by, approved_at, rejection_reason | |

### purchase_request_items
`purchase_request_id`, `product_id`, `unit_id`, `factor`, `quantity`, `qty_base`, `notes`, `qty_ordered_base` (acumulado de OC), `qty_shipped_base` (acumulado despachado a la mina). Estos acumulados se actualizan al confirmar OC y planillas.

### quotations (cotizaciones, CO)
| Campo | Nota |
|---|---|
| number | `CO-00001` |
| supplier_id | |
| date, valid_until | |
| status | `borrador, recibida, seleccionada, descartada` |
| subtotal, tax, total | calculados |
| notes | |

### quotation_items
`quotation_id`, `product_id`, `purchase_request_item_id` (null), `unit_id`, `factor`, `quantity`, `unit_price`, `tax_rate`, `delivery_days`, `notes`, `is_selected` (bool; ganador en la comparativa), `purchase_order_item_id` (null; se llena al generar la OC).

### purchase_orders (órdenes de compra, OC)
| Campo | Nota |
|---|---|
| number | `OC-00001` |
| supplier_id | |
| warehouse_id | bodega de entrega |
| date, expected_date | |
| payment_terms | `contado` \| `credito` |
| payment_days | int |
| status | `borrador, pendiente_aprobacion, aprobada, rechazada, emitida, recibida_parcial, recibida, cerrada, anulada` |
| subtotal, tax, total | |
| notes | |
| approved_by, approved_at, rejection_reason | |
| issued_at | cuando se emite al proveedor |

### purchase_order_items
`purchase_order_id`, `product_id`, `purchase_request_item_id` (null), `unit_id`, `factor`, `quantity`, `qty_base`, `unit_price` (por unidad de compra), `tax_rate`, `line_total`, `qty_received_base` (acumulado), `qty_returned_base` (acumulado devoluciones).

Costo unitario en base = `unit_price / factor`.

### approvals (registro de aprobaciones)
Polimórfico: `approvable_type`, `approvable_id`, `requested_by`, `decided_by` (null), `status` (`pendiente, aprobada, rechazada`), `decided_at`, `comment`. Sirve para la bandeja del aprobador y como historial.

## 4. Inventario

### goods_receipts (recepciones de compra, RC)
| Campo | Nota |
|---|---|
| number | `RC-00001` |
| purchase_order_id | |
| warehouse_id | copiada de la OC, editable |
| supplier_remission | número de remisión/guía del proveedor |
| received_at | |
| received_by | |
| status | `borrador, confirmada, anulada` |
| notes | |

### goods_receipt_items
`goods_receipt_id`, `purchase_order_item_id`, `product_id`, `unit_id`, `factor`, `quantity`, `qty_base`, `unit_cost_base` (copiado del precio OC / factor), `notes`.

Validación: acumulado recibido no puede superar lo ordenado (configurable con tolerancia).

### supplier_returns (devoluciones a proveedor, DV)
| Campo | Nota |
|---|---|
| number | `DV-00001` |
| supplier_id | |
| goods_receipt_id | recepción origen |
| warehouse_id | |
| date | |
| reason | `defectuoso, error_pedido, sobrante, otro` |
| status | `borrador, confirmada, anulada` |
| notes | |

### supplier_return_items
`supplier_return_id`, `goods_receipt_item_id`, `product_id`, `qty_base`, `unit_cost_base`, `notes`.

### stock_movements (kardex)
| Campo | Nota |
|---|---|
| warehouse_id, product_id | |
| type | `compra_entrada, devolucion_proveedor_salida, despacho_salida, recepcion_planilla_entrada, entrega_salida, prestamo_salida, devolucion_prestamo_entrada, ajuste_entrada, ajuste_salida` |
| qty_base | con signo (+ entrada / − salida) |
| unit_cost | costo unitario base |
| total_cost | qty × unit_cost |
| balance_qty_after, balance_cost_after | saldo resultante (para leer el kardex sin recalcular) |
| source_type, source_id | documento origen (polimórfico) |
| moved_at | fecha del movimiento |
| user_id | |
| notes | |

Índices: `(warehouse_id, product_id, moved_at)`, `(source_type, source_id)`.

### stock_balances (saldos)
`warehouse_id`, `product_id` (único), `qty`, `avg_cost`, `last_movement_at`. Regla del promedio: en entradas `avg = (qty_ant × avg_ant + qty_in × cost_in) / (qty_ant + qty_in)`; en salidas no cambia.

### adjustments (ajustes, AJ)
`number`, `warehouse_id`, `date`, `reason` (`daño, perdida, correccion, vencimiento, conteo, devolucion_prestamo_danada, otro`), `status` (`borrador, confirmado, anulado`), `stock_count_id` (null), `notes`, `approved_by` (null).

### adjustment_items
`adjustment_id`, `product_id`, `qty_base` (con signo), `unit_cost` (al confirmar, promedio actual), `notes`.

### stock_counts (conteos físicos, CF)
`number`, `warehouse_id`, `date`, `status` (`en_proceso, cerrado, anulado`), `counted_by`, `notes`, `adjustment_id` (null; se llena al cerrar).

### stock_count_items
`stock_count_id`, `product_id`, `system_qty` (foto al abrir/ al agregar), `counted_qty`, `difference` (calculado).

## 5. Cuentas por pagar

### supplier_invoices (facturas de proveedor, FP)
| Campo | Nota |
|---|---|
| number | consecutivo interno `FP-00001` |
| supplier_invoice_number | número de la factura del proveedor |
| supplier_id | |
| purchase_order_id | null (puede haber factura sin OC, ej. compra menor) |
| issue_date, due_date | |
| subtotal, tax | IVA = suma de `tax_rate` por ítem de las recepciones cubiertas; editable |
| withholding | retención a nivel de factura (valor en pesos) |
| total | `subtotal + tax − withholding` = total a pagar |
| paid_amount, credited_amount | acumulados |
| status | `pendiente, parcial, pagada, anulada` |
| notes | |

### supplier_invoice_receipts
`supplier_invoice_id`, `goods_receipt_id`. Una factura cubre una o varias recepciones; una recepción se asocia a una sola factura.

### supplier_credit_notes (notas crédito)
`number`, `supplier_id`, `supplier_return_id` (null), `supplier_note_number`, `date`, `amount`, `applied_amount`, `status` (`disponible, aplicada, anulada`).

### supplier_credit_note_applications
`supplier_credit_note_id`, `supplier_invoice_id`, `amount`.

### supplier_payments (pagos, PG)
`number`, `supplier_id`, `date`, `method` (`efectivo, transferencia, cheque, otro`), `reference`, `amount`, `notes`, `status` (`confirmado, anulado`).

### supplier_payment_allocations
`supplier_payment_id`, `supplier_invoice_id`, `amount`. La suma de aplicaciones de un pago = su `amount`.

Saldo de una factura = `total − paid_amount − credited_amount`. Saldo del proveedor = suma de saldos de facturas pendientes/parciales.

## 6. Logística

### shipments (planillas de viaje, PL)
| Campo | Nota |
|---|---|
| number | `PL-00001` |
| origin_warehouse_id, destination_warehouse_id | distintas |
| vehicle_id, driver_id | null para traslados internos |
| dispatched_at | |
| dispatched_by | |
| status | `borrador, despachada, recibida_parcial, recibida, cerrada, anulada` |
| notes | |

### shipment_items
`shipment_id`, `product_id`, `purchase_request_item_id` (null), `unit_id`, `factor`, `quantity`, `qty_base`, `unit_cost` (promedio al despachar), `qty_received_base` (acumulado), `notes`.

### shipment_receipts (recepciones en destino, RM)
`number`, `shipment_id`, `received_at`, `received_by`, `status` (`confirmada, anulada`), `notes`. La **foto de la planilla firmada** se guarda como `attachment` de la recepción con `purpose = planilla_firmada`; es obligatoria para confirmar.

### shipment_receipt_items
`shipment_receipt_id`, `shipment_item_id`, `product_id`, `qty_received_base`, `qty_missing_base`, `qty_damaged_base`, `qty_extra_base`, `notes`.

### shipment_novelties (novedades)
`shipment_receipt_item_id`, `type` (`faltante, dañado, sobrante`), `qty_base`, `description`, `status` (`abierta, resuelta`), `resolution` (texto), `resolved_by`, `resolved_at`. Se crea automáticamente cuando hay diferencia.

Lo que está **en tránsito** por producto = suma de `qty_base − qty_received_base` de ítems de planillas en estado `despachada` o `recibida_parcial`.

## 7. Consumo y préstamos

### issues (vales de salida, VS)
`number`, `warehouse_id`, `recipient_id`, `cost_center_id`, `date`, `issued_by`, `status` (`borrador, confirmado, anulado`), `notes`.

### issue_items
`issue_id`, `product_id`, `unit_id`, `factor`, `quantity`, `qty_base`, `unit_cost` (promedio al confirmar), `notes`.

### loans (préstamos, PR)
| Campo | Nota |
|---|---|
| number | `PR-00001` |
| warehouse_id | |
| recipient_id | |
| loaned_at, expected_return_at | |
| loaned_by | |
| status | `abierto, parcial, devuelto, cerrado_con_perdida, anulado` |
| notes | |

### loan_items
`loan_id`, `product_id` (solo `kind = retornable`), `qty_base`, `unit_cost`, `qty_returned_base`, `qty_damaged_base`, `qty_lost_base`. Control por cantidad, sin serial.

### loan_returns
`loan_id`, `returned_at`, `received_by`, `notes`.

### loan_return_items
`loan_return_id`, `loan_item_id`, `qty_base`, `condition` (`bueno, dañado, perdido`), `notes`. Bueno y dañado generan entrada; dañado además crea un ajuste de salida con motivo `devolucion_prestamo_danada`. Perdido no genera entrada.

Lo que está **en préstamo** por producto y receptor = `qty_base − qty_returned − qty_damaged − qty_lost` de préstamos abiertos o parciales.

## 8. Transversales

### attachments
Polimórfico: `attachable_type`, `attachable_id`, `purpose` (null; ej. `planilla_firmada`, `cotizacion_proveedor`, `factura`, `evidencia_novedad`), `path`, `original_name`, `mime`, `size`, `uploaded_by`. Se usa en cotizaciones, recepciones, novedades, facturas, planillas.

### activity_log
Tabla de `spatie/laravel-activitylog`. Registra creación, cambios de estado, anulaciones, aprobaciones.

### notifications
Tabla estándar de Laravel. Eventos iniciales: solicitud pendiente de aprobación, OC pendiente de aprobación, planilla despachada hacia mi bodega, novedad abierta, stock bajo mínimo, factura próxima a vencer, préstamo vencido.

## 9. Reglas de negocio clave

1. **Stock nunca negativo.** Salidas (despacho, vale, préstamo, devolución a proveedor, ajuste negativo) validan saldo disponible en la bodega dentro de la transacción con bloqueo del registro de `stock_balances`.
2. **Confirmar es irreversible.** Un documento confirmado solo se anula, y anular genera movimientos inversos; no se puede anular si tiene documentos hijos confirmados (ej. una RC con factura asociada o una PL ya recibida).
3. **Conversión al confirmar.** `factor` se copia al ítem en el momento de crearlo; cambios posteriores en el maestro no afectan documentos existentes.
4. **Acumulados siempre desde hijos.** `qty_received_base`, `qty_ordered_base`, `paid_amount`, etc. se recalculan a partir de los documentos hijos al confirmar/anular, nunca se editan a mano.
5. **Aprobación obligatoria.** Toda solicitud y toda OC pasan por `pendiente_aprobacion` y solo el rol aprobador las mueve a `aprobada` o `rechazada`. Una OC solo se emite al proveedor desde `aprobada`. Editar una OC aprobada la regresa a borrador y exige nueva aprobación. Un rechazo regresa el documento a borrador con el comentario.
6. **Visibilidad por bodega.** Las consultas de documentos e inventario filtran por las bodegas asignadas al usuario, salvo `admin` y `consulta`.

## 10. Diagrama de relaciones (resumen)

```
purchase_requests ─< purchase_request_items ─< quotation_items >─ quotations >─ suppliers
                                            └─< purchase_order_items >─ purchase_orders >─ suppliers
                                            └─< shipment_items
purchase_orders ─< goods_receipts ─< goods_receipt_items ─< supplier_return_items >─ supplier_returns
goods_receipts >─< supplier_invoices ─< supplier_payment_allocations >─ supplier_payments
supplier_returns ─ supplier_credit_notes ─< supplier_credit_note_applications >─ supplier_invoices
shipments ─< shipment_items ─< shipment_receipt_items >─ shipment_receipts ; shipment_receipt_items ─< shipment_novelties
issues ─< issue_items ; loans ─< loan_items ─< loan_return_items >─ loan_returns
adjustments ─< adjustment_items ; stock_counts ─< stock_count_items
[todo documento confirmado] ─< stock_movements >─ warehouses, products ; stock_balances (warehouse × product)
```
