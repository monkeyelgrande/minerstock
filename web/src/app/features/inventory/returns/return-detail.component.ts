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
import { SupplierReturn, SupplierReturnItem } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type ReturnAction = 'confirm' | 'cancel';

function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Detalle de devolución a proveedor: ítems devueltos, datos de origen, línea de tiempo y adjuntos. */
@Component({
  selector: 'app-return-detail',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, RouterLink, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './return-detail.component.html',
})
export class ReturnDetailComponent {
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly doc = signal<SupplierReturn | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<ReturnAction | null>(null);

  readonly canUpdate = computed(() => this.auth.can('supplier_returns.update'));
  readonly canDelete = computed(() => this.auth.can('supplier_returns.delete'));

  private readonly status = computed(() => this.doc()?.status ?? null);

  readonly showEdit = computed(() => !!this.doc()?.is_editable && this.canUpdate());
  readonly showConfirm = computed(() => this.status() === 'borrador' && this.canUpdate());
  readonly showCancel = computed(() => (this.status() === 'borrador' || this.status() === 'confirmado') && this.canDelete());

  readonly items = computed<SupplierReturnItem[]>(() => this.doc()?.items ?? []);
  readonly totalQtyBase = computed(() => this.items().reduce((sum, it) => sum + Number(it.qty_base ?? 0), 0));

  readonly timeline = computed<TimelineEvent[]>(() => {
    const d = this.doc();
    if (!d) return [];
    const events: TimelineEvent[] = [{ title: 'Creada', at: d.created_at, by: d.creator?.name, tone: 'draft' }];
    if (d.confirmed_at) events.push({ title: 'Confirmada · salida del stock', at: d.confirmed_at, tone: 'success' });
    if (d.status === 'anulado') events.push({ title: 'Anulada', at: d.updated_at, tone: 'danger' });
    return events;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  load(id: number | null = this.doc()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .supplierReturn(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.doc.set(d);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/inventario/devoluciones']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const d = this.doc();
    if (d) void this.router.navigate(['/inventario/devoluciones', d.id, 'editar']);
  }

  confirmReturn(): void {
    const d = this.doc();
    if (!d) return;
    this.ask(
      'Confirmar devolución',
      `Al confirmar ${d.number} la mercancía se descuenta del stock de ${d.warehouse?.name ?? 'la bodega'} y la devolución ya no se podrá editar. ¿Continuar?`,
      'Confirmar',
      () => this.run('confirm', 'Devolución confirmada · mercancía descontada del stock.'),
    );
  }

  cancelReturn(): void {
    const d = this.doc();
    if (!d) return;
    const msg =
      d.status === 'confirmado'
        ? `Anular ${d.number} reingresa la mercancía al stock. Esta acción no se puede deshacer. ¿Continuar?`
        : `¿Anular el borrador ${d.number}? Esta acción no se puede deshacer.`;
    this.ask('Anular devolución', msg, 'Anular', () => this.run('cancel', 'Devolución anulada.'), true);
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

  private run(action: ReturnAction, successMsg: string): void {
    const d = this.doc();
    if (!d || this.acting()) return;
    this.acting.set(action);
    this.api
      .returnAction(d.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.doc.set(fresh);
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

  docTone = docTone;
}
