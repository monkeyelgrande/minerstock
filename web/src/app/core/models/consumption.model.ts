/** Modelos del módulo Consumo en mina (fase 5): vales de salida y préstamos. */

import { Attachment, NamedRef, ProductRef, UnitRef, WarehouseRef } from './purchasing.model';

export type IssueStatus = 'borrador' | 'confirmado' | 'anulado';
export type LoanStatus = 'borrador' | 'abierto' | 'parcial' | 'devuelto' | 'cerrado_con_perdida' | 'anulado';
export type ReturnCondition = 'bueno' | 'dañado' | 'perdido';

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  bueno: 'Bueno',
  'dañado': 'Dañado',
  perdido: 'Perdido',
};

export interface RecipientRef {
  id: number;
  name: string;
  type?: string;
  document_number?: string | null;
}

// ---------- Vales de salida ----------
export interface IssueItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  unit_id: number;
  unit: UnitRef | null;
  factor: number;
  quantity: number;
  qty_base: number;
  unit_cost: number;
  line_cost: number;
  notes: string | null;
}

export interface Issue {
  id: number;
  number: string;
  warehouse_id: number;
  warehouse?: WarehouseRef;
  recipient_id: number;
  recipient?: RecipientRef;
  cost_center_id: number | null;
  cost_center?: { id: number; code: string; name: string } | null;
  date: string;
  status: IssueStatus;
  status_label: string;
  is_editable: boolean;
  notes: string | null;
  confirmed_at: string | null;
  items_count?: number;
  total?: number;
  items?: IssueItem[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface IssuePayload {
  warehouse_id: number;
  recipient_id: number;
  cost_center_id?: number | null;
  date: string;
  notes?: string | null;
  items: { id?: number; product_id: number; unit_id: number; quantity: number; notes?: string | null }[];
}

// ---------- Préstamos ----------
export interface LoanItem {
  id: number;
  product_id: number;
  product: ProductRef | null;
  qty_base: number;
  unit_cost: number;
  line_cost: number;
  qty_returned_base: number;
  qty_damaged_base: number;
  qty_lost_base: number;
  outstanding_base: number;
  notes: string | null;
}

export interface LoanReturnItem {
  id: number;
  loan_item_id: number;
  product: { id: number; sku: string; name: string } | null;
  qty_base: number;
  condition: ReturnCondition;
  condition_label: string;
  notes: string | null;
}

export interface LoanReturn {
  id: number;
  returned_at: string;
  receiver: NamedRef | null;
  notes: string | null;
  items: LoanReturnItem[] | null;
  created_at: string;
}

export interface Loan {
  id: number;
  number: string;
  warehouse_id: number;
  warehouse?: WarehouseRef;
  recipient_id: number;
  recipient?: RecipientRef;
  loaned_at: string;
  expected_return_at: string | null;
  is_overdue: boolean;
  status: LoanStatus;
  status_label: string;
  is_editable: boolean;
  can_return: boolean;
  notes: string | null;
  confirmed_at: string | null;
  items_count?: number;
  items?: LoanItem[];
  returns?: LoanReturn[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface LoanPayload {
  warehouse_id: number;
  recipient_id: number;
  loaned_at: string;
  expected_return_at?: string | null;
  notes?: string | null;
  items: { id?: number; product_id: number; qty_base: number; notes?: string | null }[];
}

export interface LoanReturnPayload {
  returned_at: string;
  notes?: string | null;
  items: { loan_item_id: number; qty_base: number; condition: ReturnCondition; notes?: string | null }[];
}

// ---------- Herramientas por persona ----------
export interface HoldingLoanRef {
  id: number;
  number: string;
  loaned_at: string | null;
  expected_return_at: string | null;
  is_overdue: boolean;
  qty_base: number;
}

export interface HoldingItem {
  product: ProductRef;
  qty_base: number;
  value: number;
  loans: HoldingLoanRef[];
}

export interface RecipientHolding {
  recipient: RecipientRef;
  items: HoldingItem[];
  total_qty: number;
  total_value: number;
  has_overdue: boolean;
}

/** Tono de chip para estados de vale (masculino: confirmado/anulado). */
export function issueTone(status: IssueStatus): 'draft' | 'success' | 'danger' {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Tono de chip para estados de préstamo. */
export function loanTone(status: LoanStatus): 'draft' | 'pending' | 'partial' | 'success' | 'danger' | 'info' {
  switch (status) {
    case 'borrador':
      return 'draft';
    case 'abierto':
      return 'pending';
    case 'parcial':
      return 'partial';
    case 'devuelto':
      return 'success';
    case 'cerrado_con_perdida':
      return 'info';
    case 'anulado':
      return 'danger';
  }
}

export function conditionTone(condition: ReturnCondition): 'success' | 'partial' | 'danger' {
  return condition === 'bueno' ? 'success' : condition === 'dañado' ? 'partial' : 'danger';
}
