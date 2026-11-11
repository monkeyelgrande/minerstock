import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { ReportsApi } from '../../core/api/reports-api.service';
import { ReportDef } from '../../core/models/reports.model';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

/** Icono (Material Symbols) por reporte; fallback genérico para claves nuevas. */
const ICONS: Record<string, string> = {
  kardex: 'receipt_long',
  inventario: 'layers',
  consumo: 'exit_to_app',
  compras: 'shopping_cart',
  precios: 'trending_up',
  novedades: 'report_problem',
  'prestamos-vencidos': 'handshake',
  cartera: 'account_balance_wallet',
  'solicitudes-pendientes': 'assignment_late',
};

/** Catálogo de reportes: una tarjeta por consulta disponible. */
@Component({
  selector: 'app-reports-home',
  imports: [RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-home.component.html',
})
export class ReportsHomeComponent {
  private readonly api = inject(ReportsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly reports = signal<ReportDef[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.api
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          this.reports.set(c.reports);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  icon(key: string): string {
    return ICONS[key] ?? 'description';
  }
}
