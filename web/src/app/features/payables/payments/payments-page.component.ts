import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
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
import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { SupplierPayment, payableTone } from '../../../core/models/payables.model';
import { ToastService } from '../../../core/services/toast.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña; null = todos. */
  status: 'confirmado' | 'anulado' | null;
}

/** Listado de pagos a proveedores con pestañas por estado, filtros y anulación rápida. */
@Component({
  selector: 'app-payments-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payments-page.component.html',
})
export class PaymentsPageComponent {
  private readonly api = inject(PayablesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todos', status: null },
    { key: 'confirmado', label: 'Confirmados', status: 'confirmado' },
    { key: 'anulado', label: 'Anulados', status: 'anulado' },
  ];

  readonly rows = signal<SupplierPayment[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly suppliers = signal<Supplier[]>([]);
  readonly methods = signal<{ value: string; label: string }[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly supplierId = signal<number | null>(null);
  readonly method = signal<string | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'date', dir: 'desc' });
  readonly cancelling = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('supplier_payments.create'));
  readonly canDelete = computed(() => this.auth.can('supplier_payments.delete'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde ?status= (p. ej. desde el dashboard).
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

    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));
    this.api
      .paymentMethods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((m) => this.methods.set(Object.entries(m ?? {}).map(([value, label]) => ({ value, label }))));
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  selectTab(key: string): void {
    if (this.tab() === key) return;
    this.tab.set(key);
    this.reload();
  }

  setSupplier(id: number | null): void {
    this.supplierId.set(id);
    this.reload();
  }

  setMethod(m: string | null): void {
    this.method.set(m);
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
      .payments({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        supplier_id: this.supplierId() ?? undefined,
        method: this.method() ?? undefined,
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

  goCreate(): void {
    void this.router.navigate(['/pagos/pagos/nuevo']);
  }

  goDetail(row: SupplierPayment): void {
    void this.router.navigate(['/pagos/pagos', row.id]);
  }

  /** Facturas abonadas por el pago (máx. 3 números para chips + resto). */
  invoiceNumbers(row: SupplierPayment): { shown: string[]; more: number } {
    const numbers = (row.allocations ?? []).map((a) => a.invoice?.number).filter((n): n is string => !!n);
    return { shown: numbers.slice(0, 3), more: Math.max(0, numbers.length - 3) };
  }

  cancelPayment(row: SupplierPayment): void {
    if (this.cancelling() !== null) return;
    this.confirm.confirm({
      header: 'Anular pago',
      message: `¿Anular el pago ${row.number}? Anular revierte los abonos en las facturas y no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.cancelling.set(row.id);
        this.api
          .cancelPayment(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.cancelling.set(null);
              this.toast.success('Pago anulado.', `${fresh.number} · abonos revertidos en las facturas.`);
              this.load();
            },
            error: (err: unknown) => {
              this.cancelling.set(null);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string; errors?: Record<string, string[]> };
                const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                this.toast.warn('No se pudo anular', first ?? body.message);
              }
            },
          });
      },
    });
  }

  payableTone = payableTone;

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
