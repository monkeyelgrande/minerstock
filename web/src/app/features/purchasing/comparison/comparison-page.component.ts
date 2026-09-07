import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, Supplier } from '../../../core/models/catalog.model';
import { ComparisonMatrix, ComparisonOffer, ComparisonRow, NamedRef } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';

interface RequestOption {
  id: number;
  label: string;
}

/** Fila de la matriz con las celdas ya resueltas por proveedor. */
interface GridRow {
  row: ComparisonRow;
  cells: (ComparisonOffer | null)[];
  selected: ComparisonOffer | null;
  selectedSupplier: NamedRef | null;
}

/** Comparativa producto × proveedor: selección de ofertas y generación de órdenes de compra. */
@Component({
  selector: 'app-comparison-page',
  imports: [
    CurrencyPipe, DecimalPipe, FormsModule, RouterLink,
    ButtonModule, DialogModule, MultiSelectModule, RadioButtonModule, SelectModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, ProductPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comparison-page.component.html',
})
export class ComparisonPageComponent {
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  /** Query param `?supplier_id=` (desde el detalle de una cotización). */
  readonly supplierIdParam = input<string | undefined>(undefined, { alias: 'supplier_id' });

  // Filtros
  readonly requestOptions = signal<RequestOption[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly requestIds = signal<number[]>([]);
  readonly product = signal<Product | null>(null);
  readonly supplierId = signal<number | null>(null);
  readonly onlyValid = signal(true);

  // Matriz
  readonly matrix = signal<ComparisonMatrix>({ suppliers: [], rows: [] });
  readonly loading = signal(false);
  readonly saving = signal<Set<string>>(new Set());

  // Diálogo de generación
  readonly generateOpen = signal(false);
  readonly generating = signal(false);
  readonly warehouseId = signal<number | null>(null);

  readonly canGenerate = computed(() => this.auth.can('purchase_orders.create'));

  readonly grid = computed<GridRow[]>(() => {
    const m = this.matrix();
    return m.rows.map((row) => {
      const cells = m.suppliers.map((s) => row.offers.find((o) => o.supplier_id === s.id) ?? null);
      const selected = row.offers.find((o) => o.is_selected) ?? null;
      const selectedSupplier = selected ? (m.suppliers.find((s) => s.id === selected.supplier_id) ?? null) : null;
      return { row, cells, selected, selectedSupplier };
    });
  });

  readonly selectedOffers = computed(() => this.grid().map((g) => g.selected).filter((o): o is ComparisonOffer => o !== null));
  readonly selectedSupplierCount = computed(() => new Set(this.selectedOffers().map((o) => o.supplier_id)).size);

  /** Total seleccionado (sin IVA) por proveedor, en el orden de las columnas. */
  readonly supplierTotals = computed(() =>
    this.matrix().suppliers.map((s) => this.selectedOffers().filter((o) => o.supplier_id === s.id).reduce((sum, o) => sum + o.line_total, 0)),
  );
  readonly grandTotal = computed(() => this.selectedOffers().reduce((sum, o) => sum + o.line_total, 0));

  readonly generateLabel = computed(() => {
    const n = this.selectedSupplierCount();
    return n === 1 ? 'Generar orden de compra (1 proveedor)' : `Generar órdenes de compra (${n} proveedores)`;
  });

  constructor() {
    this.api
      .requests({ status: 'aprobada,en_proceso', per_page: 100, sort: 'created_at', dir: 'desc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) =>
        this.requestOptions.set(res.data.map((r) => ({ id: r.id, label: `${r.number} · ${r.warehouse?.name ?? 'Bodega ' + r.warehouse_id}` }))),
      );
    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));

    // Filtro inicial por proveedor (query param) y primera carga.
    effect(() => {
      const param = this.supplierIdParam();
      untracked(() => {
        this.supplierId.set(param && !Number.isNaN(+param) ? +param : null);
        this.load();
      });
    });
  }

  // ---------- Filtros ----------

  setRequests(ids: number[] | null): void {
    this.requestIds.set(ids ?? []);
    this.load();
  }

  setProduct(p: Product | null): void {
    this.product.set(p);
    this.load();
  }

  setSupplier(id: number | null): void {
    this.supplierId.set(id);
    this.load();
  }

  setOnlyValid(v: boolean): void {
    this.onlyValid.set(v);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .comparison({
        request_ids: this.requestIds(),
        product_id: this.product()?.id ?? null,
        supplier_id: this.supplierId(),
        only_valid: this.onlyValid(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.matrix.set(m);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  // ---------- Selección ----------

  isSaving(row: ComparisonRow): boolean {
    return this.saving().has(row.key);
  }

  select(row: ComparisonRow, offer: ComparisonOffer): void {
    if (row.selected_quotation_item_id === offer.quotation_item_id) return;
    this.applySelection(row, offer.quotation_item_id, true);
  }

  clear(row: ComparisonRow): void {
    const id = row.selected_quotation_item_id;
    if (id === null) return;
    this.applySelection(row, id, false);
  }

  /** Actualiza la fila de forma optimista y revierte si el servidor rechaza el cambio. */
  private applySelection(row: ComparisonRow, quotationItemId: number, selected: boolean): void {
    const previous = row;
    this.patchRow(row.key, (r) => ({
      ...r,
      selected_quotation_item_id: selected ? quotationItemId : null,
      offers: r.offers.map((o) => ({ ...o, is_selected: selected && o.quotation_item_id === quotationItemId })),
    }));
    this.saving.update((s) => new Set(s).add(row.key));
    this.api
      .selectOffers([{ quotation_item_id: quotationItemId, selected }])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saving.update((s) => this.without(s, row.key)),
        error: (err: unknown) => {
          this.saving.update((s) => this.without(s, row.key));
          this.patchRow(row.key, () => previous);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            this.toast.error('No se pudo guardar la selección', (err.error as { message?: string })?.message);
          }
        },
      });
  }

  private patchRow(key: string, fn: (r: ComparisonRow) => ComparisonRow): void {
    this.matrix.update((m) => ({ ...m, rows: m.rows.map((r) => (r.key === key ? fn(r) : r)) }));
  }

  private without(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    next.delete(key);
    return next;
  }

  // ---------- Generar órdenes ----------

  openGenerate(): void {
    if (!this.selectedOffers().length) return;
    this.warehouseId.set(this.ctx.activeId() ?? this.ctx.options()[0]?.id ?? null);
    this.generateOpen.set(true);
  }

  generate(): void {
    const warehouseId = this.warehouseId();
    const ids = this.selectedOffers().map((o) => o.quotation_item_id);
    if (!warehouseId || !ids.length) return;
    this.generating.set(true);
    this.api
      .generateOrders(ids, warehouseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.generating.set(false);
          this.generateOpen.set(false);
          this.toast.success(res.message, res.data.map((o) => o.number).join(', '));
          if (res.data.length === 1) void this.router.navigate(['/compras/ordenes', res.data[0].id]);
          else void this.router.navigate(['/compras/ordenes']);
        },
        error: (err: unknown) => {
          this.generating.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            this.toast.error('No se pudieron generar las órdenes', (err.error as { message?: string })?.message);
          }
          this.load();
        },
      });
  }
}
