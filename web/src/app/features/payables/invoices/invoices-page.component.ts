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
import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { SupplierInvoice, payableTone } from '../../../core/models/payables.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña (incluye el pseudo-estado "vencida"); null = todas. */
  status: string | null;
}

/** Listado de facturas de proveedor con pestañas por estado, filtros y acceso rápido a registrar pagos. */
@Component({
  selector: 'app-invoices-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule,
    TooltipModule, PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoices-page.component.html',
})
export class InvoicesPageComponent {
  private readonly api = inject(PayablesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', status: null },
    { key: 'pendiente', label: 'Pendientes', status: 'pendiente' },
    { key: 'parcial', label: 'Pago parcial', status: 'parcial' },
    { key: 'vencida', label: 'Vencidas', status: 'vencida' },
    { key: 'pagada', label: 'Pagadas', status: 'pagada' },
    { key: 'anulada', label: 'Anuladas', status: 'anulada' },
  ];

  // Listado
  readonly rows = signal<SupplierInvoice[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly counts = signal<Record<string, number>>({});
  readonly suppliers = signal<Supplier[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly supplierId = signal<number | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });

  readonly canCreate = computed(() => this.auth.can('supplier_invoices.create'));
  readonly canUpdate = computed(() => this.auth.can('supplier_invoices.update'));
  readonly canPay = computed(() => this.auth.can('supplier_payments.create'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Filtros iniciales desde la URL: ?status= (incluye "vencida") y ?supplier_id=.
    const qp = this.router.parseUrl(this.router.url).queryParams;
    const initialStatus = qp['status'] as string | undefined;
    if (initialStatus) {
      const match = this.tabs.find((t) => t.key === initialStatus || t.status === initialStatus);
      if (match) this.tab.set(match.key);
    }
    const initialSupplier = qp['supplier_id'] as string | undefined;
    if (initialSupplier && !Number.isNaN(+initialSupplier)) this.supplierId.set(+initialSupplier);

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

  /** Total por pestaña. "Todas" suma los estados reales (excluye el pseudo-estado "vencida"). */
  countFor(tab: StatusTab): number {
    const counts = this.counts();
    if (!tab.status) {
      return Object.entries(counts)
        .filter(([key]) => key !== 'vencida')
        .reduce((acc, [, n]) => acc + Number(n), 0);
    }
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
      .invoices({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        supplier_id: this.supplierId() ?? undefined,
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
      .invoiceCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.counts.set(c ?? {}));
  }

  isOpen(row: SupplierInvoice): boolean {
    return row.status === 'pendiente' || row.status === 'parcial';
  }

  goCreate(): void {
    void this.router.navigate(['/pagos/facturas/nueva']);
  }

  goDetail(row: SupplierInvoice): void {
    void this.router.navigate(['/pagos/facturas', row.id]);
  }

  goEdit(row: SupplierInvoice): void {
    void this.router.navigate(['/pagos/facturas', row.id, 'editar']);
  }

  /** Acceso rápido a registrar un pago aplicado a esta factura. */
  goPay(row: SupplierInvoice): void {
    void this.router.navigate(['/pagos/pagos/nuevo'], { queryParams: { supplier_id: row.supplier_id, invoice: row.id } });
  }

  payableTone = payableTone;

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
