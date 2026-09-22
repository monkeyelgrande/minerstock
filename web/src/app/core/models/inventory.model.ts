import { Attachment, NamedRef, ProductRef, UnitRef, WarehouseRef } from './purchasing.model';

/** Modelos del módulo Inventario (fase 2). Espejan los Resources del API. */

export type SimpleDocStatus = 'borrador' | 'confirmado' | 'anulado';
export type StockCountStatus = 'en_proceso' | 'cerrado' | 'anulado';

export type StockMovementType =
  | 'compra_entrada'
  | 'devolucion_proveedor_salida'
  | 'despacho_salida'
  | 'recepcion_planilla_entrada'
  | 'entrega_salida'
  | 'prestamo_salida'
  | 'devolucion_prestamo_entrada'
  | 'ajuste_entrada'
  | 'ajuste_salida';

export interface MovementTypeOption {
  value: StockMovementType;
  label: string;
  inbound: boolean;
}

// ---------- Recepciones de compra ----------
export interface GoodsReceiptItem {
  id: number;
  purchase_order_item_id: number;
  product_id: number;
  product: ProductRef | null;
  unit_id: number;
  unit: UnitRef | null;
  factor: number;
  quantity: number;
  qty_base: number;
  unit_cost_base: number;
  line_cost: number;
  qty_returned_base: number;
  returnable_base: number;
  order_item: { qty_base: number; qty_received_base: number; pending_base: number } | null;
  notes: string | null;
}

