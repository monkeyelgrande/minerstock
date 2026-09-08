import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import { Collection, ListParams, Paginated, Single } from '../models/common.model';
import {
  ApprovalHistoryItem,
  AttachableType,
  Attachment,
  ComparisonMatrix,
  Inbox,
  PendingRequestItem,
  PurchaseOrder,
  PurchaseOrderPayload,
  PurchaseRequest,
  PurchaseRequestPayload,
  Quotation,
  QuotationPayload,
  QuotationResponsePayload,
} from '../models/purchasing.model';

/** Endpoints del módulo Compras (/api/purchasing). */
@Injectable({ providedIn: 'root' })
export class PurchasingApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ---------- Solicitudes ----------
  requests(params: ListParams = {}): Observable<Paginated<PurchaseRequest>> {
    return this.api.get('purchasing/purchase-requests', params);
  }

  requestCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('purchasing/purchase-requests/counts').pipe(map((r) => r.data));
  }

  request(id: number): Observable<PurchaseRequest> {
    return this.api.get<Single<PurchaseRequest>>(`purchasing/purchase-requests/${id}`).pipe(map((r) => r.data));
  }

  createRequest(body: PurchaseRequestPayload): Observable<PurchaseRequest> {
    return this.api.post<Single<PurchaseRequest>>('purchasing/purchase-requests', body).pipe(map((r) => r.data));
  }

  updateRequest(id: number, body: PurchaseRequestPayload): Observable<PurchaseRequest> {
    return this.api.put<Single<PurchaseRequest>>(`purchasing/purchase-requests/${id}`, body).pipe(map((r) => r.data));
  }

  /** Transiciones: submit | approve | reject | cancel | close */
  requestAction(id: number, action: 'submit' | 'approve' | 'reject' | 'cancel' | 'close', body: Record<string, unknown> = {}): Observable<PurchaseRequest> {
    return this.api.post<Single<PurchaseRequest>>(`purchasing/purchase-requests/${id}/${action}`, body).pipe(map((r) => r.data));
  }

  pendingItems(params: { warehouse_id?: number | null; request_ids?: string; product_id?: number | null } = {}): Observable<PendingRequestItem[]> {
    return this.api.get<Collection<PendingRequestItem>>('purchasing/purchase-requests/pending-items', params).pipe(map((r) => r.data));
  }

  // ---------- Cotizaciones ----------
  quotations(params: ListParams = {}): Observable<Paginated<Quotation>> {
    return this.api.get('purchasing/quotations', params);
  }

  quotation(id: number): Observable<Quotation> {
    return this.api.get<Single<Quotation>>(`purchasing/quotations/${id}`).pipe(map((r) => r.data));
  }

  createQuotation(body: QuotationPayload): Observable<Quotation> {
    return this.api.post<Single<Quotation>>('purchasing/quotations', body).pipe(map((r) => r.data));
  }

  updateQuotation(id: number, body: QuotationPayload): Observable<Quotation> {
    return this.api.put<Single<Quotation>>(`purchasing/quotations/${id}`, body).pipe(map((r) => r.data));
  }

  deleteQuotation(id: number): Observable<void> {
    return this.api.delete(`purchasing/quotations/${id}`);
  }

  quotationAction(id: number, action: 'receive' | 'discard'): Observable<Quotation> {
    return this.api.post<Single<Quotation>>(`purchasing/quotations/${id}/${action}`).pipe(map((r) => r.data));
  }

  /** Envía la solicitud al proveedor y opcionalmente la duplica para otros proveedores. */
  sendQuotation(id: number, additionalSupplierIds: number[] = []): Observable<{ message: string; data: Quotation[] }> {
    return this.api.post(`purchasing/quotations/${id}/send`, { additional_supplier_ids: additionalSupplierIds });
  }

  /** Registra la respuesta del proveedor (precios por ítem o "no cotizó"). */
  respondQuotation(id: number, body: QuotationResponsePayload): Observable<Quotation> {
    return this.api.post<Single<Quotation>>(`purchasing/quotations/${id}/respond`, body).pipe(map((r) => r.data));
  }

  /** PDF "Solicitud de cotización" para enviar al proveedor. */
  quotationPdf(id: number): Observable<Blob> {
    return this.http.get(this.api.url(`purchasing/quotations/${id}/pdf`), { responseType: 'blob' });
  }

  // ---------- Comparativa ----------
  comparison(params: { request_ids?: number[]; product_id?: number | null; supplier_id?: number | null; only_valid?: boolean } = {}): Observable<ComparisonMatrix> {
    const query: Record<string, string | number | boolean | undefined> = {
      product_id: params.product_id ?? undefined,
      supplier_id: params.supplier_id ?? undefined,
      only_valid: params.only_valid ? 1 : undefined,
    };
    // request_ids[] como múltiples parámetros
    let url = 'purchasing/comparison';
    if (params.request_ids?.length) {
      url += '?' + params.request_ids.map((id) => `request_ids[]=${id}`).join('&');
    }
    return this.api.get<Single<ComparisonMatrix>>(url, query).pipe(map((r) => r.data));
  }

  selectOffers(selections: { quotation_item_id: number; selected: boolean }[]): Observable<{ message: string }> {
    return this.api.post('purchasing/comparison/select', { selections });
  }

  generateOrders(quotationItemIds: number[], warehouseId: number): Observable<{ message: string; data: PurchaseOrder[] }> {
    return this.api.post('purchasing/comparison/generate-orders', { quotation_item_ids: quotationItemIds, warehouse_id: warehouseId });
  }

  // ---------- Órdenes de compra ----------
  orders(params: ListParams = {}): Observable<Paginated<PurchaseOrder>> {
    return this.api.get('purchasing/purchase-orders', params);
  }

  orderCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('purchasing/purchase-orders/counts').pipe(map((r) => r.data));
  }

  order(id: number): Observable<PurchaseOrder> {
    return this.api.get<Single<PurchaseOrder>>(`purchasing/purchase-orders/${id}`).pipe(map((r) => r.data));
  }

  createOrder(body: PurchaseOrderPayload): Observable<PurchaseOrder> {
    return this.api.post<Single<PurchaseOrder>>('purchasing/purchase-orders', body).pipe(map((r) => r.data));
  }

  updateOrder(id: number, body: PurchaseOrderPayload): Observable<PurchaseOrder> {
    return this.api.put<Single<PurchaseOrder>>(`purchasing/purchase-orders/${id}`, body).pipe(map((r) => r.data));
  }

  orderAction(
    id: number,
    action: 'submit' | 'approve' | 'reject' | 'reopen' | 'issue' | 'cancel' | 'close',
    body: Record<string, unknown> = {},
  ): Observable<PurchaseOrder> {
    return this.api.post<Single<PurchaseOrder>>(`purchasing/purchase-orders/${id}/${action}`, body).pipe(map((r) => r.data));
  }

  /** Descarga el PDF como Blob (la petición lleva el token vía interceptor). */
  orderPdf(id: number): Observable<Blob> {
    return this.http.get(this.api.url(`purchasing/purchase-orders/${id}/pdf`), { responseType: 'blob' });
  }

  // ---------- Aprobaciones ----------
  inbox(): Observable<Inbox> {
    return this.api.get<Single<Inbox>>('purchasing/approvals/inbox').pipe(map((r) => r.data));
  }

  approvalHistory(params: ListParams = {}): Observable<Paginated<ApprovalHistoryItem>> {
    return this.api.get('purchasing/approvals/history', params);
  }

  // ---------- Adjuntos ----------
  uploadAttachment(type: AttachableType, id: number, file: File, purpose?: string): Observable<Attachment> {
    const form = new FormData();
    form.append('attachable_type', type);
    form.append('attachable_id', String(id));
    if (purpose) form.append('purpose', purpose);
    form.append('file', file);
    return this.http.post<Single<Attachment>>(this.api.url('attachments'), form).pipe(map((r) => r.data));
  }

  deleteAttachment(id: number): Observable<void> {
    return this.api.delete(`attachments/${id}`);
  }
}
