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
import { ConsumptionApi } from '../../../core/api/consumption-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Recipient } from '../../../core/models/catalog.model';
import { Issue, IssueStatus, issueTone } from '../../../core/models/consumption.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  status: IssueStatus | null;
}

/** Listado de vales de salida con pestañas por estado y filtros. */
@Component({
  selector: 'app-issues-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, DatePickerModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './issues-page.component.html',
})
export class IssuesPageComponent {
  private readonly api = inject(ConsumptionApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todos', status: null },
    { key: 'borrador', label: 'Borrador', status: 'borrador' },
    { key: 'confirmado', label: 'Confirmados', status: 'confirmado' },
    { key: 'anulado', label: 'Anulados', status: 'anulado' },
  ];

  readonly rows = signal<Issue[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly counts = signal<Record<string, number>>({});
  readonly recipients = signal<Recipient[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly warehouseId = signal<number | null>(null);
  readonly recipientId = signal<number | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });
  readonly downloading = signal<number | null>(null);

  readonly canCreate = computed(() => this.auth.can('issues.create'));
  readonly canUpdate = computed(() => this.auth.can('issues.update'));

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
    const counts = this.counts();
    if (!tab.status) return Object.values(counts).reduce((a, b) => a + Number(b), 0);
    return Number(counts[tab.status] ?? 0);
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

  setRecipient(id: number | null): void {
    this.recipientId.set(id);
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
      .issues({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        recipient_id: this.recipientId() ?? undefined,
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
      .issueCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((counts) => this.counts.set(counts));
  }

  goCreate(): void {
    void this.router.navigate(['/bodega/vales/nuevo']);
  }

  goDetail(row: Issue): void {
    void this.router.navigate(['/bodega/vales', row.id]);
  }

  goEdit(row: Issue): void {
    void this.router.navigate(['/bodega/vales', row.id, 'editar']);
  }

  /** Abre el PDF del vale (comprobante con firmas) en una pestaña nueva. */
  downloadPdf(row: Issue): void {
    if (this.downloading()) return;
    this.downloading.set(row.id);
    this.api
      .issuePdf(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloading.set(null);
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) {
            // Bloqueo de ventanas emergentes: se ofrece la descarga directa.
            const a = document.createElement('a');
            a.href = url;
            a.download = `${row.number}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        },
        error: () => this.downloading.set(null),
      });
  }

  statusTone = issueTone;

  private toIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
