import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SimpleDocStatus } from '../../../core/models/inventory.model';
import { Shipment, ShipmentReceipt } from '../../../core/models/logistics.model';
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

/** Listado de recepciones en mina: planillas por recibir, pestañas por estado y filtros. */
@Component({
  selector: 'app-receiving-page',
  imports: [
    DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receiving-page.component.html',
})
export class ReceivingPageComponent {
  private readonly api = inject(LogisticsApi);
  private readonly router = inject(Router);
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
  readonly rows = signal<ShipmentReceipt[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly warehouseId = signal<number | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);

  // Planillas despachadas pendientes de recibir
  readonly pending = signal<Shipment[]>([]);
  readonly pendingLoading = signal(false);

  readonly canCreate = computed(() => this.auth.can('shipment_receipts.create'));
  readonly canUpdate = computed(() => this.auth.can('shipment_receipts.update'));

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

    this.loadPending();
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
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const tab = this.tabs.find((t) => t.key === this.tab());
    this.api
      .receipts({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        destination_warehouse_id: this.warehouseId() ?? undefined,
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

  /** Planillas en camino (despachadas o recibidas parcialmente) hacia las bodegas del usuario. */
  private loadPending(): void {
    this.pendingLoading.set(true);
    this.api
      .shipments({ status: 'despachada,recibida_parcial', per_page: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.pending.set(res.data);
          this.pendingLoading.set(false);
        },
        error: () => this.pendingLoading.set(false),
      });
  }

  goCreate(shipmentId?: number): void {
    void this.router.navigate(['/logistica/recepcion/nueva'], shipmentId ? { queryParams: { shipment: shipmentId } } : undefined);
  }

  goDetail(row: ShipmentReceipt): void {
    void this.router.navigate(['/logistica/recepcion', row.id]);
  }

  goEdit(row: ShipmentReceipt): void {
    void this.router.navigate(['/logistica/recepcion', row.id, 'editar']);
  }

  docTone = docTone;
}
