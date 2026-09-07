import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Adjustment, AdjustmentItem } from '../../../core/models/inventory.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';
import { simpleStatusTone } from './status-tone';

type AdjustmentAction = 'confirm' | 'cancel';

/** Detalle de un ajuste de inventario: ítems con entrada/salida, valores y acciones de flujo. */
@Component({
  selector: 'app-adjustment-detail',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, RouterLink, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustment-detail.component.html',
})
export class AdjustmentDetailComponent {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly adjustment = signal<Adjustment | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<AdjustmentAction | null>(null);

  /** Tipo de adjuntable del ajuste (el modelo compartido aún no lo incluye en la unión). */
  readonly attachType = 'adjustment' as AttachableType;

  readonly canUpdate = computed(() => this.auth.can('adjustments.update'));
  readonly canDelete = computed(() => this.auth.can('adjustments.delete'));

  private readonly status = computed(() => this.adjustment()?.status ?? null);

  readonly showEdit = computed(() => !!this.adjustment()?.is_editable && this.canUpdate());
  readonly showConfirm = computed(() => this.status() === 'borrador' && this.canUpdate());
  readonly showCancel = computed(() => (this.status() === 'borrador' || this.status() === 'confirmado') && this.canDelete());

  readonly items = computed<AdjustmentItem[]>(() => this.adjustment()?.items ?? []);

  readonly totals = computed(() => {
    let entries = 0;
    let exits = 0;
    let entriesQty = 0;
    let exitsQty = 0;
    for (const it of this.items()) {
      const qty = Number(it.qty_base);
      const value = Math.abs(Number(it.line_cost ?? 0));
      if (qty >= 0) {
        entries += value;
        entriesQty++;
      } else {
        exits += value;
        exitsQty++;
      }
    }
    return { entries, exits, entriesQty, exitsQty, net: entries - exits };
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const a = this.adjustment();
    if (!a) return [];
    const events: TimelineEvent[] = [
      { title: a.stock_count ? `Generado por el conteo ${a.stock_count.number}` : 'Creado', at: a.created_at, by: a.creator?.name, tone: 'draft' },
    ];
    if (a.confirmed_at) events.push({ title: 'Confirmado · aplicado al stock', at: a.confirmed_at, tone: 'success' });
    if (a.status === 'anulado') events.push({ title: 'Anulado', at: a.updated_at, tone: 'danger' });
    return events;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  load(id: number | null = this.adjustment()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .adjustment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => {
          this.adjustment.set(a);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/inventario/ajustes']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const a = this.adjustment();
    if (a) void this.router.navigate(['/inventario/ajustes', a.id, 'editar']);
  }

  confirmAdjustment(): void {
    this.ask('Confirmar ajuste', 'Confirmar aplica el ajuste al stock y no se puede editar después. ¿Continuar?', 'Confirmar', () =>
      this.run('confirm', 'Ajuste confirmado y aplicado al stock.'),
    );
  }

  cancelAdjustment(): void {
    const confirmed = this.status() === 'confirmado';
    this.ask(
      'Anular ajuste',
      confirmed
        ? 'El ajuste ya fue aplicado: al anularlo se registrarán los movimientos inversos en el kardex. ¿Continuar?'
        : '¿Anular este ajuste? Esta acción no se puede deshacer.',
      'Anular',
      () => this.run('cancel', 'Ajuste anulado.'),
      true,
    );
  }

  private ask(header: string, message: string, acceptLabel: string, accept: () => void, danger = false): void {
    this.confirm.confirm({
      header,
      message,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel,
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: danger ? 'p-button-danger' : undefined,
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept,
    });
  }

  private run(action: AdjustmentAction, successMsg: string): void {
    const a = this.adjustment();
    if (!a || this.acting()) return;
    this.acting.set(action);
    this.api
      .adjustmentAction(a.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.adjustment.set(fresh);
          this.toast.success(successMsg, fresh.number);
        },
        error: (err: unknown) => {
          this.acting.set(null);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as { message?: string; errors?: Record<string, string[]> };
            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
            this.toast.warn('No se pudo completar la acción', first ?? body.message);
          }
        },
      });
  }

  // ---------- Presentación ----------

  isEntry(it: AdjustmentItem): boolean {
    return Number(it.qty_base) >= 0;
  }

  absQty(it: AdjustmentItem): number {
    return Math.abs(Number(it.qty_base));
  }

  statusTone = simpleStatusTone;
}