export interface GoodsReceipt {
  id: number;
  number: string;
  purchase_order_id: number;
  order?: { id: number; number: string; status: string; status_label: string; supplier: { id: number; name: string; document_number: string } | null };
  warehouse_id: number;
  warehouse?: WarehouseRef;
  supplier_remission: string | null;
  received_at: string;
  receiver?: NamedRef;
  status: SimpleDocStatus;
  status_label: string;
  is_editable: boolean;
  notes: string | null;
  confirmed_at: string | null;
  items_count?: number;
  total_cost?: number;
  items?: GoodsReceiptItem[];
  returns?: { id: number; number: string; date: string; status: SimpleDocStatus; status_label: string; total_cost: number }[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface GoodsReceiptPayload {
  purchase_order_id: number;
  warehouse_id?: number | null;
  supplier_remission?: string | null;
  received_at: string;
  received_by?: number | null;
  notes?: string | null;
  items: { id?: number; purchase_order_item_id: number; unit_id?: number | null; quantity: number; notes?: string | null }[];
}

/** Orden que admite recepción con sus ítems pendientes (endpoint receivable-orders). */
export interface ReceivableOrder {
  id: number;
  number: string;
  status: string;
  status_label: string;
  date: string;
  expected_date: string | null;
  supplier: NamedRef;
  warehouse: WarehouseRef;
  items: {
    id: number;
    product: ProductRef & { base_unit_id: number };
    units: { id: number; code: string; factor: number }[];
    unit: UnitRef;
    factor: number;
    quantity: number;
    qty_base: number;
    qty_received_base: number;
    pending_base: number;
    unit_price: number;
    base_unit_cost: number;
  }[];
}

// ---------- Devoluciones a proveedor ----------
export type SupplierReturnReason = 'defectuoso' | 'error_pedido' | 'sobrante' | 'vencido' | 'otro';

export interface SupplierReturnItem {
  id: number;
  goods_receipt_item_id: number;
  product_id: number;
  product: ProductRef | null;
  qty_base: number;
  unit_cost_base: number;
  line_cost: number;
  received_base: number | null;
  notes: string | null;
}

export interface SupplierReturn {
  id: number;
  number: string;
  supplier_id: number;
  supplier?: { id: number; name: string; document_number: string };
  goods_receipt_id: number;
  receipt?: { id: number; number: string; received_at: string; order: { id: number; number: string } | null };
  warehouse_id: number;
  warehouse?: WarehouseRef;
  date: string;
  reason: SupplierReturnReason;
  reason_label: string;
  status: SimpleDocStatus;
  status_label: string;
  is_editable: boolean;
  total_cost: number;
  notes: string | null;
  confirmed_at: string | null;
  items_count?: number;
  items?: SupplierReturnItem[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface SupplierReturnPayload {
  goods_receipt_id: number;
  date: string;
  reason: SupplierReturnReason;
  notes?: string | null;
  items: { id?: number; goods_receipt_item_id: number; qty_base: number; notes?: string | null }[];
}

// ---------- Ajustes ----------
export interface AdjustmentItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  qty_base: number;
  unit_cost: number | null;
  line_cost: number | null;
  notes: string | null;
}

export interface Adjustment {
  id: number;
  number: string;
  warehouse_id: number;
  warehouse?: WarehouseRef;
  date: string;
  reason: string;
  reason_label: string;
  status: SimpleDocStatus;
  status_label: string;
  is_editable: boolean;
  stock_count_id: number | null;
  stock_count?: { id: number; number: string } | null;
  notes: string | null;
  confirmed_at: string | null;
  items_count?: number;
  items?: AdjustmentItem[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface AdjustmentPayload {
  warehouse_id: number;
  date: string;
  reason: string;
  notes?: string | null;
  items: { id?: number; product_id: number; qty_base: number; unit_cost?: number | null; notes?: string | null }[];
}

// ---------- Conteos físicos ----------
export interface StockCountItem {
  id: number;
  product_id: number;
  product: (ProductRef & { category: string | null }) | null;
  system_qty: number;
  counted_qty: number | null;
  difference: number | null;
  notes: string | null;
}

export interface StockCount {
  id: number;
  number: string;
  warehouse_id: number;
  warehouse?: WarehouseRef;
  date: string;
  status: StockCountStatus;
  status_label: string;
  is_open: boolean;
  counter?: NamedRef;
  notes: string | null;
  adjustment_id: number | null;
  adjustment?: { id: number; number: string } | null;
  closed_at: string | null;
  items_count?: number;
  summary?: { total: number; counted: number; with_difference: number } | null;
  items?: StockCountItem[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface StockCountPayload {
  warehouse_id: number;
  date: string;
  counted_by?: number | null;
  notes?: string | null;
  scope: 'all' | 'category' | 'products';
  category_id?: number | null;
  product_ids?: number[];
}

// ---------- Stock y kardex ----------
export interface StockCell {
  warehouse_id: number;
  qty: number;
  avg_cost: number;
  value: number;
  min_stock: number;
  below_min: boolean;
}

export interface StockRow {
  product: { id: number; sku: string; name: string; kind: 'consumible' | 'retornable'; base_unit: string; category: string | null };
  cells: StockCell[];
  total_qty: number;
  total_value: number;
  avg_cost: number;
  below_min: boolean;
  in_transit: number;
  on_loan: number;
}

export interface StockTotals {
  total_value: number;
  products_with_stock: number;
  below_min: number;
  in_transit_value: number;
  on_loan_value?: number;
  on_loan_count: number;
}

export interface StockMatrix {
  data: StockRow[];
  warehouses: (WarehouseRef & { site: string | null })[];
  totals: StockTotals;
  meta: { current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null };
}

export interface StockMovement {
  id: number;
  warehouse_id: number;
  warehouse?: WarehouseRef;
  product_id: number;
  product?: ProductRef;
  type: StockMovementType;
  type_label: string;
  is_inbound: boolean;
  is_reversal: boolean;
  qty_base: number;
  unit_cost: number;
  total_cost: number;
  balance_qty_after: number;
  balance_cost_after: number;
  balance_value_after: number;
  source: { type: 'goods_receipt' | 'supplier_return' | 'adjustment' | string; id: number; number: string | null } | null;
  moved_at: string;
  user?: NamedRef;
  notes: string | null;
}

export interface ProductWarehouseBalance {
  warehouse_id: number;
  warehouse: string;
  qty: number;
  avg_cost: number;
}

/** Ruta de detalle del documento origen de un movimiento. */
export function sourceRoute(source: StockMovement['source']): string[] | null {
  if (!source) return null;
  switch (source.type) {
    case 'goods_receipt':
      return ['/inventario/recepciones', String(source.id)];
    case 'supplier_return':
      return ['/inventario/devoluciones', String(source.id)];
    case 'adjustment':
      return ['/inventario/ajustes', String(source.id)];
    default:
      return null;
  }
}
