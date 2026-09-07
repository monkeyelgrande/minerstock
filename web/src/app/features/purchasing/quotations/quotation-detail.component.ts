import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Quotation, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Detalle de una cotización: datos, ítems con precio por unidad base, adjuntos y acciones de estado. */
@Component({
  selector: 'app-quotation-detail',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, RouterLink, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quotation-detail.component.html',
})
export class QuotationDetailComponent {
  private readonly api = inject(PurchasingApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly quotation = signal<Quotation | null>(null);
  readonly loading = signal(false);
  readonly acting = signal(false);

  readonly canUpdate = computed(() => this.auth.can('quotations.update'));
  readonly canDelete = computed(() => this.auth.can('quotations.delete'));
  readonly canEdit = computed(() => !!this.quotation()?.is_editable && this.canUpdate());
  readonly canReceive = computed(() => this.quotation()?.status === 'borrador' && this.canUpdate());
  readonly canDiscard = computed(() => {
    const s = this.quotation()?.status;
    return (s === 'borrador' || s === 'recibida') && this.canUpdate();
  });
  readonly canRemove = computed(() => this.quotation()?.status === 'borrador' && this.canDelete());
  readonly canCompare = computed(() => {
    const s = this.quotation()?.status;
    return s === 'recibida' || s === 'seleccionada';
  });

  readonly items = computed(() => this.quotation()?.items ?? []);
  readonly selectedCount = computed(() => this.items().filter((i) => i.is_selected || i.purchase_order_item_id).length);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  load(id: number | null): void {
    if (!id) {
      void this.router.navigate(['/compras/cotizaciones']);
      return;
    }
    this.loading.set(true);
    this.api
      .quotation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          this.quotation.set(q);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/cotizaciones']);
        },
      });
  }

  reload(): void {
    const q = this.quotation();
    if (q) this.load(q.id);
  }

  goEdit(): void {
    const q = this.quotation();
    if (q) void this.router.navigate(['/compras/cotizaciones', q.id, 'editar']);
  }

  goComparison(): void {
    const q = this.quotation();
    if (q) void this.router.navigate(['/compras/comparativa'], { queryParams: { supplier_id: q.supplier_id } });
  }

  receive(): void {
    const q = this.quotation();
    if (!q) return;
    this.runAction(q, 'receive', 'Cotización marcada como recibida.');
  }

  discard(): void {
    const q = this.quotation();
    if (!q) return;
    this.confirm.confirm({
      header: 'Descartar cotización',
      message: `¿Descartar la cotización ${q.number}? Sus ítems dejarán de aparecer en la comparativa.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Descartar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.runAction(q, 'discard', 'Cotización descartada.'),
    });
  }

  remove(): void {
    const q = this.quotation();
    if (!q) return;
    this.confirm.confirm({
      header: 'Eliminar cotización',
      message: `¿Eliminar la cotización ${q.number}? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.acting.set(true);
        this.api
          .deleteQuotation(q.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.acting.set(false);
              this.toast.success('Cotización eliminada.', q.number);
              void this.router.navigate(['/compras/cotizaciones']);
            },
            error: (err: unknown) => {
              this.acting.set(false);
              this.toastDomainError('No se pudo eliminar', err);
            },
          });
      },
    });
  }

  private runAction(q: Quotation, action: 'receive' | 'discard', okMessage: string): void {
    this.acting.set(true);
    this.api
      .quotationAction(q.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.quotation.set(updated);
          this.toast.success(okMessage, updated.number);
        },
        error: (err: unknown) => {
          this.acting.set(false);
          this.toastDomainError('No se pudo cambiar el estado', err);
        },
      });
  }

  /** Errores de regla de negocio (422 con solo `message`): el interceptor no los muestra. */
  private toastDomainError(summary: string, err: unknown): void {
    const e = err as { status?: number; error?: { message?: string; errors?: unknown } };
    if (e?.status === 422 && !e.error?.errors) this.toast.error(summary, e.error?.message);
  }

  statusTone = statusTone;
}
