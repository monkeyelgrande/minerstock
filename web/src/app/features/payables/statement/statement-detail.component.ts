import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';

import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { StatementDetail, payableTone } from '../../../core/models/payables.model';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Estado de cuenta de un proveedor: KPIs y pestañas de facturas, pagos y notas crédito. */
@Component({
  selector: 'app-statement-detail',
  imports: [
    CurrencyPipe, DatePipe, RouterLink, ButtonModule, TabsModule,
    PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './statement-detail.component.html',
})
export class StatementDetailComponent {
  private readonly api = inject(PayablesApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly supplierId = input<string>();

  readonly data = signal<StatementDetail | null>(null);
  readonly loading = signal(false);
  readonly tab = signal('facturas');

  readonly canCreateInvoice = computed(() => this.auth.can('supplier_invoices.create'));
  readonly canCreatePayment = computed(() => this.auth.can('supplier_payments.create'));

  readonly subtitle = computed(() => {
    const s = this.data()?.supplier;
    if (!s) return '';
    const parts = [`NIT ${s.document_number}`];
    if (s.contact_name) parts.push(s.contact_name);
    if (s.phone) parts.push(s.phone);
    if (s.email) parts.push(s.email);
    return parts.join(' · ');
  });

  readonly terms = computed(() => {
    const days = this.data()?.supplier.payment_terms_days ?? 0;
    return days > 0 ? `Crédito ${days} días` : 'Contado';
  });

  constructor() {
    effect(() => {
      const id = this.supplierId();
      untracked(() => this.load(id ? +id : null));
    });
  }

  private load(id: number | null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .supplierStatement(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/pagos/estado-cuenta']);
        },
      });
  }

  onTabChange(value: string | number | undefined): void {
    if (value !== undefined) this.tab.set(String(value));
  }

  goNewInvoice(): void {
    const s = this.data()?.supplier;
    if (s) void this.router.navigate(['/pagos/facturas/nueva'], { queryParams: { supplier_id: s.id } });
  }

  goNewPayment(): void {
    const s = this.data()?.supplier;
    if (s) void this.router.navigate(['/pagos/pagos/nuevo'], { queryParams: { supplier_id: s.id } });
  }

  /** Números de facturas abonadas por un pago (chips). */
  paymentInvoices(p: StatementDetail['payments'][number]): string[] {
    return (p.invoices ?? []).map((i) => i.number).filter((n): n is string => !!n);
  }

  payableTone = payableTone;
}
