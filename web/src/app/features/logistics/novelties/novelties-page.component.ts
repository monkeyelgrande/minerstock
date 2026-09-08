import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Novelty, noveltyTone } from '../../../core/models/logistics.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña; null = todas. */
  status: 'abierta' | 'resuelta' | null;
}

/** Novedades de transporte (faltantes, dañados, sobrantes) detectadas al recibir en mina. */
@Component({
  selector: 'app-novelties-page',
  imports: [
    DatePipe, DecimalPipe, FormsModule, RouterLink, TableModule, ButtonModule, DialogModule,
    SelectModule, TextareaModule, TooltipModule, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './novelties-page.component.html',
})
export class NoveltiesPageComponent {
  private readonly api = inject(LogisticsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly tabs: StatusTab[] = [
    { key: 'abierta', label: 'Abiertas', status: 'abierta' },
    { key: 'resuelta', label: 'Resueltas', status: 'resuelta' },
    { key: 'all', label: 'Todas', status: null },
  ];

  readonly typeOptions = [
    { label: 'Faltante', value: 'faltante' },
    { label: 'Dañado', value: 'dañado' },
    { label: 'Sobrante', value: 'sobrante' },
  ];

  // Listado
  readonly rows = signal<Novelty[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly tab = signal('abierta');
  readonly type = signal<string | null>(null);
  readonly warehouseId = signal<number | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);

  // Contadores para los chips KPI
  readonly counts = signal<Record<string, number>>({});
  readonly openCount = computed(() => this.counts()['abierta'] ?? 0);
  readonly resolvedCount = computed(() => this.counts()['resuelta'] ?? 0);

  readonly canResolve = computed(() => this.auth.can('novelties.update'));

  // Diálogo de resolución
  readonly resolving = signal<Novelty | null>(null);
  readonly resolution = signal('');
  readonly resolveSubmitted = signal(false);
  readonly resolveSaving = signal(false);

  constructor() {
    // Pestaña inicial desde ?status= (p. ej. desde el dashboard o el detalle de recepción).
    const initial = this.router.parseUrl(this.router.url).queryParams['status'] as string | undefined;
    if (initial) {
      const match = this.tabs.find((t) => t.key === initial || t.status === initial);
      if (match) this.tab.set(match.key);
    }
    this.loadCounts();
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

  setType(type: string | null): void {
    this.type.set(type);
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
      .novelties({
        status: tab?.status ?? undefined,
        type: this.type() ?? undefined,
        destination_warehouse_id: this.warehouseId() ?? undefined,
        page: this.page(),
        per_page: this.perPage(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // El endpoint devuelve el paginador plano de Laravel (total en la raíz, no en meta).
          const flat = res as unknown as { data: Novelty[]; total?: number; meta?: { total: number } };
          this.rows.set(flat.data ?? []);
          this.total.set(flat.meta?.total ?? flat.total ?? 0);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private loadCounts(): void {
    this.api
      .noveltyCounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.counts.set(c));
  }

  // ---------- Resolución ----------

  openResolve(n: Novelty): void {
    this.resolving.set(n);
    this.resolution.set('');
    this.resolveSubmitted.set(false);
  }

  closeResolve(): void {
    if (this.resolveSaving()) return;
    this.resolving.set(null);
  }

  saveResolution(): void {
    const n = this.resolving();
    if (!n) return;
    this.resolveSubmitted.set(true);
    const resolution = this.resolution().trim();
    if (!resolution) return;
    this.resolveSaving.set(true);
    this.api
      .resolveNovelty(n.id, resolution)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resolveSaving.set(false);
          this.resolving.set(null);
          this.toast.success('Novedad resuelta.', n.product?.name);
          this.load();
          this.loadCounts();
        },
        error: (err: unknown) => {
          this.resolveSaving.set(false);
          const msg = (err as { error?: { message?: string } })?.error?.message;
          this.toast.warn('No se pudo resolver la novedad', msg);
        },
      });
  }

  noveltyTone = noveltyTone;
}
