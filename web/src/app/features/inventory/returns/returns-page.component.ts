import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { SimpleDocStatus, SupplierReturn } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  status: SimpleDocStatus | null;
}

function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Listado de devoluciones a proveedor con pestañas por estado y filtros. */
@Component({
  selector: 'app-returns-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './returns-page.component.html',
})
export class ReturnsPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', status: null },
    { key: 'borrador', label: 'Borrador', status: 'borrador' },
    { key: 'confirmado', label: 'Confirmadas', status: 'confirmado' },
    { key: 'anulado', label: 'Anuladas', status: 'anulado' },
  ];

  readonly rows = signal<SupplierReturn[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly suppliers = signal<Supplier[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly supplierId = signal<number | null>(null);
  readonly warehouseId = signal<number | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });
  readonly confirming = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('supplier_returns.create'));
  readonly canUpdate = computed(() => this.auth.can('supplier_returns.update'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    const initial = this.router.parseUrl(this.router.url).queryParams['status'] as string | undefined;
    if (initial) {
      const match = this.tabs.find((t) => t.key === initial || t.status === initial);
      if (match) this.tab.set(match.key);
    }

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
    effect(() => {
      const s = this.search();
      if (s === this.lastSearch) return;
      this.lastSearch = s;
      untracked(() => this.search$.next(s));
    });

    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  selectTab(key: string): void {
    if (this.tab() === key) return;
    this.tab.set(key);
    this.page.set(1);
    this.load();
  }

  setSupplier(id: number | null): void {
    this.supplierId.set(id);
    this.page.set(1);
    this.load();
  }

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.page.set(1);
    this.load();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.perPage();
    this.perPage.set(rows);
    this.page.set(Math.floor(first / rows) + 1);
    if (event.sortField && typeof event.sortField === 'string') {
      this.sort.set({ field: event.sortField, dir: event.sortOrder === 1 ? 'asc' : 'desc' });
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const tab = this.tabs.find((t) => t.key === this.tab());
    const sort = this.sort();
    this.api
      .returns({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        supplier_id: this.supplierId() ?? undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        page: this.page(),
        per_page: this.perPage(),
        sort: sort.field,
        dir: sort.dir,
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

  goCreate(): void {
    void this.router.navigate(['/inventario/devoluciones/nueva']);
  }

  goDetail(row: SupplierReturn): void {
    void this.router.navigate(['/inventario/devoluciones', row.id]);
  }

  goEdit(row: SupplierReturn): void {
    void this.router.navigate(['/inventario/devoluciones', row.id, 'editar']);
  }

  /** Confirmación rápida desde el listado (descuenta la mercancía del stock). */
  confirmReturn(row: SupplierReturn): void {
    if (this.confirming() !== null) return;
    this.confirm.confirm({
      header: 'Confirmar devolución',
      message: `Al confirmar ${row.number} la mercancía se descuenta del stock de ${row.warehouse?.name ?? 'la bodega'} y la devolución ya no se podrá editar. ¿Continuar?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.confirming.set(row.id);
        this.api
          .returnAction(row.id, 'confirm')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.confirming.set(null);
              this.toast.success('Devolución confirmada.', fresh.number);
              this.load();
            },
            error: (err: unknown) => {
              this.confirming.set(null);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string; errors?: Record<string, string[]> };
                const firstError = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                this.toast.warn('No se pudo confirmar', firstError ?? body.message);
              }
            },
          });
      },
    });
  }

  docTone = docTone;
}
