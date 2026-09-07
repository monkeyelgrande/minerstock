import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import { Collection, ListParams, Paginated, Single } from '../models/common.model';
import {
  CreditNotePayload,
  InvoiceableReceipt,
  StatementDetail,
  StatementSummaryRow,
  SupplierCreditNote,
  SupplierInvoice,
  SupplierInvoicePayload,
  SupplierPayment,
  SupplierPaymentPayload,
} from '../models/payables.model';

/** Endpoints del módulo Cuentas por pagar (/api/payables). */
@Injectable({ providedIn: 'root' })
export class PayablesApi {
  private readonly api = inject(ApiService);

  // ---------- Facturas ----------
  invoices(params: ListParams = {}): Observable<Paginated<SupplierInvoice>> {
    return this.api.get('payables/invoices', params);
  }

  invoiceCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('payables/invoices/counts').pipe(map((r) => r.data));
  }

  invoiceableReceipts(params: { supplier_id?: number | null; purchase_order_id?: number | null } = {}): Observable<InvoiceableReceipt[]> {
    return this.api.get<Collection<InvoiceableReceipt>>('payables/invoices/invoiceable-receipts', params).pipe(map((r) => r.data));
  }

  invoice(id: number): Observable<SupplierInvoice> {
    return this.api.get<Single<SupplierInvoice>>(`payables/invoices/${id}`).pipe(map((r) => r.data));
  }

  createInvoice(body: SupplierInvoicePayload): Observable<SupplierInvoice> {
    return this.api.post<Single<SupplierInvoice>>('payables/invoices', body).pipe(map((r) => r.data));
  }

  updateInvoice(id: number, body: SupplierInvoicePayload): Observable<SupplierInvoice> {
    return this.api.put<Single<SupplierInvoice>>(`payables/invoices/${id}`, body).pipe(map((r) => r.data));
  }

  cancelInvoice(id: number): Observable<SupplierInvoice> {
    return this.api.post<Single<SupplierInvoice>>(`payables/invoices/${id}/cancel`).pipe(map((r) => r.data));
  }

  // ---------- Pagos ----------
  payments(params: ListParams = {}): Observable<Paginated<SupplierPayment>> {
    return this.api.get('payables/payments', params);
  }

  paymentMethods(): Observable<Record<string, string>> {
    return this.api.get<Single<Record<string, string>>>('payables/payments/methods').pipe(map((r) => r.data));
  }

  payment(id: number): Observable<SupplierPayment> {
    return this.api.get<Single<SupplierPayment>>(`payables/payments/${id}`).pipe(map((r) => r.data));
  }

  createPayment(body: SupplierPaymentPayload): Observable<SupplierPayment> {
    return this.api.post<Single<SupplierPayment>>('payables/payments', body).pipe(map((r) => r.data));
  }

  cancelPayment(id: number): Observable<SupplierPayment> {
    return this.api.post<Single<SupplierPayment>>(`payables/payments/${id}/cancel`).pipe(map((r) => r.data));
  }

  // ---------- Notas crédito ----------
  creditNotes(params: ListParams = {}): Observable<Paginated<SupplierCreditNote>> {
    return this.api.get('payables/credit-notes', params);
  }

  creditNote(id: number): Observable<SupplierCreditNote> {
    return this.api.get<Single<SupplierCreditNote>>(`payables/credit-notes/${id}`).pipe(map((r) => r.data));
  }

  createCreditNote(body: CreditNotePayload): Observable<SupplierCreditNote> {
    return this.api.post<Single<SupplierCreditNote>>('payables/credit-notes', body).pipe(map((r) => r.data));
  }

  applyCreditNote(id: number, applications: { supplier_invoice_id: number; amount: number }[]): Observable<SupplierCreditNote> {
    return this.api.post<Single<SupplierCreditNote>>(`payables/credit-notes/${id}/apply`, { applications }).pipe(map((r) => r.data));
  }

  removeCreditNoteApplication(id: number, applicationId: number): Observable<SupplierCreditNote> {
    return this.api.delete<Single<SupplierCreditNote>>(`payables/credit-notes/${id}/applications/${applicationId}`).pipe(map((r) => r.data));
  }

  cancelCreditNote(id: number): Observable<SupplierCreditNote> {
    return this.api.post<Single<SupplierCreditNote>>(`payables/credit-notes/${id}/cancel`).pipe(map((r) => r.data));
  }

  // ---------- Estado de cuenta ----------
  statement(): Observable<StatementSummaryRow[]> {
    return this.api.get<Collection<StatementSummaryRow>>('payables/statement').pipe(map((r) => r.data));
  }

  supplierStatement(supplierId: number): Observable<StatementDetail> {
    return this.api.get<Single<StatementDetail>>(`payables/statement/${supplierId}`).pipe(map((r) => r.data));
  }
}
