import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { ConsumptionApi } from '../../../core/api/consumption-api.service';
import { RecipientHolding } from '../../../core/models/consumption.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';

/** Herramientas por persona: qué tiene cada receptor en su poder, con sus préstamos abiertos. */
@Component({
  selector: 'app-holdings-page',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, RouterLink, SelectModule, TooltipModule,
    PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './holdings-page.component.html',
})
export class HoldingsPageComponent {
  private readonly api = inject(ConsumptionApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly ctx = inject(WarehouseContext);

  readonly holdings = signal<RecipientHolding[]>([]);
  readonly loading = signal(false);
  readonly warehouseId = signal<number | null>(null);

  readonly totalQty = computed(() => this.holdings().reduce((s, h) => s + Number(h.total_qty), 0));
  readonly totalValue = computed(() => this.holdings().reduce((s, h) => s + Number(h.total_value), 0));

  constructor() {
    this.load();
  }

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .holdings(this.warehouseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.holdings.set(list);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
