import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { Quotation, QuotationStatus, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Pestaña de estado del listado. */
interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña; null = todas. */
  status: QuotationStatus | null;
}

/** Listado de cotizaciones de proveedores con pestañas por estado y filtros por proveedor y vigencia. */
@Component({
  selector: 'app-quotations-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quotations-page.component.html',
})
export class QuotationsPageComponent {
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', status: null },
    { key: 'borrador', label: 'Borrador', status: 'borrador' },
    { key: 'enviada', label: 'Enviadas', status: 'enviada' },
    { key: 'recibida', label: 'Con respuesta', status: 'recibida' },
    { key: 'seleccionada', label: 'Seleccionadas', status: 'seleccionada' },
    { key: 'descartada', label: 'Descartadas', status: 'descartada' },
  ];

  // Listado
  readonly rows = signal<Quotation[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly suppliers = signal<Supplier[]>([]);
  readonly search = signal('');
  readonly supplierId = signal<number | null>(null);
  readonly tab = signal('all');
  readonly onlyValid = signal(false);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });

  readonly canCreate = computed(() => this.auth.can('quotations.create'));
  readonly canUpdate = computed(() => this.auth.can('quotations.update'));
  readonly canDelete = computed(() => this.auth.can('quotations.delete'));
  readonly hasFilters = computed(() => !!this.search() || this.supplierId() !== null || this.tab() !== 'all' || this.onlyValid());

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde `?status=`.
    const initial = this.route.snapshot.queryParamMap.get('status');
    if (initial && this.tabs.some((t) => t.key === initial)) this.tab.set(initial);
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
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: key === 'all' ? null : key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setSupplier(id: number | null): void {
    this.supplierId.set(id);
    this.page.set(1);
    this.load();
  }

  setOnlyValid(v: boolean): void {
    this.onlyValid.set(v);
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
    const sort = this.sort();
    const status = this.tabs.find((t) => t.key === this.tab())?.status ?? null;
    this.api
      .quotations({
        search: this.search() || undefined,
        supplier_id: this.supplierId() ?? undefined,
        status: status ?? undefined,
        only_valid: this.onlyValid() ? 1 : undefined,
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

  /** El total aún no aplica en solicitudes sin precios (borrador/enviada con total 0). */
  showsNoPrices(row: Quotation): boolean {
    return Number(row.total) === 0 && (row.status === 'borrador' || row.status === 'enviada');
  }

  goCreate(): void {
    void this.router.navigate(['/compras/cotizaciones/nueva']);
  }

  goDetail(row: Quotation): void {
    void this.router.navigate(['/compras/cotizaciones', row.id]);
  }

  goEdit(row: Quotation): void {
    void this.router.navigate(['/compras/cotizaciones', row.id, 'editar']);
  }

  /** Abre el detalle con el diálogo "Registrar respuesta" abierto. */
  goRespond(row: Quotation): void {
    void this.router.navigate(['/compras/cotizaciones', row.id], { queryParams: { respond: 1 } });
  }

  /** Abre el PDF "Solicitud de cotización" en una pestaña nueva. */
  downloadPdf(row: Quotation): void {
    this.api
      .quotationPdf(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((blob) => window.open(URL.createObjectURL(blob)));
  }

  remove(row: Quotation): void {
    this.confirm.confirm({
      header: 'Eliminar cotización',
      message: `¿Eliminar la cotización ${row.number} de ${row.supplier?.name ?? 'proveedor'}? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.api
          .deleteQuotation(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success('Cotización eliminada.', row.number);
              this.load();
            },
            error: (err: unknown) => this.toastDomainError(err),
          });
      },
    });
  }

  /** Errores de regla de negocio (422 sin `errors`): el interceptor no los muestra. */
  private toastDomainError(err: unknown): void {
    const e = err as { status?: number; error?: { message?: string; errors?: unknown } };
    if (e?.status === 422 && !e.error?.errors) this.toast.error('No se pudo eliminar', e.error?.message);
  }

  statusTone = statusTone;
}
