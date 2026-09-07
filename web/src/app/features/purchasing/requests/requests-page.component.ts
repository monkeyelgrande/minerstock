import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PRIORITY_LABELS, Priority, PurchaseRequest, PurchaseRequestStatus, priorityTone, statusTone } from '../../../core/models/purchasing.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estados que agrupa la pestaña; null = todos. */
  statuses: PurchaseRequestStatus[] | null;
}

/** Listado de solicitudes de compra con pestañas por estado y filtros. */
@Component({
  selector: 'app-requests-page',
  imports: [
    DatePipe, FormsModule, RouterLink, TableModule, ButtonModule, SelectModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './requests-page.component.html',
})
export class RequestsPageComponent {
  private readonly api = inject(PurchasingApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', statuses: null },
    { key: 'borrador', label: 'Borrador', statuses: ['borrador'] },
    { key: 'enviada', label: 'Pendientes de aprobación', statuses: ['enviada'] },
    { key: 'aprobada', label: 'Aprobadas', statuses: ['aprobada'] },
    { key: 'rechazada', label: 'Rechazadas', statuses: ['rechazada'] },
    { key: 'en_proceso', label: 'En proceso', statuses: ['en_proceso', 'atendida'] },
    { key: 'cerrada', label: 'Cerradas / Anuladas', statuses: ['cerrada', 'anulada'] },
  ];

  readonly priorityOptions: { label: string; value: Priority }[] = (Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => ({
    label: PRIORITY_LABELS[p],
    value: p,
  }));

  // Listado
  readonly rows = signal<PurchaseRequest[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly counts = signal<Record<string, number>>({});
  readonly search = signal('');
  readonly tab = signal('all');
  readonly warehouseId = signal<number | null>(null);
  readonly priority = signal<Priority | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' });

  readonly canCreate = computed(() => this.auth.can('purchase_requests.create'));
  readonly canUpdate = computed(() => this.auth.can('purchase_requests.update'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde `?status=` (acepta la clave de pestaña o un estado concreto, ej. enviada / anulada).
    const initial = this.route.snapshot.queryParamMap.get('status');
    if (initial) {
      const tab = this.tabs.find((t) => t.key === initial || t.statuses?.includes(initial as PurchaseRequestStatus));
      if (tab) this.tab.set(tab.key);
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
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: key === 'all' ? null : key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.page.set(1);
    this.load();
  }

  setPriority(p: Priority | null): void {
    this.priority.set(p);
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
      .requests({
        search: this.search() || undefined,
        status: tab?.statuses ? tab.statuses.join(',') : undefined,
        warehouse_id: this.warehouseId() ?? undefined,
        priority: this.priority() ?? undefined,
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
      .requestCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.counts.set(c ?? {}));
  }

  goCreate(): void {
    void this.router.navigate(['/compras/solicitudes/nueva']);
  }

  goDetail(row: PurchaseRequest): void {
    void this.router.navigate(['/compras/solicitudes', row.id]);
  }

  goEdit(row: PurchaseRequest): void {
    void this.router.navigate(['/compras/solicitudes', row.id, 'editar']);
  }

  statusTone = statusTone;
  priorityTone = priorityTone;
  priorityLabel(p: Priority): string {
    return PRIORITY_LABELS[p] ?? p;
  }
}
