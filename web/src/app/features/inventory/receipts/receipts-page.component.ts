import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { GoodsReceipt, SimpleDocStatus } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña; null = todas. */
  status: SimpleDocStatus | null;
}

/** Tono de chip para los estados borrador / confirmado / anulado. */
function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Listado de recepciones de compra con pestañas por estado, filtros y confirmación rápida. */
@Component({
  selector: 'app-receipts-page',
  imports: [
    DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receipts-page.component.html',
})
export class ReceiptsPageComponent {
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

  // Listado
  readonly rows = signal<GoodsReceipt[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly counts = signal<Record<string, number>>({});
  readonly suppliers = signal<Supplier[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly supplierId = signal<number | null>(null);
  readonly warehouseId = signal<number | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });
  readonly confirming = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('goods_receipts.create'));
  readonly canUpdate = computed(() => this.auth.can('goods_receipts.update'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde ?status= (p. ej. desde el dashboard).
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

    this.loadCounts();
    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  countFor(tab: StatusTab): number {
    const counts = this.counts();
    if (!tab.status) return Object.values(counts).reduce((a, b) => a + Number(b), 0);
    return Number(counts[tab.status] ?? 0);
  }

  selectTab(key: string): void {
    if (this.tab() === key) return;
    this.tab.set(key);
    this.page.set(1);
    this.load();
  }

  setSupplier(id: number | null): void {
    this.supplierId.set(id);
    this.reload();
  }

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.reload();
  }

  setDateFrom(d: Date | null): void {
    this.dateFrom.set(d);
    this.reload();
  }

  setDateTo(d: Date | null): void {
    this.dateTo.set(d);
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
      .receipts({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        supplier_id: this.supplierId() ?? undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        date_from: this.toIso(this.dateFrom()),
        date_to: this.toIso(this.dateTo()),
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

  private loadCounts(): void {
    this.api
      .receiptCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.counts.set(c ?? {}));
  }

  goCreate(): void {
    void this.router.navigate(['/inventario/recepciones/nueva']);
  }

  goDetail(row: GoodsReceipt): void {
    void this.router.navigate(['/inventario/recepciones', row.id]);
  }

  goEdit(row: GoodsReceipt): void {
    void this.router.navigate(['/inventario/recepciones', row.id, 'editar']);
  }

  /** Confirmación rápida desde el listado (ingresa la mercancía al stock). */
  confirmReceipt(row: GoodsReceipt): void {
    if (this.confirming() !== null) return;
    this.confirm.confirm({
      header: 'Confirmar recepción',
      message: `Al confirmar ${row.number} la mercancía ingresa al stock de ${row.warehouse?.name ?? 'la bodega'} y la recepción ya no se podrá editar. ¿Continuar?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.confirming.set(row.id);
        this.api
          .receiptAction(row.id, 'confirm')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.confirming.set(null);
              this.toast.success('Recepción confirmada.', fresh.number);
              this.loadCounts();
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

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
