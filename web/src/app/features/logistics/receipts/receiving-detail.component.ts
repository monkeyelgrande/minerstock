import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ShipmentReceipt, ShipmentReceiptItem, noveltyTone } from '../../../core/models/logistics.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type ReceiptAction = 'confirm' | 'cancel';

function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Detalle de recepción en mina: ítems verificados, novedades, planilla firmada y línea de tiempo. */
@Component({
  selector: 'app-receiving-detail',
  imports: [
    DatePipe, DecimalPipe, RouterLink, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receiving-detail.component.html',
})
export class ReceivingDetailComponent {
  private readonly api = inject(LogisticsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly receipt = signal<ShipmentReceipt | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<ReceiptAction | null>(null);

  // ---------- Permisos y acciones disponibles ----------
  readonly canUpdate = computed(() => this.auth.can('shipment_receipts.update'));
  readonly canDelete = computed(() => this.auth.can('shipment_receipts.delete'));

  private readonly status = computed(() => this.receipt()?.status ?? null);

  readonly showEdit = computed(() => !!this.receipt()?.is_editable && this.canUpdate());
  readonly showConfirm = computed(() => this.status() === 'borrador' && this.canUpdate());
  readonly showCancel = computed(() => (this.status() === 'borrador' || this.status() === 'confirmado') && this.canDelete());
  readonly hasSignedSheet = computed(() => !!this.receipt()?.has_signed_sheet);

  readonly items = computed<ShipmentReceiptItem[]>(() => this.receipt()?.items ?? []);
  readonly novelties = computed(() => this.receipt()?.novelties ?? []);

  readonly subtitle = computed(() => {
    const s = this.receipt()?.shipment;
    if (!s) return '';
    const origin = s.origin?.code ?? s.origin?.name ?? '—';
    const destination = s.destination?.code ?? s.destination?.name ?? '—';
    return `${s.number} · ${origin} → ${destination}`;
  });

  readonly totals = computed(() =>
    this.items().reduce(
      (acc, it) => ({
        sent: acc.sent + Number(it.shipment_item?.qty_base ?? 0),
        received: acc.received + Number(it.qty_received_base),
        damaged: acc.damaged + Number(it.qty_damaged_base),
        extra: acc.extra + Number(it.qty_extra_base),
        missing: acc.missing + Number(it.qty_missing_base),
      }),
      { sent: 0, received: 0, damaged: 0, extra: 0, missing: 0 },
    ),
  );

  readonly timeline = computed<TimelineEvent[]>(() => {
    const r = this.receipt();
    if (!r) return [];
    const events: TimelineEvent[] = [{ title: 'Creada', at: r.created_at, by: r.creator?.name, tone: 'draft' }];
    if (r.confirmed_at) events.push({ title: 'Confirmada · ingreso al stock', at: r.confirmed_at, by: r.receiver?.name, tone: 'success' });
    if (r.status === 'anulado') events.push({ title: 'Anulada', at: r.updated_at, tone: 'danger' });
    return events;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  load(id: number | null = this.receipt()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .receipt(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.receipt.set(r);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/logistica/recepcion']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const r = this.receipt();
    if (r) void this.router.navigate(['/logistica/recepcion', r.id, 'editar']);
  }

  confirmReceipt(): void {
    const r = this.receipt();
    if (!r) return;
    this.ask(
      'Confirmar recepción',
      'Confirmar ingresa al stock lo recibido en buen estado y registra las novedades. ¿Continuar?',
      'Confirmar',
      () => this.run('confirm', 'Recepción confirmada · mercancía ingresada al stock.'),
    );
  }

  cancelReceipt(): void {
    const r = this.receipt();
    if (!r) return;
    const msg =
      r.status === 'confirmado'
        ? `Anular ${r.number} revierte el ingreso al stock y deja las cantidades de nuevo en tránsito. Esta acción no se puede deshacer. ¿Continuar?`
        : `¿Anular el borrador ${r.number}? Esta acción no se puede deshacer.`;
    this.ask('Anular recepción', msg, 'Anular', () => this.run('cancel', 'Recepción anulada.'), true);
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

  private run(action: ReceiptAction, successMsg: string): void {
    const r = this.receipt();
    if (!r || this.acting()) return;
    this.acting.set(action);
    this.api
      .receiptAction(r.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.receipt.set(fresh);
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
  noveltyTone = noveltyTone;
}
