import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import { Collection, ListParams, Paginated, Single } from '../models/common.model';
import {
  InTransitShipment,
  Novelty,
  Shipment,
  ShipmentPayload,
  ShipmentReceipt,
  ShipmentReceiptPayload,
  ShippablePendingItem,
} from '../models/logistics.model';

/** Endpoints del módulo Logística (/api/logistics). */
@Injectable({ providedIn: 'root' })
export class LogisticsApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ---------- Planillas ----------
  shipments(params: ListParams = {}): Observable<Paginated<Shipment>> {
    return this.api.get('logistics/shipments', params);
  }

  shipmentCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('logistics/shipments/counts').pipe(map((r) => r.data));
  }

  pendingRequestItems(destinationWarehouseId: number, originWarehouseId?: number | null): Observable<ShippablePendingItem[]> {
    return this.api
      .get<Collection<ShippablePendingItem>>('logistics/shipments/pending-request-items', {
        destination_warehouse_id: destinationWarehouseId,
        origin_warehouse_id: originWarehouseId ?? undefined,
      })
      .pipe(map((r) => r.data));
  }

  shipment(id: number): Observable<Shipment> {
    return this.api.get<Single<Shipment>>(`logistics/shipments/${id}`).pipe(map((r) => r.data));
  }

  createShipment(body: ShipmentPayload): Observable<Shipment> {
    return this.api.post<Single<Shipment>>('logistics/shipments', body).pipe(map((r) => r.data));
  }

  updateShipment(id: number, body: ShipmentPayload): Observable<Shipment> {
    return this.api.put<Single<Shipment>>(`logistics/shipments/${id}`, body).pipe(map((r) => r.data));
  }

  shipmentAction(id: number, action: 'dispatch' | 'cancel' | 'close'): Observable<Shipment> {
    return this.api.post<Single<Shipment>>(`logistics/shipments/${id}/${action}`).pipe(map((r) => r.data));
  }

  /** Descarga la planilla en PDF (el papel que viaja con el chofer). */
  shipmentPdf(id: number): Observable<Blob> {
    return this.http.get(this.api.url(`logistics/shipments/${id}/pdf`), { responseType: 'blob' });
  }

  inTransit(destinationWarehouseId?: number | null): Observable<InTransitShipment[]> {
    return this.api
      .get<Collection<InTransitShipment>>('logistics/shipments/in-transit', { destination_warehouse_id: destinationWarehouseId ?? undefined })
      .pipe(map((r) => r.data));
  }

  // ---------- Recepción en destino ----------
  receipts(params: ListParams = {}): Observable<Paginated<ShipmentReceipt>> {
    return this.api.get('logistics/shipment-receipts', params);
  }

  receipt(id: number): Observable<ShipmentReceipt> {
    return this.api.get<Single<ShipmentReceipt>>(`logistics/shipment-receipts/${id}`).pipe(map((r) => r.data));
  }

  createReceipt(body: ShipmentReceiptPayload): Observable<ShipmentReceipt> {
    return this.api.post<Single<ShipmentReceipt>>('logistics/shipment-receipts', body).pipe(map((r) => r.data));
  }

  updateReceipt(id: number, body: ShipmentReceiptPayload): Observable<ShipmentReceipt> {
    return this.api.put<Single<ShipmentReceipt>>(`logistics/shipment-receipts/${id}`, body).pipe(map((r) => r.data));
  }

  receiptAction(id: number, action: 'confirm' | 'cancel'): Observable<ShipmentReceipt> {
    return this.api.post<Single<ShipmentReceipt>>(`logistics/shipment-receipts/${id}/${action}`).pipe(map((r) => r.data));
  }

  // ---------- Novedades ----------
  novelties(params: ListParams = {}): Observable<Paginated<Novelty> & { open_count?: number }> {
    return this.api.get('logistics/novelties', params);
  }

  noveltyCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('logistics/novelties/counts').pipe(map((r) => r.data));
  }

  resolveNovelty(id: number, resolution: string): Observable<{ message: string }> {
    return this.api.post(`logistics/novelties/${id}/resolve`, { resolution });
  }
}
