import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SupplierInvoice, payableTone } from '../../../core/models/payables.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

/** Detalle de factura de proveedor: valores, recepciones, pagos y notas crédito aplicadas, datos y adjuntos. */
@Component({
  selector: 'app-invoice-detail',
  imports: [
    CurrencyPipe, DatePipe, RouterLink, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoice-detail.component.html',
})
export class InvoiceDetailComponent {
  private readonly api = inject(PayablesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly invoice = signal<SupplierInvoice | null>(null);
  readonly loading = signal(false);
  readonly cancelling = signal(false);

  readonly attachType = 'supplier_invoice' as AttachableType;

  // ---------- Permisos y acciones disponibles ----------
  readonly canUpdate = computed(() => this.auth.can('supplier_invoices.update'));
  readonly canDelete = computed(() => this.auth.can('supplier_invoices.delete'));
  readonly canPay = computed(() => this.auth.can('supplier_payments.create'));

  readonly isOpen = computed(() => {
    const s = this.invoice()?.status;
    return s === 'pendiente' || s === 'parcial';
  });

  readonly showEdit = computed(() => !!this.invoice()?.is_editable && this.canUpdate());
  readonly showPay = computed(() => this.isOpen() && this.canPay());
  readonly showCancel = computed(() => !!this.invoice()?.is_editable && this.canDelete());

  readonly receipts = computed(() => this.invoice()?.receipts ?? []);
  readonly payments = computed(() => this.invoice()?.payments ?? []);
  readonly creditApplications = computed(() => this.invoice()?.credit_applications ?? []);

  /** Días de diferencia contra el vencimiento (negativo = vencida hace N días). */
  readonly dueInDays = computed<number | null>(() => {
    const inv = this.invoice();
    if (!inv?.due_date) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(inv.due_date);
    if (!m) return null;
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86_400_000);
  });

  readonly dueLabel = computed(() => {
    const days = this.dueInDays();
    if (days === null) return '—';
    if (this.invoice()?.status === 'pagada' || this.invoice()?.status === 'anulada') return '—';
    if (days > 0) return `Vence en ${days} día${days === 1 ? '' : 's'}`;
    if (days === 0) return 'Vence hoy';
    return `Vencida hace ${-days} día${days === -1 ? '' : 's'}`;
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    const events: TimelineEvent[] = [{ title: 'Registrada', at: inv.created_at, by: inv.creator?.name, tone: 'draft' }];
    if (inv.status === 'anulada') events.push({ title: 'Anulada', at: inv.updated_at, tone: 'danger' });
    return events;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  load(id: number | null = this.invoice()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .invoice(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => {
          this.invoice.set(inv);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/pagos/facturas']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const inv = this.invoice();
    if (inv) void this.router.navigate(['/pagos/facturas', inv.id, 'editar']);
  }

  goPay(): void {
    const inv = this.invoice();
    if (inv) void this.router.navigate(['/pagos/pagos/nuevo'], { queryParams: { supplier_id: inv.supplier_id, invoice: inv.id } });
  }

  cancelInvoice(): void {
    const inv = this.invoice();
    if (!inv || this.cancelling()) return;
    this.confirm.confirm({
      header: 'Anular factura',
      message: `¿Anular ${inv.number}? Sus recepciones quedarán de nuevo disponibles para facturar. Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.cancelling.set(true);
        this.api
          .cancelInvoice(inv.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.cancelling.set(false);
              this.invoice.set(fresh);
              this.toast.success('Factura anulada.', fresh.number);
            },
            error: (err: unknown) => {
              this.cancelling.set(false);
              if (err instanceof HttpErrorResponse) {
                const body = err.error as { message?: string; errors?: Record<string, string[]> };
                const first = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                this.toast.warn('No se pudo anular', first ?? body?.message);
              }
            },
          });
      },
    });
  }

  // ---------- Presentación ----------

  methodLabel(method: string | undefined): string {
    return method ? (METHOD_LABELS[method] ?? method) : '—';
  }

  payableTone = payableTone;
}
