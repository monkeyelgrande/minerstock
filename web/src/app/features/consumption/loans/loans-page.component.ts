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

import { ConsumptionApi } from '../../../core/api/consumption-api.service';
import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Recipient } from '../../../core/models/catalog.model';
import { Loan, LoanStatus, loanTone } from '../../../core/models/consumption.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña; null = todas. */
  status: LoanStatus | null;
  /** Pestaña especial de vencidos: usa overdue=1 e ignora el estado. */
  overdue?: boolean;
}

/** Listado de préstamos de herramientas retornables con pestañas por estado y filtros. */
@Component({
  selector: 'app-loans-page',
  imports: [
    DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loans-page.component.html',
})
export class LoansPageComponent {
  private readonly api = inject(ConsumptionApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todos', status: null },
    { key: 'borrador', label: 'Borrador', status: 'borrador' },
    { key: 'abierto', label: 'Abiertos', status: 'abierto' },
    { key: 'vencidos', label: 'Vencidos', status: null, overdue: true },
    { key: 'parcial', label: 'Parciales', status: 'parcial' },
    { key: 'devuelto', label: 'Devueltos', status: 'devuelto' },
    { key: 'cerrado_con_perdida', label: 'Cerrados con pérdida', status: 'cerrado_con_perdida' },
    { key: 'anulado', label: 'Anulados', status: 'anulado' },
  ];

  // Listado
  readonly rows = signal<Loan[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly counts = signal<Record<string, number>>({});
  readonly overdueCount = signal(0);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly warehouseId = signal<number | null>(null);
  readonly recipientId = signal<number | null>(null);
  readonly recipients = signal<Recipient[]>([]);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });
  readonly downloading = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('loans.create'));
  readonly canUpdate = computed(() => this.auth.can('loans.update'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde ?status= u ?overdue= (p. ej. desde el dashboard o herramientas por persona).
    const qp = this.router.parseUrl(this.router.url).queryParams;
    if (qp['overdue'] === '1') {
      this.tab.set('vencidos');
    } else if (qp['status']) {
      const first = String(qp['status']).split(',')[0];
      const match = this.tabs.find((t) => t.key === first || t.status === first);
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

    this.catalog.recipients
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.recipients.set(list));

    this.loadCounts();
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  countFor(tab: StatusTab): number {
    if (tab.overdue) return this.overdueCount();
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

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.reload();
  }

  setRecipient(id: number | null): void {
    this.recipientId.set(id);
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
      .loans({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        overdue: tab?.overdue ? '1' : undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        recipient_id: this.recipientId() ?? undefined,
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
      .loanCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ counts, overdue }) => {
        this.counts.set(counts ?? {});
        this.overdueCount.set(overdue);
      });
  }

  goCreate(): void {
    void this.router.navigate(['/bodega/prestamos/nuevo']);
  }

  goDetail(row: Loan): void {
    void this.router.navigate(['/bodega/prestamos', row.id]);
  }

  goEdit(row: Loan): void {
    void this.router.navigate(['/bodega/prestamos', row.id, 'editar']);
  }

  /** Abre el detalle con el diálogo de devolución listo (?return=1). */
  goReturn(row: Loan): void {
    void this.router.navigate(['/bodega/prestamos', row.id], { queryParams: { return: '1' } });
  }

  /** Abre el PDF del préstamo (el vale que firma el receptor). */
  openPdf(row: Loan): void {
    if (this.downloading() !== null) return;
    this.downloading.set(row.id);
    this.api
      .loanPdf(row.id)
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
          this.toast.warn('PDF no disponible', 'No se pudo generar el PDF del préstamo.');
        },
      });
  }

  loanTone = loanTone;
}
