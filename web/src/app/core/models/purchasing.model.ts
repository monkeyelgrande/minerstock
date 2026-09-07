/** Modelos del módulo Compras (fase 1). Espejan los Resources del API. */

export type PurchaseRequestStatus =
  | 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'en_proceso' | 'atendida' | 'cerrada' | 'anulada';
export type QuotationStatus = 'borrador' | 'recibida' | 'seleccionada' | 'descartada';
export type PurchaseOrderStatus =
  | 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada' | 'emitida' | 'recibida_parcial' | 'recibida' | 'cerrada' | 'anulada';
export type Priority = 'baja' | 'normal' | 'alta' | 'urgente';

export const PRIORITY_LABELS: Record<Priority, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

export interface NamedRef { id: number; name: string }
export interface WarehouseRef { id: number; code: string; name: string }
export interface ProductRef { id: number; sku: string; name: string; base_unit: string | null }
export interface UnitRef { id: number; code: string; name?: string }

export interface Approval {
  id: number;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  requester?: NamedRef;
  decider?: NamedRef | null;
  decided_at: string | null;
  comment: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  purpose: string | null;
  url: string;
  original_name: string;
  mime: string | null;
  size: number;
  is_image: boolean;
  uploaded_by?: NamedRef;
  created_at: string;
}

export type AttachableType =
  | 'purchase_request'
  | 'quotation'
  | 'purchase_order'
  | 'goods_receipt'
  | 'supplier_return'
  | 'adjustment'
  | 'supplier_invoice'
  | 'supplier_payment'
  | 'supplier_credit_note';

// ---------- Solicitudes de compra ----------
export interface PurchaseRequestItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  unit_id: number;
  unit: UnitRef | null;
  factor: number;
  quantity: number;
  qty_base: number;
  qty_ordered_base: number;
  qty_shipped_base: number;
  pending_base: number;
  notes: string | null;
}

