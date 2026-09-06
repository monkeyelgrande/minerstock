import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Vehicle, VehicleOwnership } from '../../../core/models/catalog.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-vehicles-page',
  imports: [
    DecimalPipe, ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule,
    ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vehicles-page.component.html',
})
export class VehiclesPageComponent extends MasterPageBase<Vehicle> {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  protected readonly api = inject(CatalogApi).vehicles;
  protected readonly entityName = 'el vehículo';

  readonly vehicleTypes = ['Camión', 'Camioneta', 'Turbo', 'Volqueta', 'Moto', 'Otro'].map((t) => ({ label: t, value: t }));

  readonly ownershipOptions: { label: string; value: VehicleOwnership }[] = [
    { label: 'Propio', value: 'propio' },
    { label: 'Tercero', value: 'tercero' },
  ];

  protected buildForm(): FormGroup {
    return this.fb.group({
      plate: ['', [Validators.required, Validators.maxLength(15)]],
      type: ['', Validators.required],
      brand: [''],
      capacity_kg: [null, Validators.min(0)],
      ownership: ['propio', Validators.required],
      owner_name: [''],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { ownership: 'propio', capacity_kg: null, is_active: true };
  }

  protected override toPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    return { ...raw, plate: String(raw['plate'] ?? '').trim().toUpperCase() };
  }

  protected override rowLabel(row: Vehicle): string {
    return row.plate;
  }

  ownershipLabel(value: VehicleOwnership): string {
    return this.ownershipOptions.find((o) => o.value === value)?.label ?? value;
  }
}
