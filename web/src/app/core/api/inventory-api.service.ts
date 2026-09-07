import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import { Collection, ListParams, Paginated, Single } from '../models/common.model';
import {
  Adjustment,
  AdjustmentPayload,
  GoodsReceipt,
  GoodsReceiptPayload,
  MovementTypeOption,
  ProductWarehouseBalance,
  ReceivableOrder,
  StockCount,
  StockCountPayload,
  StockMatrix,
  StockMovement,
  StockTotals,
  SupplierReturn,
  SupplierReturnPayload,
} from '../models/inventory.model';

/** Endpoints del módulo Inventario (/api/inventory). */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly api = inject(ApiService);

  // ---------- Stock y kardex ----------
  stock(params: { warehouse_id?: number | null; category_id?: number | null; kind?: string | null; search?: string; below_min?: boolean; page?: number; per_page?: number } = {}): Observable<StockMatrix> {
    return this.api.get<StockMatrix>('inventory/stock', { ...params, below_min: params.below_min ? 1 : undefined });
  }

  stockSummary(warehouseId?: number | null): Observable<StockTotals> {
    return this.api.get<Single<StockTotals>>('inventory/stock/summary', { warehouse_id: warehouseId ?? undefined }).pipe(map((r) => r.data));
  }

  movementTypes(): Observable<MovementTypeOption[]> {
    return this.api.get<Collection<MovementTypeOption>>('inventory/stock/movement-types').pipe(map((r) => r.data));
  }

  productBalances(productId: number): Observable<ProductWarehouseBalance[]> {
    return this.api.get<Collection<ProductWarehouseBalance>>(`inventory/stock/products/${productId}/balances`).pipe(map((r) => r.data));
  }

  kardex(params: { warehouse_id?: number | null; product_id?: number | null; type?: string | null; date_from?: string | null; date_to?: string | null; page?: number; per_page?: number } = {}): Observable<Paginated<StockMovement>> {
    return this.api.get('inventory/kardex', params);
  }

  // ---------- Recepciones de compra ----------
  receipts(params: ListParams = {}): Observable<Paginated<GoodsReceipt>> {
    return this.api.get('inventory/goods-receipts', params);
  }

  receiptCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('inventory/goods-receipts/counts').pipe(map((r) => r.data));
  }

  receivableOrders(params: { supplier_id?: number | null; id?: number | null } = {}): Observable<ReceivableOrder[]> {
    return this.api.get<Collection<ReceivableOrder>>('inventory/goods-receipts/receivable-orders', params).pipe(map((r) => r.data));
  }

  receipt(id: number): Observable<GoodsReceipt> {
    return this.api.get<Single<GoodsReceipt>>(`inventory/goods-receipts/${id}`).pipe(map((r) => r.data));
  }

  createReceipt(body: GoodsReceiptPayload): Observable<GoodsReceipt> {
    return this.api.post<Single<GoodsReceipt>>('inventory/goods-receipts', body).pipe(map((r) => r.data));
  }

  updateReceipt(id: number, body: GoodsReceiptPayload): Observable<GoodsReceipt> {
    return this.api.put<Single<GoodsReceipt>>(`inventory/goods-receipts/${id}`, body).pipe(map((r) => r.data));
  }

  receiptAction(id: number, action: 'confirm' | 'cancel'): Observable<GoodsReceipt> {
    return this.api.post<Single<GoodsReceipt>>(`inventory/goods-receipts/${id}/${action}`).pipe(map((r) => r.data));
  }

  // ---------- Devoluciones a proveedor ----------
  returns(params: ListParams = {}): Observable<Paginated<SupplierReturn>> {
    return this.api.get('inventory/supplier-returns', params);
  }

  returnReasons(): Observable<Record<string, string>> {
    return this.api.get<Single<Record<string, string>>>('inventory/supplier-returns/reasons').pipe(map((r) => r.data));
  }

  supplierReturn(id: number): Observable<SupplierReturn> {
    return this.api.get<Single<SupplierReturn>>(`inventory/supplier-returns/${id}`).pipe(map((r) => r.data));
  }

  createReturn(body: SupplierReturnPayload): Observable<SupplierReturn> {
    return this.api.post<Single<SupplierReturn>>('inventory/supplier-returns', body).pipe(map((r) => r.data));
  }

  updateReturn(id: number, body: SupplierReturnPayload): Observable<SupplierReturn> {
    return this.api.put<Single<SupplierReturn>>(`inventory/supplier-returns/${id}`, body).pipe(map((r) => r.data));
  }

  returnAction(id: number, action: 'confirm' | 'cancel'): Observable<SupplierReturn> {
    return this.api.post<Single<SupplierReturn>>(`inventory/supplier-returns/${id}/${action}`).pipe(map((r) => r.data));
  }

  // ---------- Ajustes ----------
  adjustments(params: ListParams = {}): Observable<Paginated<Adjustment>> {
    return this.api.get('inventory/adjustments', params);
  }

  adjustmentReasons(): Observable<Record<string, string>> {
    return this.api.get<Single<Record<string, string>>>('inventory/adjustments/reasons').pipe(map((r) => r.data));
  }

  adjustment(id: number): Observable<Adjustment> {
    return this.api.get<Single<Adjustment>>(`inventory/adjustments/${id}`).pipe(map((r) => r.data));
  }

  createAdjustment(body: AdjustmentPayload): Observable<Adjustment> {
    return this.api.post<Single<Adjustment>>('inventory/adjustments', body).pipe(map((r) => r.data));
  }

  updateAdjustment(id: number, body: AdjustmentPayload): Observable<Adjustment> {
    return this.api.put<Single<Adjustment>>(`inventory/adjustments/${id}`, body).pipe(map((r) => r.data));
  }

  adjustmentAction(id: number, action: 'confirm' | 'cancel'): Observable<Adjustment> {
    return this.api.post<Single<Adjustment>>(`inventory/adjustments/${id}/${action}`).pipe(map((r) => r.data));
  }

  // ---------- Conteos físicos ----------
  counts(params: ListParams = {}): Observable<Paginated<StockCount>> {
    return this.api.get('inventory/stock-counts', params);
  }

  count(id: number): Observable<StockCount> {
    return this.api.get<Single<StockCount>>(`inventory/stock-counts/${id}`).pipe(map((r) => r.data));
  }

  openCount(body: StockCountPayload): Observable<StockCount> {
    return this.api.post<Single<StockCount>>('inventory/stock-counts', body).pipe(map((r) => r.data));
  }

  addCountProducts(id: number, productIds: number[]): Observable<StockCount> {
    return this.api.post<Single<StockCount>>(`inventory/stock-counts/${id}/products`, { product_ids: productIds }).pipe(map((r) => r.data));
  }

  removeCountProduct(id: number, productId: number): Observable<StockCount> {
    return this.api.delete<Single<StockCount>>(`inventory/stock-counts/${id}/products/${productId}`).pipe(map((r) => r.data));
  }

  recordCount(id: number, items: { product_id: number; counted_qty: number | null; notes?: string | null }[]): Observable<StockCount> {
    return this.api.put<Single<StockCount>>(`inventory/stock-counts/${id}/record`, { items }).pipe(map((r) => r.data));
  }

  countAction(id: number, action: 'close' | 'cancel'): Observable<StockCount> {
    return this.api.post<Single<StockCount>>(`inventory/stock-counts/${id}/${action}`).pipe(map((r) => r.data));
  }
}
