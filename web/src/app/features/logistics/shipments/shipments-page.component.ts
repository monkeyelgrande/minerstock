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

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Shipment, ShipmentStatus, shipmentTone } from '../../../core/models/logistics.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estados que agrupa la pestaña; null = todas. */
  statuses: ShipmentStatus[] | null;
}

/** Listado de planillas de viaje (despachos entre bodegas) con pestañas por estado y filtros. */
@Component({
  selector: 'app-shipments-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipments-page.component.html',
})
export class ShipmentsPageComponent {
  private readonly api = inject(LogisticsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', statuses: null },
    { key: 'borrador', label: 'Borrador', statuses: ['borrador'] },
    { key: 'despachada', label: 'Despachadas', statuses: ['despachada'] },
    { key: 'recibida_parcial', label: 'Recibidas parciales', statuses: ['recibida_parcial'] },
    { key: 'recibida', label: 'Recibidas', statuses: ['recibida'] },
    { key: 'cerrada', label: 'Cerradas', statuses: ['cerrada'] },
    { key: 'anulada', label: 'Anuladas', statuses: ['anulada'] },
  ];

  // Listado
  readonly rows = signal<Shipment[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly counts = signal<Record<string, number>>({});
  readonly search = signal('');
  readonly tab = signal('all');
  readonly originId = signal<number | null>(null);
  readonly destinationId = signal<number | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });
  readonly downloading = signal<number | null>(null);
  readonly dispatching = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('shipments.create'));
  readonly canUpdate = computed(() => this.auth.can('shipments.update'));
  readonly canDispatch = computed(() => this.auth.can('shipments.dispatch'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde ?status= (p. ej. desde el dashboard o "en tránsito").
    const initial = this.router.parseUrl(this.router.url).queryParams['status'] as string | undefined;
    if (initial) {
      const first = initial.split(',')[0];
      const match = this.tabs.find((t) => t.key === first || t.statuses?.includes(first as ShipmentStatus));
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

  setOrigin(id: number | null): void {
    this.originId.set(id);
    this.reload();
  }

  setDestination(id: number | null): void {
    this.destinationId.set(id);
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
      .shipments({
        search: this.search() || undefined,
        status: tab?.statuses ? tab.statuses.join(',') : undefined,
        origin_warehouse_id: this.originId() ?? undefined,
        destination_warehouse_id: this.destinationId() ?? undefined,
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
      .shipmentCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.counts.set(c ?? {}));
  }

  goCreate(): void {
    void this.router.navigate(['/logistica/planillas/nueva']);
  }

  goDetail(row: Shipment): void {
    void this.router.navigate(['/logistica/planillas', row.id]);
  }

  goEdit(row: Shipment): void {
    void this.router.navigate(['/logistica/planillas', row.id, 'editar']);
  }

  /** Despacho rápido desde el listado (solo borradores). */
  dispatch(row: Shipment): void {
    if (this.dispatching() !== null) return;
    this.confirm.confirm({
      header: 'Despachar planilla',
      message: `Despachar ${row.number} descarga el stock de la bodega origen al costo promedio y deja la mercancía en tránsito. ¿Continuar?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Despachar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.dispatching.set(row.id);
        this.api
          .shipmentAction(row.id, 'dispatch')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.dispatching.set(null);
              this.toast.success('Planilla despachada.', fresh.number);
              this.load();
              this.loadCounts();
            },
            error: (err: unknown) => {
              this.dispatching.set(null);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string };
                this.toast.warn('No se pudo despachar', body.message);
              }
            },
          });
      },
    });
  }

  /** Abre el PDF de la planilla (el papel que viaja con el chofer). */
  openPdf(row: Shipment): void {
    if (this.downloading() !== null) return;
    this.downloading.set(row.id);
    this.api
      .shipmentPdf(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloading.set(null);
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${row.number}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => {
          this.downloading.set(null);
          this.toast.warn('PDF no disponible', 'No se pudo generar el PDF de la planilla.');
        },
      });
  }

  pct(row: Shipment): number {
    return Math.max(0, Math.min(100, Number(row.received_pct ?? 0)));
  }

  shipmentTone = shipmentTone;

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
