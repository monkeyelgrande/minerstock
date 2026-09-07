import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Approval, PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type OrderAction = 'submit' | 'approve' | 'reject' | 'reopen' | 'issue' | 'cancel' | 'close';

interface Step {
  key: PurchaseOrderStatus;
  label: string;
  /** skipped: paso de recepción que no ocurrió (orden cerrada sin recibir). */
  state: 'done' | 'current' | 'todo' | 'skipped';
}

/** Flujo normal de una orden (los estados terminales rechazada/anulada se muestran como banner). */
const FLOW: { key: PurchaseOrderStatus; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'pendiente_aprobacion', label: 'Pendiente aprobación' },
  { key: 'aprobada', label: 'Aprobada' },
  { key: 'emitida', label: 'Emitida' },
  { key: 'recibida_parcial', label: 'Recibida parcial' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'cerrada', label: 'Cerrada' },
];

const PDF_STATUSES: PurchaseOrderStatus[] = ['aprobada', 'emitida', 'recibida_parcial', 'recibida', 'cerrada'];
const CANCEL_STATUSES: PurchaseOrderStatus[] = ['borrador', 'pendiente_aprobacion', 'rechazada', 'aprobada', 'emitida'];
const CLOSE_STATUSES: PurchaseOrderStatus[] = ['emitida', 'recibida_parcial', 'recibida'];

