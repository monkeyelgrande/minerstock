import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { InTransitShipment, shipmentTone } from '../../../core/models/logistics.model';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Mercancía en camino: planillas despachadas o recibidas parcialmente, agrupadas por planilla. */
@Component({
  selector: 'app-transit-page',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, RouterLink, ButtonModule, SelectModule,
    TooltipModule, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transit-page.component.html',
})
export class TransitPageComponent {
  private readonly api = inject(LogisticsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly shipments = signal<InTransitShipment[]>([]);
  readonly loading = signal(false);
  readonly warehouseId = signal<number | null>(null);

  readonly canReceive = computed(() => this.auth.can('shipment_receipts.create'));

  readonly totalValue = computed(() => this.shipments().reduce((sum, s) => sum + Number(s.pending_value), 0));
  readonly maxDays = computed(() => this.shipments().reduce((max, s) => Math.max(max, s.days_in_transit ?? 0), 0));

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
      .inTransit(this.warehouseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.shipments.set(list);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  goReceive(s: InTransitShipment): void {
    void this.router.navigate(['/logistica/recepcion/nueva'], { queryParams: { shipment: s.id } });
  }

  shipmentTone = shipmentTone;
}
