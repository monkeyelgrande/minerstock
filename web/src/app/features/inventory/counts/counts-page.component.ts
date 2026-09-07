import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, ProductCategory } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { StockCount, StockCountPayload, StockCountStatus } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { countStatusTone } from '../adjustments/status-tone';

interface StatusTab {
  key: string;
  label: string;
  status: StockCountStatus | null;
}

type Scope = StockCountPayload['scope'];

/** Listado de conteos físicos con pestañas por estado y diálogo de apertura de conteo. */
@Component({
  selector: 'app-counts-page',
  imports: [
    DatePipe, FormsModule, ReactiveFormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, DialogModule,
    RadioButtonModule, AutoCompleteModule, TextareaModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent, FieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './counts-page.component.html',
})
export class CountsPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todos', status: null },
    { key: 'en_proceso', label: 'En proceso', status: 'en_proceso' },
    { key: 'cerrado', label: 'Cerrados', status: 'cerrado' },
    { key: 'anulado', label: 'Anulados', status: 'anulado' },
  ];

  readonly scopeOptions: { label: string; value: Scope; hint: string }[] = [
    { label: 'Toda la bodega', value: 'all', hint: 'Todos los productos activos con o sin existencias en la bodega.' },
    { label: 'Por categoría', value: 'category', hint: 'Solo los productos de una categoría.' },
    { label: 'Productos específicos', value: 'products', hint: 'Elige uno a uno los productos a contar.' },
  ];

  // Listado
  readonly rows = signal<StockCount[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly warehouseId = signal<number | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);

  // Diálogo "Nuevo conteo"
  readonly dialogOpen = signal(false);
  readonly opening = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly categories = signal<ProductCategory[]>([]);
  readonly productSuggestions = signal<Product[]>([]);

  readonly dialogForm = this.fb.group({
    warehouse_id: [null as number | null, Validators.required],
    date: [new Date() as Date | null, Validators.required],
    scope: ['all' as Scope, Validators.required],
    category_id: [null as number | null],
    products: [[] as Product[]],
    notes: [''],
  });

  private readonly dialogValue = toSignal(this.dialogForm.valueChanges.pipe(map(() => this.dialogForm.getRawValue())), {
    initialValue: this.dialogForm.getRawValue(),
  });
  readonly scope = computed(() => this.dialogValue().scope ?? 'all');
  readonly selectedProducts = computed(() => (this.dialogValue().products ?? []) as Product[]);

  readonly canCreate = computed(() => this.auth.can('stock_counts.create'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    const initial = this.router.parseUrl(this.router.url).queryParams['status'] as string | undefined;
    if (initial && this.tabs.some((t) => t.key === initial)) this.tab.set(initial);

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
    effect(() => {
      const s = this.search();
      if (s === this.lastSearch) return;
      this.lastSearch = s;
      untracked(() => this.search$.next(s));
    });
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  selectTab(key: string): void {
    if (this.tab() === key) return;
    this.tab.set(key);
    this.reload();
  }

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
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

  load(): void {
    this.loading.set(true);
    const tab = this.tabs.find((t) => t.key === this.tab());
    this.api
      .counts({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        page: this.page(),
        per_page: this.perPage(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  goDetail(row: StockCount): void {
    void this.router.navigate(['/inventario/conteos', row.id]);
  }

  // ---------- Nuevo conteo ----------

  openDialog(): void {
    this.submitted.set(false);
    this.serverErrors.set({});
    this.dialogForm.reset({ warehouse_id: this.warehouseId() ?? this.ctx.activeId(), date: new Date(), scope: 'all', category_id: null, products: [], notes: '' });
    this.dialogOpen.set(true);
    if (!this.categories().length) {
      this.catalog.productCategories
        .all()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((list) => this.categories.set(list));
    }
  }

  searchProducts(event: AutoCompleteCompleteEvent): void {
    this.catalog.products
      .list({ search: event.query, active: '1', per_page: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        const chosen = new Set(this.selectedProducts().map((p) => p.id));
        this.productSuggestions.set(r.data.filter((p) => !chosen.has(p.id)));
      });
  }

  openCount(): void {
    this.submitted.set(true);
    const v = this.dialogForm.getRawValue();
    const scope = v.scope ?? 'all';
    if (this.dialogForm.invalid) {
      this.dialogForm.markAllAsTouched();
      return;
    }
    if (scope === 'category' && !v.category_id) {
      this.serverErrors.set({ category_id: ['Selecciona una categoría.'] });
      return;
    }
    if (scope === 'products' && !(v.products ?? []).length) {
      this.serverErrors.set({ product_ids: ['Agrega al menos un producto.'] });
      return;
    }
    this.serverErrors.set({});
    this.opening.set(true);
    const payload: StockCountPayload = {
      warehouse_id: v.warehouse_id as number,
      date: this.toIso(v.date) ?? '',
      counted_by: null,
      notes: v.notes?.trim() || null,
      scope,
      category_id: scope === 'category' ? v.category_id : undefined,
      product_ids: scope === 'products' ? (v.products ?? []).map((p) => p.id) : undefined,
    };
    this.api
      .openCount(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          this.opening.set(false);
          this.dialogOpen.set(false);
          this.toast.success('Conteo abierto.', `${c.number} · ${c.items_count ?? c.summary?.total ?? c.items?.length ?? 0} producto(s)`);
          void this.router.navigate(['/inventario/conteos', c.id]);
        },
        error: (err: unknown) => {
          this.opening.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as Partial<ValidationErrors>;
            this.serverErrors.set(body.errors ?? {});
            this.toast.warn(body.errors ? 'Revisa el formulario' : 'No se pudo abrir el conteo', body.message);
          }
        },
      });
  }

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  statusTone = countStatusTone;

  private toIso(d: Date | null | undefined): string | undefined {
    if (!(d instanceof Date)) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
