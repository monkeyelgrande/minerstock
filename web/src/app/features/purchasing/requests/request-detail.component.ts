import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PRIORITY_LABELS, PurchaseRequest, PurchaseRequestItem, priorityTone, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type Decision = 'approve' | 'reject';

/** Detalle de una solicitud de compra: datos, ítems con avance, línea de tiempo y adjuntos. */
@Component({
  selector: 'app-request-detail',
  imports: [
    DatePipe, DecimalPipe, FormsModule, ButtonModule, DialogModule, TextareaModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail.component.html',
})
export class RequestDetailComponent {
  private readonly api = inject(PurchasingApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  /** Id de ruta (`solicitudes/:id`). */
  readonly id = input<string>();

  readonly doc = signal<PurchaseRequest | null>(null);
  readonly loading = signal(false);
  readonly acting = signal(false);

  // Diálogo de decisión (aprobar / rechazar)
  readonly decisionOpen = signal(false);
  readonly decisionMode = signal<Decision>('approve');
  readonly decisionText = signal('');
  readonly decisionTried = signal(false);

  readonly canUpdate = computed(() => this.auth.can('purchase_requests.update'));
  readonly canApprove = computed(() => this.auth.can('purchase_requests.approve'));
  readonly canDelete = computed(() => this.auth.can('purchase_requests.delete'));

  readonly showEdit = computed(() => !!this.doc()?.is_editable && this.canUpdate());
  readonly showSubmit = computed(() => !!this.doc()?.is_editable && this.canUpdate());
  readonly showDecide = computed(() => this.doc()?.status === 'enviada' && this.canApprove());
  readonly showClose = computed(() => {
    const s = this.doc()?.status;
    return (s === 'aprobada' || s === 'en_proceso' || s === 'atendida') && this.canUpdate();
  });
  readonly showCancel = computed(() => {
    const s = this.doc()?.status;
    return (s === 'borrador' || s === 'enviada' || s === 'rechazada' || s === 'aprobada') && this.canDelete();
  });

  readonly items = computed<PurchaseRequestItem[]>(() => this.doc()?.items ?? []);
  readonly totals = computed(() => {
    const items = this.items();
    const base = items.reduce((s, i) => s + Number(i.qty_base), 0);
    const ordered = items.reduce((s, i) => s + Number(i.qty_ordered_base), 0);
    const shipped = items.reduce((s, i) => s + Number(i.qty_shipped_base), 0);
    return { base, ordered, shipped, pending: Math.max(0, base - ordered) };
  });

  /** Línea de tiempo del documento a partir de fechas, aprobaciones y estado. */
  readonly timeline = computed<TimelineEvent[]>(() => {
    const d = this.doc();
    if (!d) return [];
    const events: TimelineEvent[] = [{ title: 'Creada', at: d.created_at, by: d.creator?.name ?? d.requester?.name, tone: 'draft' }];
    if (d.submitted_at) {
      events.push({ title: 'Enviada a aprobación', at: d.submitted_at, by: d.requester?.name, tone: 'pending' });
    }
    // El API devuelve las aprobaciones de la más reciente a la más antigua; la línea de tiempo va en orden cronológico.
    const approvals = [...(d.approvals ?? [])].sort((a, b) => (a.decided_at ?? a.created_at).localeCompare(b.decided_at ?? b.created_at));
    for (const a of approvals) {
      if (a.status === 'aprobada') {
        events.push({ title: 'Aprobada', at: a.decided_at, by: a.decider?.name, note: a.comment, tone: 'success' });
      } else if (a.status === 'rechazada') {
        // La anulación cierra la aprobación pendiente con el comentario "Solicitud anulada"; se muestra como Anulada abajo.
        if (d.status === 'anulada' && a.comment === 'Solicitud anulada') continue;
        events.push({ title: 'Rechazada', at: a.decided_at, by: a.decider?.name, note: a.comment, tone: 'danger' });
      }
    }
    if (d.status === 'en_proceso') {
      events.push({ title: 'En proceso (con órdenes de compra)', at: d.updated_at, tone: 'partial' });
    }
    if (d.status === 'atendida') {
      events.push({ title: 'Atendida', at: d.updated_at, tone: 'success' });
    }
    if (d.status === 'cerrada') {
      events.push({ title: 'Cerrada', at: d.updated_at, tone: 'info' });
    }
    if (d.status === 'anulada') {
      events.push({ title: 'Anulada', at: d.updated_at, tone: 'danger' });
    }
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
      .request(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.doc.set(d);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/solicitudes']);
        },
      });
  }

  // ---------- Navegación ----------

  goEdit(): void {
    const d = this.doc();
    if (d) void this.router.navigate(['/compras/solicitudes', d.id, 'editar']);
  }

  goList(): void {
    void this.router.navigate(['/compras/solicitudes']);
  }

  // ---------- Acciones ----------

  submit(): void {
    const d = this.doc();
    if (!d) return;
    this.confirm.confirm({
      header: 'Enviar a aprobación',
      message: `¿Enviar la solicitud ${d.number} a aprobación? No podrás editarla mientras esté pendiente.`,
      icon: 'pi pi-send',
      acceptLabel: 'Enviar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.run('submit', {}, 'Solicitud enviada a aprobación.'),
    });
  }

  openDecision(mode: Decision): void {
    this.decisionMode.set(mode);
    this.decisionText.set('');
    this.decisionTried.set(false);
    this.decisionOpen.set(true);
  }

  confirmDecision(): void {
    const d = this.doc();
    if (!d) return;
    this.decisionTried.set(true);
    const text = this.decisionText().trim();
    if (this.decisionMode() === 'reject') {
      if (!text) return;
      this.run('reject', { reason: text }, 'Solicitud rechazada.', () => this.decisionOpen.set(false));
    } else {
      this.run('approve', { comment: text || null }, 'Solicitud aprobada.', () => this.decisionOpen.set(false));
    }
  }

  close(): void {
    const d = this.doc();
    if (!d) return;
    this.confirm.confirm({
      header: 'Cerrar solicitud',
      message: `¿Cerrar la solicitud ${d.number}? Los ítems pendientes ya no podrán ordenarse.`,
      icon: 'pi pi-lock',
      acceptLabel: 'Cerrar solicitud',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.run('close', {}, 'Solicitud cerrada.'),
    });
  }

  cancelRequest(): void {
    const d = this.doc();
    if (!d) return;
    this.confirm.confirm({
      header: 'Anular solicitud',
      message: `¿Anular la solicitud ${d.number}? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.run('cancel', {}, 'Solicitud anulada.'),
    });
  }

  private run(
    action: 'submit' | 'approve' | 'reject' | 'cancel' | 'close',
    body: Record<string, unknown>,
    okMessage: string,
    after?: () => void,
  ): void {
    const d = this.doc();
    if (!d || this.acting()) return;
    this.acting.set(true);
    this.api
      .requestAction(d.id, action, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.doc.set(updated);
          this.toast.success(okMessage, updated.number);
          after?.();
        },
        error: (err: unknown) => {
          this.acting.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as { message?: string; errors?: Record<string, string[]> };
            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
            this.toast.error('No se pudo completar la acción', first ?? body.message);
          }
        },
      });
  }

  // ---------- Utilidades de vista ----------

  progressOf(item: PurchaseRequestItem): { ordered: number; shipped: number } {
    const base = Number(item.qty_base);
    if (base <= 0) return { ordered: 0, shipped: 0 };
    return {
      ordered: Math.min(100, Math.round((Number(item.qty_ordered_base) / base) * 100)),
      shipped: Math.min(100, Math.round((Number(item.qty_shipped_base) / base) * 100)),
    };
  }

  priorityLabel(p: PurchaseRequest['priority']): string {
    return PRIORITY_LABELS[p] ?? p;
  }

  statusTone = statusTone;
  priorityTone = priorityTone;
}