/** Detalle de orden de compra: estado, acciones de flujo, ítems con avance de recepción y trazabilidad. */
@Component({
  selector: 'app-order-detail',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, RouterLink, ButtonModule, DialogModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail.component.html',
})
export class OrderDetailComponent {
  private readonly api = inject(PurchasingApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly order = signal<PurchaseOrder | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<OrderAction | null>(null);
  readonly pdfLoading = signal(false);

  // Diálogo de decisión (aprobar / rechazar)
  readonly decisionOpen = signal(false);
  readonly decisionMode = signal<'approve' | 'reject'>('approve');
  readonly decisionText = signal('');
  readonly decisionSubmitted = signal(false);
  readonly decisionError = signal<string | undefined>(undefined);

  // ---------- Permisos y acciones disponibles ----------
  readonly canUpdate = computed(() => this.auth.can('purchase_orders.update'));
  readonly canApprove = computed(() => this.auth.can('purchase_orders.approve'));
  readonly canIssue = computed(() => this.auth.can('purchase_orders.issue'));
  readonly canDelete = computed(() => this.auth.can('purchase_orders.delete'));

  private readonly status = computed(() => this.order()?.status ?? null);

  readonly showEdit = computed(() => !!this.order()?.is_editable && this.canUpdate());
  readonly showSubmit = computed(() => !!this.order()?.is_editable && this.canUpdate());
  readonly showDecide = computed(() => this.status() === 'pendiente_aprobacion' && this.canApprove());
  readonly showReopen = computed(() => this.status() === 'aprobada' && this.canUpdate());
  readonly showIssue = computed(() => this.status() === 'aprobada' && this.canIssue());
  readonly showPdf = computed(() => !!this.status() && PDF_STATUSES.includes(this.status()!));
  readonly showClose = computed(() => !!this.status() && CLOSE_STATUSES.includes(this.status()!) && this.canUpdate());
  readonly showCancel = computed(() => !!this.status() && CANCEL_STATUSES.includes(this.status()!) && this.canDelete());

  readonly isTerminalFailure = computed(() => this.status() === 'anulada' || this.status() === 'rechazada');

  /** Recepción de mercancía (fase 2): la orden admite recepción y el usuario puede crearla. */
  readonly showReceive = computed(() => !!this.order()?.can_receive && this.auth.can('goods_receipts.create'));
  readonly receipts = computed(() => this.order()?.receipts ?? []);

  /** Pasos del stepper con su estado (hecho / actual / pendiente). */
  readonly steps = computed<Step[]>(() => {
    const o = this.order();
    const s = o?.status ?? null;
    const idx = s ? FLOW.findIndex((f) => f.key === s) : -1;
    const pct = Number(o?.received_pct ?? 0);
    return FLOW.map<Step>((f, i) => {
      let state: Step['state'] = idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo';
      // Una orden cerrada sin recepciones (o sin completarlas) no pasó por esos pasos.
      if (state === 'done' && f.key === 'recibida_parcial' && pct <= 0) state = 'skipped';
      if (state === 'done' && f.key === 'recibida' && pct < 100) state = 'skipped';
      return { key: f.key, label: f.label, state };
    });
  });

  readonly items = computed<PurchaseOrderItem[]>(() => this.order()?.items ?? []);

  /** Solicitudes de origen (distintas) referenciadas por los ítems. */
  readonly sourceRequests = computed(() => {
    const seen = new Map<number, string>();
    for (const it of this.items()) {
      if (it.request && !seen.has(it.request.id)) seen.set(it.request.id, it.request.number ?? `#${it.request.id}`);
    }
    return [...seen.entries()].map(([id, number]) => ({ id, number }));
  });

  /** Última decisión registrada (aprobada / rechazada). */
  readonly lastDecision = computed<Approval | null>(() => {
    const decided = (this.order()?.approvals ?? []).filter((a) => a.status !== 'pendiente' && a.decided_at);
    if (!decided.length) return null;
    return decided.reduce((a, b) => (new Date(a.decided_at!) > new Date(b.decided_at!) ? a : b));
  });

  readonly paymentLabel = computed(() => {
    const o = this.order();
    if (!o) return '—';
    return o.payment_terms === 'credito' ? `Crédito ${o.payment_days} días` : 'Contado';
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const o = this.order();
    if (!o) return [];
    const events: TimelineEvent[] = [{ title: 'Creada', at: o.created_at, by: o.creator?.name, tone: 'draft' }];
    for (const a of o.approvals ?? []) {
      events.push({ title: 'Enviada a aprobación', at: a.created_at, by: a.requester?.name, tone: 'pending' });
      if (a.status === 'aprobada') {
        events.push({ title: 'Aprobada', at: a.decided_at, by: a.decider?.name, note: a.comment, tone: 'success' });
      } else if (a.status === 'rechazada') {
        const reopened = a.comment === 'Reabierta para edición';
        const cancelled = a.comment === 'Orden anulada';
        events.push({
          title: reopened ? 'Reabierta (vuelve a borrador)' : cancelled ? 'Aprobación cancelada' : 'Rechazada',
          at: a.decided_at,
          by: reopened || cancelled ? undefined : a.decider?.name,
          note: reopened || cancelled ? null : a.comment,
          tone: reopened ? 'draft' : 'danger',
        });
      }
    }
    if (o.issued_at) events.push({ title: 'Emitida al proveedor', at: o.issued_at, tone: 'pending' });
    if (o.status === 'anulada') events.push({ title: 'Anulada', at: o.updated_at, tone: 'danger' });
    if (o.status === 'cerrada') events.push({ title: 'Cerrada', at: o.updated_at, tone: 'info' });
    return events.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  load(id: number | null = this.order()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .order(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (o) => {
          this.order.set(o);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/ordenes']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const o = this.order();
    if (o) void this.router.navigate(['/compras/ordenes', o.id, 'editar']);
  }

  goReceive(): void {
    const o = this.order();
    if (o) void this.router.navigate(['/inventario/recepciones/nueva'], { queryParams: { order: o.id } });
  }

  submit(): void {
    this.ask('Enviar a aprobación', '¿Enviar esta orden a aprobación? No podrás editarla mientras esté pendiente.', 'Enviar', () =>
      this.run('submit', {}, 'Orden enviada a aprobación.'),
    );
  }

  openDecision(mode: 'approve' | 'reject'): void {
    this.decisionMode.set(mode);
    this.decisionText.set('');
    this.decisionSubmitted.set(false);
    this.decisionError.set(undefined);
    this.decisionOpen.set(true);
  }

  decide(): void {
    this.decisionSubmitted.set(true);
    const text = this.decisionText().trim();
    if (this.decisionMode() === 'reject' && !text) {
      this.decisionError.set('Indica el motivo del rechazo.');
      return;
    }
    this.decisionError.set(undefined);
    if (this.decisionMode() === 'approve') {
      this.run('approve', { comment: text || null }, 'Orden aprobada.', () => this.decisionOpen.set(false));
    } else {
      this.run('reject', { reason: text }, 'Orden rechazada.', () => this.decisionOpen.set(false));
    }
  }

  reopen(): void {
    this.ask(
      'Reabrir orden',
      'La orden volverá a borrador y se liberarán las cantidades comprometidas en las solicitudes. ¿Continuar?',
      'Reabrir',
      () => this.run('reopen', {}, 'Orden reabierta en borrador.'),
    );
  }

  issue(): void {
    this.ask('Emitir orden', '¿Marcar la orden como emitida al proveedor? A partir de aquí se podrán registrar recepciones.', 'Emitir', () =>
      this.run('issue', {}, 'Orden emitida.'),
    );
  }

  close(): void {
    this.ask('Cerrar orden', '¿Cerrar esta orden? No se registrarán más recepciones sobre ella.', 'Cerrar', () =>
      this.run('close', {}, 'Orden cerrada.'),
    );
  }

  cancel(): void {
    this.ask('Anular orden', '¿Anular esta orden? Esta acción no se puede deshacer.', 'Anular', () => this.run('cancel', {}, 'Orden anulada.'), true);
  }

  openPdf(): void {
    const o = this.order();
    if (!o || this.pdfLoading()) return;
    this.pdfLoading.set(true);
    this.api
      .orderPdf(o.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.pdfLoading.set(false);
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) {
            // Bloqueo de ventanas emergentes: se ofrece la descarga directa.
            const a = document.createElement('a');
            a.href = url;
            a.download = `${o.number}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => {
          this.pdfLoading.set(false);
          this.toast.warn('PDF no disponible', 'El PDF solo está disponible cuando la orden ha sido aprobada.');
        },
      });
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

  private run(action: OrderAction, body: Record<string, unknown>, successMsg: string, after?: () => void): void {
    const o = this.order();
    if (!o || this.acting()) return;
    this.acting.set(action);
    this.api
      .orderAction(o.id, action, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.order.set(fresh);
          this.toast.success(successMsg, fresh.number);
          after?.();
        },
        error: (err: unknown) => {
          this.acting.set(null);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as { message?: string; errors?: Record<string, string[]> };
            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
            if (action === 'reject' || action === 'approve') this.decisionError.set(first ?? body.message);
            else this.toast.warn('No se pudo completar la acción', first ?? body.message);
          }
        },
      });
  }

  // ---------- Presentación ----------

  receivedPct(it: PurchaseOrderItem): number {
    const total = Number(it.qty_base) || 0;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(it.qty_received_base) / total) * 100)));
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
  }

  statusTone = statusTone;

  /** Tono del chip de una recepción (borrador / confirmado / anulado). */
  receiptTone(status: string): 'draft' | 'success' | 'danger' {
    return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
  }
}
