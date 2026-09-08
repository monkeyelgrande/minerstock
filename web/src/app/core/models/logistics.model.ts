import { Attachment, NamedRef, Priority, ProductRef, UnitRef, WarehouseRef } from './purchasing.model';
import { SimpleDocStatus } from './inventory.model';

/** Modelos del módulo Logística (fase 4). Espejan los Resources del API. */

export type ShipmentStatus = 'borrador' | 'despachada' | 'recibida_parcial' | 'recibida' | 'cerrada' | 'anulada';
export type NoveltyType = 'faltante' | 'dañado' | 'sobrante';

// ---------- Planillas ----------
export interface ShipmentItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  purchase_request_item_id: number | null;
  request: { id: number; number: string | null } | null;
  unit_id: number;
  unit: UnitRef | null;
  factor: number;
  quantity: number;
  qty_base: number;
  unit_cost: number;
  line_cost: number;
  qty_received_base: number;
  pending_base: number;
  notes: string | null;
}

export interface Shipment {
  id: number;
  number: string;
  origin_warehouse_id: number;
  origin?: WarehouseRef;
  destination_warehouse_id: number;
  destination?: WarehouseRef;
  vehicle_id: number | null;
  vehicle?: { id: number; plate: string; type: string; brand: string | null } | null;
  driver_id: number | null;
  driver?: { id: number; name: string; document_number: string; phone: string | null } | null;
  status: ShipmentStatus;
  status_label: string;
  is_editable: boolean;
  can_receive: boolean;
  dispatched_at: string | null;
  dispatcher?: NamedRef | null;
  notes: string | null;
  items_count?: number;
  total_cost?: number;
  received_pct?: number;
  items?: ShipmentItem[];
  receipts?: { id: number; number: string; received_at: string; status: SimpleDocStatus; status_label: string }[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface ShipmentPayload {
  origin_warehouse_id: number;
  destination_warehouse_id: number;
  vehicle_id?: number | null;
  driver_id?: number | null;
  notes?: string | null;
  items: {
    id?: number;
    product_id: number;
    purchase_request_item_id?: number | null;
    unit_id: number;
    quantity: number;
    notes?: string | null;
  }[];
}

/** Ítem de solicitud aprobada pendiente de despachar hacia una bodega destino. */
export interface ShippablePendingItem {
  id: number;
  request: { id: number; number: string; priority: Priority; required_date: string | null };
  product: ProductRef;
  unit: UnitRef;
  factor: number;
  qty_base: number;
  qty_shipped_base: number;
  pending_base: number;
  origin_stock: number;
  notes: string | null;
}

// ---------- Recepción en destino ----------
export interface ShipmentReceiptItem {
  id: number;
  shipment_item_id: number;
  product_id: number;
  product: ProductRef | null;
  shipment_item: { qty_base: number; pending_base: number; unit_cost: number } | null;
  qty_received_base: number;
  qty_missing_base: number;
  qty_damaged_base: number;
  qty_extra_base: number;
  has_novelty: boolean;
  notes: string | null;
}

export interface ShipmentReceipt {
  id: number;
  number: string;
  shipment_id: number;
  shipment?: {
    id: number;
    number: string;
    status: ShipmentStatus;
    status_label: string;
    origin: WarehouseRef | null;
    destination: WarehouseRef | null;
    vehicle: { plate: string } | null;
    driver: { name: string } | null;
    dispatched_at: string | null;
  };
  received_at: string;
  receiver?: NamedRef;
  status: SimpleDocStatus;
  status_label: string;
  is_editable: boolean;
  has_signed_sheet: boolean;
  signed_sheet_purpose: string;
  notes: string | null;
  confirmed_at: string | null;
  items_count?: number;
  items?: ShipmentReceiptItem[];
  novelties?: { id: number; type: NoveltyType; type_label: string; qty_base: number; status: string; description: string | null }[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface ShipmentReceiptPayload {
  shipment_id: number;
  received_at: string;
  received_by?: number | null;
  notes?: string | null;
  items: {
    shipment_item_id: number;
    qty_received_base: number;
    qty_damaged_base?: number;
    qty_extra_base?: number;
    notes?: string | null;
  }[];
}

// ---------- Novedades ----------
export interface Novelty {
  id: number;
  type: NoveltyType;
  type_label: string;
  qty_base: number;
  description: string | null;
  status: 'abierta' | 'resuelta';
  resolution: string | null;
  resolver: NamedRef | null;
  resolved_at: string | null;
  product: ProductRef | null;
  receipt: { id: number; number: string; received_at: string } | null;
  shipment: { id: number; number: string; origin: string | null; destination: string | null; driver: string | null } | null;
  created_at: string;
}

// ---------- En tránsito ----------
export interface InTransitShipment {
  id: number;
  number: string;
  status: ShipmentStatus;
  status_label: string;
  origin: NamedRef;
  destination: NamedRef;
  vehicle_plate: string | null;
  driver_name: string | null;
  dispatched_at: string | null;
  days_in_transit: number | null;
  items: { product: ProductRef; pending_base: number; value: number }[];
  pending_value: number;
}

/** Tono de chip por estado de planilla. */
export function shipmentTone(status: string): 'draft' | 'pending' | 'success' | 'partial' | 'danger' | 'info' {
  switch (status) {
    case 'borrador':
      return 'draft';
    case 'despachada':
      return 'partial';
    case 'recibida_parcial':
      return 'pending';
    case 'recibida':
    case 'confirmado':
      return 'success';
    case 'cerrada':
      return 'info';
    case 'anulada':
    case 'anulado':
      return 'danger';
    default:
      return 'draft';
  }
}

export function noveltyTone(type: NoveltyType): 'danger' | 'partial' | 'info' {
  return type === 'faltante' ? 'danger' : type === 'dañado' ? 'partial' : 'info';
}
