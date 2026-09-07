import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';

import { PayablesApi } from '../../../core/api/payables-api.service';
import { StatementSummaryRow } from '../../../core/models/payables.model';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';

/** Estado de cuenta con proveedores: KPIs de cartera y resumen de saldos por proveedor. */
@Component({
  selector: 'app-statement-page',
  imports: [CurrencyPipe, FormsModule, TableModule, ButtonModule, InputTextModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './statement-page.component.html',
})
export class StatementPageComponent {
  private readonly api = inject(PayablesApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly rows = signal<StatementSummaryRow[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');

  /** Filtro en cliente por nombre o NIT (el resumen llega completo y ordenado por saldo). */
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter(
      (r) => r.supplier.name.toLowerCase().includes(q) || r.supplier.document_number.toLowerCase().includes(q),
    );
  });

  readonly totalBalance = computed(() => this.rows().reduce((s, r) => s + Number(r.balance), 0));
  readonly totalOverdue = computed(() => this.rows().reduce((s, r) => s + Number(r.overdue_balance), 0));
  readonly suppliersWithBalance = computed(() => this.rows().filter((r) => Number(r.balance) > 0).length);
  readonly totalCredit = computed(() => this.rows().reduce((s, r) => s + Number(r.available_credit), 0));

  constructor() {
    this.loading.set(true);
    this.api
      .statement()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  terms(row: StatementSummaryRow): string {
    const days = row.supplier.payment_terms_days;
    return days > 0 ? `Crédito ${days} días` : 'Contado';
  }

  goDetail(row: StatementSummaryRow): void {
    void this.router.navigate(['/pagos/estado-cuenta', row.supplier.id]);
  }
}
