import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { PurchaseOrder, PurchaseOrderStatus, statusTone } from '../../../core/models/purchasing.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { ToastService } from '../../../core/services/toast.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estados que agrupa la pestaña; null = todas. */
  statuses: PurchaseOrderStatus[] | null;
}

/** Listado de órdenes de compra con pestañas por estado y filtros. */
@Component({
  selector: 'app-orders-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-page.component.html',
})
export class OrdersPageComponent {
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', statuses: null },
    { key: 'borrador', label: 'Borrador', statuses: ['borrador'] },
    { key: 'pendiente_aprobacion', label: 'Pendientes de aprobación', statuses: ['pendiente_aprobacion'] },
    { key: 'aprobada', label: 'Aprobadas', statuses: ['aprobada'] },
    { key: 'emitida', label: 'Emitidas', statuses: ['emitida'] },
    { key: 'recibida', label: 'Recibidas', statuses: ['recibida_parcial', 'recibida'] },
    { key: 'cerrada', label: 'Cerradas', statuses: ['cerrada'] },
    { key: 'anulada', label: 'Anuladas / Rechazadas', statuses: ['anulada', 'rechazada'] },
  ];

  // Listado
  readonly rows = signal<PurchaseOrder[]>([]);
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
  readonly downloading = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('purchase_orders.create'));
  readonly canUpdate = computed(() => this.auth.can('purchase_orders.update'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde ?status= (p. ej. desde el dashboard).
    const initial = this.router.parseUrl(this.router.url).queryParams['status'] as string | undefined;
    if (initial) {
      const match = this.tabs.find((t) => t.key === initial || t.statuses?.includes(initial as PurchaseOrderStatus));
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
    if (!tab.statuses) return Object.values(counts).reduce((a, b) => a + Number(b), 0);
    return tab.statuses.reduce((sum, s) => sum + Number(counts[s] ?? 0), 0);
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
      .orders({
        search: this.search() || undefined,
        status: tab?.statuses ? tab.statuses.join(',') : undefined,
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
      .orderCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.counts.set(c ?? {}));
  }

  goCreate(): void {
    void this.router.navigate(['/compras/ordenes/nueva']);
  }

  goDetail(row: PurchaseOrder): void {
    void this.router.navigate(['/compras/ordenes', row.id]);
  }

  goEdit(row: PurchaseOrder): void {
    void this.router.navigate(['/compras/ordenes', row.id, 'editar']);
  }

  /** El PDF existe desde que la orden fue aprobada. */
  hasPdf(row: PurchaseOrder): boolean {
    return !row.is_editable && row.status !== 'pendiente_aprobacion' && row.status !== 'anulada';
  }

  downloadPdf(row: PurchaseOrder): void {
    if (this.downloading() !== null) return;
    this.downloading.set(row.id);
    this.api
      .orderPdf(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloading.set(null);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${row.number}.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        },
        error: () => {
          this.downloading.set(null);
          this.toast.warn('PDF no disponible', 'El PDF solo está disponible cuando la orden ha sido aprobada.');
        },
      });
  }

  pct(row: PurchaseOrder): number {
    return Math.max(0, Math.min(100, Number(row.received_pct ?? 0)));
  }

  statusTone = statusTone;

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
