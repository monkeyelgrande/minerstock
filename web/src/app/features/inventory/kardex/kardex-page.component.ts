import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { Product } from '../../../core/models/catalog.model';
import { MovementTypeOption, StockMovement, sourceRoute } from '../../../core/models/inventory.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';

/** Filtros aplicados a la consulta (se copian del formulario al pulsar "Consultar"). */
interface KardexQuery {
  productId: number | null;
  warehouseId: number | null;
  type: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

const EMPTY_QUERY: KardexQuery = { productId: null, warehouseId: null, type: null, dateFrom: null, dateTo: null };

/** Kardex: historial de movimientos de inventario por producto y bodega. */
@Component({
  selector: 'app-kardex-page',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, ProductPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kardex-page.component.html',
})
export class KardexPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly ctx = inject(WarehouseContext);

  // ---------- Formulario de filtros ----------
  readonly product = signal<Product | null>(null);
  readonly warehouseId = signal<number | null>(null);
  readonly type = signal<string | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly movementTypes = signal<MovementTypeOption[]>([]);

  // ---------- Consulta aplicada ----------
  readonly query = signal<KardexQuery>(EMPTY_QUERY);
  readonly rows = signal<StockMovement[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly page = signal(1);
  readonly perPage = signal(25);
  /** Movimiento más reciente de la consulta (primera fila de la página 1): da el saldo actual. */
  readonly latest = signal<StockMovement | null>(null);

  readonly hasQuery = computed(() => {
    const q = this.query();
    return q.productId !== null || q.warehouseId !== null || q.type !== null || q.dateFrom !== null || q.dateTo !== null;
  });

  readonly hasFormFilters = computed(
    () => this.product() !== null || this.warehouseId() !== null || this.type() !== null || this.dateFrom() !== null || this.dateTo() !== null,
  );

  /** Resumen de saldo: solo cuando la consulta es de un producto en una bodega. */
  readonly summary = computed(() => {
    const q = this.query();
    const m = this.latest();
    if (q.productId === null || q.warehouseId === null || !m) return null;
    return {
      product: m.product,
      warehouse: m.warehouse,
      qty: m.balance_qty_after,
      avgCost: m.balance_cost_after,
      value: m.balance_value_after,
      at: m.moved_at,
    };
  });

  readonly warehouseName = computed(() => this.ctx.options().find((w) => w.id === this.query().warehouseId)?.name ?? null);

  readonly sourceRoute = sourceRoute;

  constructor() {
    // Filtros iniciales desde la URL (p. ej. desde el panel de kardex de Stock).
    const qp = this.route.snapshot.queryParamMap;
    const productId = Number(qp.get('product_id'));
    const warehouseId = Number(qp.get('warehouse_id'));
    const type = qp.get('type');
    const initial: KardexQuery = {
      productId: productId > 0 ? productId : null,
      warehouseId: warehouseId > 0 ? warehouseId : null,
      type: type || null,
      dateFrom: null,
      dateTo: null,
    };
    this.query.set(initial);
    if (initial.warehouseId !== null) this.warehouseId.set(initial.warehouseId);
    if (initial.type !== null) this.type.set(initial.type);
    if (initial.productId !== null) {
      this.catalog.products
        .get(initial.productId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (p) => this.product.set(p), error: () => void 0 });
    }

    this.api
      .movementTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.movementTypes.set(list));
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  // ---------- Filtros ----------

  /** Aplica el formulario, vuelve a la página 1 y sincroniza la URL. */
  consult(): void {
    this.query.set({
      productId: this.product()?.id ?? null,
      warehouseId: this.warehouseId(),
      type: this.type(),
      dateFrom: this.toIso(this.dateFrom()),
      dateTo: this.toIso(this.dateTo()),
    });
    this.syncUrl();
    this.page.set(1);
    this.load();
  }

  clear(): void {
    this.product.set(null);
    this.warehouseId.set(null);
    this.type.set(null);
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.consult();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.perPage();
    this.perPage.set(rows);
    this.page.set(Math.floor(first / rows) + 1);
    this.load();
  }

  // ---------- Carga ----------

  load(): void {
    const q = this.query();
    const page = this.page();
    this.loading.set(true);
    this.api
      .kardex({
        product_id: q.productId,
        warehouse_id: q.warehouseId,
        type: q.type,
        date_from: q.dateFrom,
        date_to: q.dateTo,
        page,
        per_page: this.perPage(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.meta.total);
          if (page === 1) this.latest.set(res.data[0] ?? null);
          this.loading.set(false);
          this.loaded.set(true);
        },
        error: () => {
          this.loading.set(false);
          this.loaded.set(true);
        },
      });
  }

  // ---------- Presentación ----------

  abs(n: number): number {
    return Math.abs(Number(n) || 0);
  }

  private syncUrl(): void {
    const q = this.query();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        product_id: q.productId ?? null,
        warehouse_id: q.warehouseId ?? null,
        type: q.type ?? null,
        date_from: q.dateFrom ?? null,
        date_to: q.dateTo ?? null,
      },
      replaceUrl: true,
    });
  }

  private toIso(d: Date | null): string | null {
    if (!d) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