export interface PurchaseRequest {
  id: number;
  number: string;
  warehouse_id: number;
  warehouse?: WarehouseRef;
  requested_by: number;
  requester?: NamedRef;
  required_date: string | null;
  priority: Priority;
  status: PurchaseRequestStatus;
  status_label: string;
  is_editable: boolean;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approver?: NamedRef | null;
  rejection_reason: string | null;
  items_count?: number;
  items?: PurchaseRequestItem[];
  progress?: { ordered: number; shipped: number };
  approvals?: Approval[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

/** Payload de creación/edición de solicitud. */
export interface PurchaseRequestPayload {
  warehouse_id: number;
  requested_by?: number | null;
  required_date?: string | null;
  priority: Priority;
  notes?: string | null;
  items: { id?: number; product_id: number; unit_id: number; quantity: number; notes?: string | null }[];
}

/** Ítem de solicitud aprobada pendiente de ordenar (endpoint pending-items). */
export interface PendingRequestItem {
  id: number;
  request: { id: number; number: string; priority: Priority; required_date: string | null; warehouse: WarehouseRef };
  product: ProductRef;
  unit: UnitRef;
  factor: number;
  quantity: number;
  qty_base: number;
  qty_ordered_base: number;
  pending_base: number;
  notes: string | null;
}

// ---------- Cotizaciones ----------
export interface QuotationItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  purchase_request_item_id: number | null;
  request: { id: number; number: string | null; pending_base: number } | null;
  unit_id: number;
  unit: UnitRef | null;
  factor: number;
  quantity: number;
  qty_base: number;
  unit_price: number;
  base_price: number;
  tax_rate: number;
  line_total: number;
  delivery_days: number | null;
  notes: string | null;
  is_selected: boolean;
  purchase_order_item_id: number | null;
}

export interface Quotation {
  id: number;
  number: string;
  supplier_id: number;
  supplier?: { id: number; name: string; document_number: string; payment_terms_days: number };
  date: string;
  valid_until: string | null;
  is_expired: boolean;
  status: QuotationStatus;
  status_label: string;
  is_editable: boolean;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  items_count?: number;
  items?: QuotationItem[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface QuotationPayload {
  supplier_id: number;
  date: string;
  valid_until?: string | null;
  notes?: string | null;
  items: {
    id?: number;
    product_id: number;
    purchase_request_item_id?: number | null;
    unit_id: number;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
    delivery_days?: number | null;
    notes?: string | null;
  }[];
}

// ---------- Comparativa ----------
export interface ComparisonOffer {
  quotation_item_id: number;
  quotation_id: number;
  quotation_number: string;
  supplier_id: number;
  valid_until: string | null;
  unit: string;
  factor: number;
  quantity: number;
  qty_base: number;
  unit_price: number;
  base_price: number;
  tax_rate: number;
  line_total: number;
  delivery_days: number | null;
  is_selected: boolean;
  is_best: boolean;
}

export interface ComparisonRow {
  key: string;
  product: { id: number; sku: string; name: string; base_unit: string };
  request: { id: number; number: string; item_id: number; qty_base: number; pending_base: number } | null;
  selected_quotation_item_id: number | null;
  offers: ComparisonOffer[];
}

export interface ComparisonMatrix {
  suppliers: NamedRef[];
  rows: ComparisonRow[];
}

// ---------- Órdenes de compra ----------
export interface PurchaseOrderItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  purchase_request_item_id: number | null;
  request: { id: number; number: string | null } | null;
  quotation_item_id: number | null;
  unit_id: number;
  unit: UnitRef | null;
  factor: number;
  quantity: number;
  qty_base: number;
  unit_price: number;
  base_unit_cost: number;
  tax_rate: number;
  line_total: number;
  qty_received_base: number;
  qty_returned_base: number;
  pending_base: number;
  notes: string | null;
}

export interface PurchaseOrder {
  id: number;
  number: string;
  supplier_id: number;
  supplier?: { id: number; name: string; document_number: string; contact_name: string | null; phone: string | null; email: string | null };
  warehouse_id: number;
  warehouse?: WarehouseRef;
  date: string;
  expected_date: string | null;
  payment_terms: 'contado' | 'credito';
  payment_days: number;
  status: PurchaseOrderStatus;
  status_label: string;
  is_editable: boolean;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  issued_at: string | null;
  approver?: NamedRef | null;
  rejection_reason: string | null;
  items_count?: number;
  received_pct?: number;
  items?: PurchaseOrderItem[];
  receipts?: { id: number; number: string; received_at: string; supplier_remission: string | null; status: string; status_label: string; items_count: number | null }[];
  can_receive?: boolean;
  approvals?: Approval[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderPayload {
  supplier_id: number;
  warehouse_id: number;
  date: string;
  expected_date?: string | null;
  payment_terms?: 'contado' | 'credito';
  payment_days?: number;
  notes?: string | null;
  items: {
    id?: number;
    product_id: number;
    purchase_request_item_id?: number | null;
    quotation_item_id?: number | null;
    unit_id: number;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
    notes?: string | null;
  }[];
}

// ---------- Bandeja de aprobaciones ----------
export interface InboxItem {
  type: 'purchase_request' | 'purchase_order';
  id: number;
  number: string;
  title: string;
  subtitle: string;
  requester: string;
  priority: Priority | null;
  submitted_at: string | null;
  items_count: number;
  items_preview: string[];
  total: number | null;
  notes: string | null;
}

export interface Inbox {
  purchase_requests: InboxItem[];
  purchase_orders: InboxItem[];
  counts: { purchase_requests: number; purchase_orders: number };
}

export interface ApprovalHistoryItem {
  id: number;
  type: 'purchase_request' | 'purchase_order';
  document_id: number;
  number: string | null;
  status: 'aprobada' | 'rechazada';
  requester: string | null;
  decider: string | null;
  decided_at: string | null;
  comment: string | null;
}

/** Tono de chip por estado (ver docs/05-design-system.md). */
export function statusTone(status: string): 'draft' | 'pending' | 'success' | 'partial' | 'danger' | 'info' {
  switch (status) {
    case 'borrador':
      return 'draft';
    case 'enviada':
    case 'pendiente_aprobacion':
    case 'emitida':
      return 'pending';
    case 'aprobada':
    case 'recibida':
    case 'seleccionada':
    case 'atendida':
      return 'success';
    case 'en_proceso':
    case 'recibida_parcial':
      return 'partial';
    case 'rechazada':
    case 'anulada':
    case 'descartada':
      return 'danger';
    case 'cerrada':
      return 'info';
    default:
      return 'draft';
  }
}

export function priorityTone(p: Priority): 'draft' | 'pending' | 'partial' | 'danger' {
  return p === 'urgente' ? 'danger' : p === 'alta' ? 'partial' : p === 'normal' ? 'draft' : 'pending';
}
