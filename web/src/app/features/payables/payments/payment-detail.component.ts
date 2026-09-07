import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PaymentAllocation, SupplierPayment, payableTone } from '../../../core/models/payables.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

/** Detalle de un pago a proveedor: facturas abonadas, datos, línea de tiempo y adjuntos. */
@Component({
  selector: 'app-payment-detail',
  imports: [
    CurrencyPipe, DatePipe, RouterLink, ButtonModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-detail.component.html',
})
export class PaymentDetailComponent {
  private readonly api = inject(PayablesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly doc = signal<SupplierPayment | null>(null);
  readonly loading = signal(false);
  readonly cancelling = signal(false);

  readonly canDelete = computed(() => this.auth.can('supplier_payments.delete'));
  readonly canAttach = computed(() => this.auth.can('supplier_payments.create'));
  readonly showCancel = computed(() => this.doc()?.status === 'confirmado' && this.canDelete());

  readonly allocations = computed<PaymentAllocation[]>(() => this.doc()?.allocations ?? []);
  readonly totalAllocated = computed(() => this.allocations().reduce((sum, a) => sum + Number(a.amount ?? 0), 0));

  readonly timeline = computed<TimelineEvent[]>(() => {
    const d = this.doc();
    if (!d) return [];
    const events: TimelineEvent[] = [{ title: 'Registrado', at: d.created_at, by: d.creator?.name, tone: 'success' }];
    if (d.status === 'anulado') events.push({ title: 'Anulado · abonos revertidos', at: null, tone: 'danger' });
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
      .payment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.doc.set(d);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/pagos/pagos']);
        },
      });
  }

  cancelPayment(): void {
    const d = this.doc();
    if (!d || this.cancelling()) return;
    this.confirm.confirm({
      header: 'Anular pago',
      message: `¿Anular el pago ${d.number}? Anular revierte los abonos en las facturas y no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.cancelling.set(true);
        this.api
          .cancelPayment(d.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.cancelling.set(false);
              this.doc.set(fresh);
              this.toast.success('Pago anulado.', `${fresh.number} · abonos revertidos en las facturas.`);
            },
            error: (err: unknown) => {
              this.cancelling.set(false);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string; errors?: Record<string, string[]> };
                const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                this.toast.warn('No se pudo anular', first ?? body.message);
              }
            },
          });
      },
    });
  }

  payableTone = payableTone;
}
