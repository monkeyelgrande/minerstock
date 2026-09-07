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

import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Adjustment, SimpleDocStatus } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { simpleStatusTone } from './status-tone';

interface StatusTab {
  key: string;
  label: string;
  status: SimpleDocStatus | null;
}

/** Listado de ajustes de inventario con pestañas por estado y filtros. */
@Component({
  selector: 'app-adjustments-page',
  imports: [
    DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustments-page.component.html',
})
export class AdjustmentsPageComponent {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todos', status: null },
    { key: 'borrador', label: 'Borrador', status: 'borrador' },
    { key: 'confirmado', label: 'Confirmados', status: 'confirmado' },
    { key: 'anulado', label: 'Anulados', status: 'anulado' },
  ];

  readonly rows = signal<Adjustment[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly reasons = signal<{ label: string; value: string }[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly warehouseId = signal<number | null>(null);
  readonly reason = signal<string | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });
  readonly confirming = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('adjustments.create'));
  readonly canUpdate = computed(() => this.auth.can('adjustments.update'));

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

    this.api
      .adjustmentReasons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((map) => this.reasons.set(Object.entries(map).map(([value, label]) => ({ value, label }))));
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

  setReason(r: string | null): void {
    this.reason.set(r);
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
      .adjustments({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        reason: this.reason() ?? undefined,
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
    void this.router.navigate(['/inventario/ajustes/nuevo']);
  }

  goDetail(row: Adjustment): void {
    void this.router.navigate(['/inventario/ajustes', row.id]);
  }

  goEdit(row: Adjustment): void {
    void this.router.navigate(['/inventario/ajustes', row.id, 'editar']);
  }

  /** Confirmación rápida desde el listado (aplica el ajuste al stock). */
  confirmRow(row: Adjustment): void {
    this.confirm.confirm({
      header: 'Confirmar ajuste',
      message: `Confirmar ${row.number} aplica el ajuste al stock y no se puede editar después. ¿Continuar?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.confirming.set(row.id);
        this.api
          .adjustmentAction(row.id, 'confirm')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.confirming.set(null);
              this.toast.success('Ajuste confirmado.', fresh.number);
              this.load();
            },
            error: (err: unknown) => {
              this.confirming.set(null);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string };
                this.toast.warn('No se pudo confirmar', body.message);
              }
            },
          });
      },
    });
  }

  statusTone = simpleStatusTone;

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
