import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Unit } from '../../../core/models/catalog.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-units-page',
  imports: [
    ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './units-page.component.html',
})
export class UnitsPageComponent extends MasterPageBase<Unit> {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  protected readonly api = inject(CatalogApi).units;
  protected readonly entityName = 'la unidad';
  protected override readonly gender: 'm' | 'f' = 'f';

  protected buildForm(): FormGroup {
    return this.fb.group({
      code: ['', [Validators.required, Validators.maxLength(10), Validators.pattern(/^[A-Za-z0-9]+$/)]],
      name: ['', [Validators.required, Validators.maxLength(80)]],
      allows_decimals: [false],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { allows_decimals: false, is_active: true };
  }

  protected override toPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    return { ...raw, code: String(raw['code'] ?? '').trim().toUpperCase() };
  }

  /** Nombre visible en mensajes: "KG – Kilogramo". */
  protected override rowLabel(row: Unit): string {
    return `${row.code} – ${row.name}`;
  }
}
