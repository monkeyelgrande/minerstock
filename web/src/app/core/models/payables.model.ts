import { Attachment, NamedRef } from './purchasing.model';

/** Modelos del módulo Cuentas por pagar (fase 3). Espejan los Resources del API. */

export type InvoiceStatus = 'pendiente' | 'parcial' | 'pagada' | 'anulada';
export type CreditNoteStatus = 'disponible' | 'aplicada' | 'anulada';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'otro';

export interface SupplierRef {
  id: number;
  name: string;
  document_number: string;
}

// ---------- Facturas ----------
export interface SupplierInvoice {
  id: number;
  number: string;
  supplier_invoice_number: string;
  supplier_id: number;
  supplier?: SupplierRef;
  purchase_order_id: number | null;
  order?: { id: number; number: string } | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  withholding: number;
  total: number;
  paid_amount: number;
  credited_amount: number;
  balance: number;
  status: InvoiceStatus;
  status_label: string;
  is_overdue: boolean;
  is_editable: boolean;
  notes: string | null;
  receipts?: { id: number; number: string; received_at: string; supplier_remission: string | null }[];
  payments?: { id: number; amount: number; payment: { id: number; number: string; date: string; method: string; status: string } | null }[];
  credit_applications?: { id: number; amount: number; note: { id: number; number: string; date: string } | null }[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
  updated_at: string;
}

export interface SupplierInvoicePayload {
  supplier_invoice_number: string;
  supplier_id?: number | null;
  purchase_order_id?: number | null;
  goods_receipt_ids?: number[];
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax?: number;
  withholding?: number;
  notes?: string | null;
}

/** Recepción confirmada sin factura, con valores para prellenar. */
export interface InvoiceableReceipt {
  id: number;
  number: string;
  received_at: string;
  supplier_remission: string | null;
  order: { id: number; number: string; payment_days: number };
  supplier: NamedRef;
  warehouse: { id: number; code: string; name: string };
  items_count: number;
  subtotal: number;
  tax: number;
}

// ---------- Pagos ----------
export interface PaymentAllocation {
  id: number;
  supplier_invoice_id: number;
  amount: number;
  invoice: {
    id: number;
    number: string;
    supplier_invoice_number: string;
    total: number;
    balance: number;
    status: InvoiceStatus;
    status_label: string;
  } | null;
}

export interface SupplierPayment {
  id: number;
  number: string;
  supplier_id: number;
  supplier?: SupplierRef;
  date: string;
  method: PaymentMethod;
  method_label: string;
  reference: string | null;
  amount: number;
  status: 'confirmado' | 'anulado';
  status_label: string;
  notes: string | null;
  allocations?: PaymentAllocation[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
}

export interface SupplierPaymentPayload {
  supplier_id: number;
  date: string;
  method: PaymentMethod;
  reference?: string | null;
  amount: number;
  notes?: string | null;
  allocations: { supplier_invoice_id: number; amount: number }[];
}

// ---------- Notas crédito ----------
export interface CreditNoteApplication {
  id: number;
  supplier_invoice_id: number;
  amount: number;
  applied_at: string;
  applier: NamedRef | null;
  invoice: {
    id: number;
    number: string;
    supplier_invoice_number: string;
    balance: number;
    status: InvoiceStatus;
    status_label: string;
  } | null;
}

export interface SupplierCreditNote {
  id: number;
  number: string;
  supplier_id: number;
  supplier?: SupplierRef;
  supplier_return_id: number | null;
  return?: { id: number; number: string } | null;
  supplier_note_number: string | null;
  date: string;
  amount: number;
  applied_amount: number;
  available: number;
  status: CreditNoteStatus;
  status_label: string;
  notes: string | null;
  applications?: CreditNoteApplication[];
  attachments?: Attachment[];
  creator?: NamedRef;
  created_at: string;
}

export interface CreditNotePayload {
  supplier_id: number;
  supplier_note_number?: string | null;
  date: string;
  amount: number;
  notes?: string | null;
}

// ---------- Estado de cuenta ----------
export interface StatementSummaryRow {
  supplier: SupplierRef & { payment_terms_days: number };
  invoices_count: number;
  open_count: number;
  total_invoiced: number;
  balance: number;
  overdue_balance: number;
  available_credit: number;
}

export interface StatementDetail {
  supplier: SupplierRef & { payment_terms_days: number; contact_name: string | null; phone: string | null; email: string | null };
  totals: { balance: number; overdue_balance: number; open_count: number; available_credit: number };
  invoices: {
    id: number;
    number: string;
    supplier_invoice_number: string;
    order: { id: number; number: string | null } | null;
    issue_date: string;
    due_date: string;
    total: number;
    paid_amount: number;
    credited_amount: number;
    balance: number;
    status: InvoiceStatus;
    status_label: string;
    is_overdue: boolean;
  }[];
  payments: {
    id: number;
    number: string;
    date: string;
    method: string;
    method_label: string;
    reference: string | null;
    amount: number;
    status: string;
    invoices: { number: string | null; amount: number }[];
  }[];
  credit_notes: {
    id: number;
    number: string;
    date: string;
    return_number: string | null;
    amount: number;
    applied_amount: number;
    available: number;
    status: CreditNoteStatus;
    status_label: string;
  }[];
}

/** Tono de chip por estado de cuentas por pagar. */
export function payableTone(status: string): 'draft' | 'pending' | 'success' | 'partial' | 'danger' | 'info' {
  switch (status) {
    case 'pendiente':
      return 'pending';
    case 'parcial':
      return 'partial';
    case 'pagada':
    case 'confirmado':
    case 'aplicada':
      return 'success';
    case 'disponible':
      return 'info';
    case 'anulada':
    case 'anulado':
      return 'danger';
    default:
      return 'draft';
  }
}
