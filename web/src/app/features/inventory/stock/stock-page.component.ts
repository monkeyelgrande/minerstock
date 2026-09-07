import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ProductCategory } from '../../../core/models/catalog.model';
import { StockCell, StockMatrix, StockMovement, StockRow, StockTotals } from '../../../core/models/inventory.model';
import { WarehouseRef } from '../../../core/models/purchasing.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';

interface Kpi {
  label: string;
  value: string;
  icon: string;
  tone: string;
  note: string;
  alert?: boolean;
}

type StockWarehouse = StockMatrix['warehouses'][number];

const EMPTY_TOTALS: StockTotals = { total_value: 0, products_with_stock: 0, below_min: 0, in_transit_value: 0, on_loan_count: 0 };

/** Stock valorizado por bodega: matriz producto × bodega con KPIs, filtros y kardex resumido en panel lateral. */
@Component({
  selector: 'app-stock-page',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, TableModule, ButtonModule, SelectModule, DrawerModule, InputTextModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stock-page.component.html',
})
export class StockPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new CurrencyPipe('es-CO');
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  // ---------- Listado ----------
  readonly rows = signal<StockRow[]>([]);
  readonly warehouses = signal<StockWarehouse[]>([]);
  readonly totals = signal<StockTotals>(EMPTY_TOTALS);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly categories = signal<ProductCategory[]>([]);

  // ---------- Filtros ----------
  readonly search = signal('');
  readonly warehouseId = signal<number | null>(null);
  readonly categoryId = signal<number | null>(null);
  readonly kind = signal<string | null>(null);
  readonly belowMin = signal(false);
  readonly page = signal(1);
  readonly perPage = signal(20);

  readonly kindOptions = [
    { label: 'Consumible', value: 'consumible' },
    { label: 'Retornable', value: 'retornable' },
  ];

  readonly canAdjust = computed(() => this.auth.can('adjustments.create'));

  readonly kpis = computed<Kpi[]>(() => {
    const t = this.totals();
    return [
      {
        label: 'Valor total inventario',
        value: this.cop(t.total_value),
        icon: 'inventory_2',
        tone: 'bg-amber-50 text-amber-700',
        note: `${t.products_with_stock} ${t.products_with_stock === 1 ? 'producto' : 'productos'} con existencias`,
      },
      {
        label: 'Productos bajo mínimo',
        value: String(t.below_min),
        icon: 'warning',
        tone: t.below_min > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
        note: t.below_min > 0 ? 'Requieren reposición' : 'Sin alertas de mínimo',
        alert: t.below_min > 0,
      },
      {
        label: 'En tránsito',
        value: this.cop(t.in_transit_value),
        icon: 'local_shipping',
        tone: 'bg-orange-50 text-orange-700',
        note: 'Fase 4 · Logística',
      },
      {
        label: 'En préstamo',
        value: String(t.on_loan_count),
        icon: 'handyman',
        tone: 'bg-blue-50 text-blue-700',
        note: 'Fase 5 · Bodega',
      },
    ];
  });

  /** Número de columnas de la tabla (para el colspan del estado vacío). */
  readonly colCount = computed(() => 8 + this.warehouses().length);

  readonly hasFilters = computed(() => !!this.search() || this.warehouseId() !== null || this.categoryId() !== null || this.kind() !== null || this.belowMin());

  /** Sin filtros y sin filas: la bodega aún no tiene existencias. */
  readonly isPristineEmpty = computed(() => this.loaded() && !this.loading() && this.rows().length === 0 && !this.hasFilters());

  // ---------- Panel de kardex ----------
  readonly drawerOpen = signal(false);
  readonly drawerProduct = signal<StockRow['product'] | null>(null);
  readonly drawerWarehouse = signal<WarehouseRef | null>(null);
  readonly drawerCell = signal<StockCell | null>(null);
  readonly drawerRows = signal<StockMovement[]>([]);
  readonly drawerLoading = signal(false);

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Filtro inicial desde ?below_min=1 (p. ej. desde el dashboard).
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('below_min') === '1' || qp.get('below_min') === 'true') this.belowMin.set(true);
    const wh = Number(qp.get('warehouse_id'));
    if (wh > 0) this.warehouseId.set(wh);

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
    effect(() => {
      const s = this.search();
      if (s === this.lastSearch) return;
      this.lastSearch = s;
      untracked(() => this.search$.next(s));
    });

    this.catalog.productCategories
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.categories.set(list));

    this.loadSummary();
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  // ---------- Filtros ----------

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.loadSummary();
    this.reload();
  }

  setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.reload();
  }

  setKind(kind: string | null): void {
    this.kind.set(kind);
    this.reload();
  }

  setBelowMin(on: boolean): void {
    this.belowMin.set(on);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.warehouseId.set(null);
    this.categoryId.set(null);
    this.kind.set(null);
    this.belowMin.set(false);
    this.loadSummary();
    this.reload();
  }

  private reload(): void {
    this.page.set(1);
    this.load();
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
    this.loading.set(true);
    const belowMin = this.belowMin();
    this.api
      .stock({
        warehouse_id: this.warehouseId(),
        category_id: this.categoryId(),
        kind: this.kind(),
        search: this.search() || undefined,
        below_min: belowMin,
        page: belowMin ? 1 : this.page(),
        per_page: belowMin ? undefined : this.perPage(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.warehouses.set(res.warehouses);
          this.total.set(res.meta.total);
          this.loading.set(false);
          this.loaded.set(true);
        },
        error: () => {
          this.loading.set(false);
          this.loaded.set(true);
        },
      });
  }

  private loadSummary(): void {
    this.api
      .stockSummary(this.warehouseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => this.totals.set(t ?? EMPTY_TOTALS));
  }

  // ---------- Panel de kardex ----------

  openKardex(row: StockRow, warehouse: WarehouseRef, cell?: StockCell): void {
    this.drawerProduct.set(row.product);
    this.drawerWarehouse.set(warehouse);
    this.drawerCell.set(cell ?? row.cells.find((c) => c.warehouse_id === warehouse.id) ?? null);
    this.drawerRows.set([]);
    this.drawerOpen.set(true);
    this.drawerLoading.set(true);
    this.api
      .kardex({ product_id: row.product.id, warehouse_id: warehouse.id, per_page: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.drawerRows.set(res.data);
          this.drawerLoading.set(false);
        },
        error: () => this.drawerLoading.set(false),
      });
  }

  /** Kardex desde el botón de fila: usa la bodega filtrada o la primera con existencias. */
  openRowKardex(row: StockRow): void {
    const list = this.warehouses();
    if (!list.length) return;
    const filtered = this.warehouseId();
    let target = filtered !== null ? list.find((w) => w.id === filtered) : undefined;
    if (!target) {
      const withStock = row.cells.find((c) => c.qty > 0);
      target = (withStock && list.find((w) => w.id === withStock.warehouse_id)) || list[0];
    }
    this.openKardex(row, target);
  }

  closeKardex(): void {
    this.drawerOpen.set(false);
  }

  goFullKardex(): void {
    const p = this.drawerProduct();
    const w = this.drawerWarehouse();
    if (!p || !w) return;
    this.drawerOpen.set(false);
    void this.router.navigate(['/inventario/kardex'], { queryParams: { product_id: p.id, warehouse_id: w.id } });
  }

  // ---------- Navegación ----------

  goAdjustment(): void {
    void this.router.navigate(['/inventario/ajustes/nuevo']);
  }

  // ---------- Presentación ----------

  cellFor(row: StockRow, warehouseId: number): StockCell | undefined {
    return row.cells.find((c) => c.warehouse_id === warehouseId);
  }

  abs(n: number): number {
    return Math.abs(Number(n) || 0);
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
  }

  private cop(n: number): string {
    return this.currency.transform(Number(n) || 0, 'COP', 'symbol-narrow', '1.0-0') ?? '$0';
  }
}
