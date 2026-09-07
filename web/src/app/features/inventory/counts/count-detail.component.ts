import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, of, switchMap } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product } from '../../../core/models/catalog.model';
import { StockCount, StockCountItem } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';
import { countStatusTone } from '../adjustments/status-tone';

type CountAction = 'save' | 'close' | 'cancel' | 'add' | 'remove';
type RowFilter = 'all' | 'diff' | 'uncounted';

/** Fila editable del conteo: ítem del servidor + valores capturados localmente. */
interface CountRow {
  item: StockCountItem;
  counted: number | null;
  notes: string;
  /** Diferencia calculada en vivo (null si aún no se contó). */
  difference: number | null;
}

const EPS = 0.0005;

/** Detalle de un conteo físico: pantalla de registro de cantidades, cierre y consulta. */
@Component({
  selector: 'app-count-detail',
  imports: [
    DatePipe, DecimalPipe, FormsModule, RouterLink, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectButtonModule,
    AutoCompleteModule, TooltipModule,
    PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './count-detail.component.html',
})
export class CountDetailComponent {
  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly count = signal<StockCount | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<CountAction | null>(null);
  readonly rows = signal<CountRow[]>([]);
  readonly dirty = signal(false);

  // Filtros de la tabla
  readonly search = signal('');
  readonly filter = signal<RowFilter>('all');
  readonly filterOptions: { label: string; value: RowFilter }[] = [
    { label: 'Todos', value: 'all' },
    { label: 'Solo con diferencia', value: 'diff' },
    { label: 'Solo sin contar', value: 'uncounted' },
  ];

  // Diálogo "Agregar productos"
  readonly addOpen = signal(false);
  readonly addSelected = signal<Product[]>([]);
  readonly productSuggestions = signal<Product[]>([]);

  readonly canUpdate = computed(() => this.auth.can('stock_counts.update'));
  readonly canDelete = computed(() => this.auth.can('stock_counts.delete'));
  readonly isOpen = computed(() => !!this.count()?.is_open);
  readonly editable = computed(() => this.isOpen() && this.canUpdate());

  /** Resumen recalculado en vivo con lo que el usuario va digitando. */
  readonly summary = computed(() => {
    const rows = this.rows();
    return {
      total: rows.length,
      counted: rows.filter((r) => r.counted !== null).length,
      with_difference: rows.filter((r) => r.difference !== null && Math.abs(r.difference) >= EPS).length,
    };
  });

  readonly allCounted = computed(() => this.rows().length > 0 && this.rows().every((r) => r.counted !== null));
  readonly progressPct = computed(() => {
    const s = this.summary();
    return s.total ? Math.round((s.counted / s.total) * 100) : 0;
  });

  readonly visibleRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((r) => {
      if (f === 'diff' && !(r.difference !== null && Math.abs(r.difference) >= EPS)) return false;
      if (f === 'uncounted' && r.counted !== null) return false;
      if (!q) return true;
      const p = r.item.product;
      return !!p && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    });
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const c = this.count();
    if (!c) return [];
    const events: TimelineEvent[] = [{ title: 'Conteo abierto', at: c.created_at, by: c.creator?.name, tone: 'pending' }];
    if (c.status === 'cerrado') {
      events.push({
        title: c.adjustment ? `Cerrado · ajuste ${c.adjustment.number}` : 'Cerrado sin diferencias',
        at: c.closed_at ?? c.updated_at,
        by: c.counter?.name,
        tone: 'success',
      });
    }
    if (c.status === 'anulado') events.push({ title: 'Anulado', at: c.updated_at, tone: 'danger' });
    return events;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  load(id: number | null = this.count()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .count(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          this.apply(c, false);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/inventario/conteos']);
        },
      });
  }

  /** Aplica un conteo recibido del servidor; con `keepEdits` conserva lo digitado y no guardado. */
  private apply(c: StockCount, keepEdits: boolean): void {
    const previous = keepEdits ? new Map(this.rows().map((r) => [r.item.product_id, r])) : new Map<number, CountRow>();
    this.count.set(c);
    this.rows.set(
      (c.items ?? []).map((item) => {
        const prev = previous.get(item.product_id);
        const counted = prev ? prev.counted : item.counted_qty !== null ? Number(item.counted_qty) : null;
        const notes = prev ? prev.notes : (item.notes ?? '');
        return { item, counted, notes, difference: this.diff(item, counted) };
      }),
    );
    if (!keepEdits) this.dirty.set(false);
  }

  private diff(item: StockCountItem, counted: number | null): number | null {
    if (counted === null) return null;
    return Math.round((counted - Number(item.system_qty)) * 1000) / 1000;
  }

  // ---------- Edición de filas ----------

  setCounted(row: CountRow, value: number | null): void {
    const counted = value === null || value === undefined || Number.isNaN(value) ? null : Number(value);
    this.patchRow(row, { counted, difference: this.diff(row.item, counted) });
  }

  setNotes(row: CountRow, value: string): void {
    this.patchRow(row, { notes: value ?? '' });
  }

  private patchRow(row: CountRow, patch: Partial<CountRow>): void {
    this.rows.update((list) => list.map((r) => (r === row ? { ...r, ...patch } : r)));
    this.dirty.set(true);
  }

  /** Enter en el campo "Contado" pasa al siguiente producto visible. */
  onCountKeydown(event: KeyboardEvent, visibleIndex: number): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('[data-count-input] input');
    const next = inputs[visibleIndex + 1];
    if (next) {
      next.focus();
      next.select();
    } else {
      (event.target as HTMLInputElement | null)?.blur();
    }
  }

  /** Marca como "contado con la cantidad del sistema" (atajo para productos sin novedad). */
  acceptSystem(row: CountRow): void {
    this.setCounted(row, Number(row.item.system_qty));
  }

  // ---------- Acciones ----------

  save(): void {
    this.persist().subscribe({
      next: (c) => {
        this.acting.set(null);
        this.apply(c, false);
        this.toast.success('Avance guardado.', `${c.summary?.counted ?? 0} de ${c.summary?.total ?? 0} producto(s) contado(s)`);
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  close(): void {
    const s = this.summary();
    this.confirm.confirm({
      header: 'Cerrar conteo',
      message:
        s.with_difference > 0
          ? `Hay ${s.with_difference} producto(s) con diferencia. Al cerrar se generará y confirmará automáticamente un ajuste de inventario (motivo "Conteo físico") que aplicará esas diferencias al stock. ¿Continuar?`
          : 'No hay diferencias entre el sistema y lo contado. El conteo se cerrará sin generar ajuste. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Cerrar conteo',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        const c = this.count();
        if (!c) return;
        // Si hay cambios sin guardar se registran antes de cerrar.
        this.persist('close')
          .pipe(
            switchMap(() => this.api.countAction(c.id, 'close')),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe({
            next: (fresh) => {
              this.acting.set(null);
              this.apply(fresh, false);
              this.toast.success('Conteo cerrado.', fresh.adjustment ? `Se generó el ajuste ${fresh.adjustment.number}.` : 'Sin diferencias, no se generó ajuste.');
            },
            error: (err: unknown) => this.fail(err),
          });
      },
    });
  }

  cancelCount(): void {
    this.confirm.confirm({
      header: 'Anular conteo',
      message: '¿Anular este conteo? Se perderán las cantidades registradas y no se generará ningún ajuste.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        const c = this.count();
        if (!c || this.acting()) return;
        this.acting.set('cancel');
        this.api
          .countAction(c.id, 'cancel')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.acting.set(null);
              this.apply(fresh, false);
              this.toast.success('Conteo anulado.', fresh.number);
            },
            error: (err: unknown) => this.fail(err),
          });
      },
    });
  }

  /** Guarda las cantidades si hay cambios; si no, devuelve el conteo actual. */
  private persist(action: CountAction = 'save'): Observable<StockCount> {
    const c = this.count();
    if (!c) return of();
    this.acting.set(action);
    if (!this.dirty() && action !== 'save') return of(c);
    return this.api
      .recordCount(
        c.id,
        this.rows().map((r) => ({ product_id: r.item.product_id, counted_qty: r.counted, notes: r.notes.trim() || null })),
      )
      .pipe(takeUntilDestroyed(this.destroyRef));
  }

  private fail(err: unknown): void {
    this.acting.set(null);
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const body = err.error as { message?: string; errors?: Record<string, string[]> };
      const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
      this.toast.warn('No se pudo completar la acción', first ?? body.message);
    }
  }

  // ---------- Agregar / quitar productos ----------

  openAdd(): void {
    this.addSelected.set([]);
    this.productSuggestions.set([]);
    this.addOpen.set(true);
  }

  searchProducts(event: AutoCompleteCompleteEvent): void {
    this.catalog.products
      .list({ search: event.query, active: '1', per_page: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        const present = new Set([...this.rows().map((x) => x.item.product_id), ...this.addSelected().map((p) => p.id)]);
        this.productSuggestions.set(r.data.filter((p) => !present.has(p.id)));
      });
  }

  addProducts(): void {
    const c = this.count();
    const ids = this.addSelected().map((p) => p.id);
    if (!c || !ids.length || this.acting()) return;
    this.acting.set('add');
    this.api
      .addCountProducts(c.id, ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.apply(fresh, true);
          this.addOpen.set(false);
          this.toast.success(ids.length === 1 ? 'Producto agregado al conteo.' : `${ids.length} productos agregados al conteo.`);
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  removeRow(row: CountRow): void {
    const c = this.count();
    if (!c) return;
    this.confirm.confirm({
      header: 'Quitar producto',
      message: `¿Quitar "${row.item.product?.name ?? row.item.product_id}" del conteo?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Quitar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        if (this.acting()) return;
        this.acting.set('remove');
        this.api
          .removeCountProduct(c.id, row.item.product_id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.acting.set(null);
              this.apply(fresh, true);
              this.toast.success('Producto quitado del conteo.');
            },
            error: (err: unknown) => this.fail(err),
          });
      },
    });
  }

  // ---------- Presentación ----------

  diffTone(d: number | null): 'none' | 'zero' | 'neg' | 'pos' {
    if (d === null) return 'none';
    if (Math.abs(d) < EPS) return 'zero';
    return d < 0 ? 'neg' : 'pos';
  }

  statusTone = countStatusTone;
}
