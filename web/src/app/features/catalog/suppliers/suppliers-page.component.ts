import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-suppliers-page',
  imports: [
    ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule,
    TextareaModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suppliers-page.component.html',
})
export class SuppliersPageComponent extends MasterPageBase<Supplier> {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  protected readonly api = inject(CatalogApi).suppliers;
  protected readonly entityName = 'el proveedor';

  readonly documentTypes = [
    { label: 'NIT', value: 'NIT' },
    { label: 'Cédula', value: 'CC' },
    { label: 'Cédula extranjería', value: 'CE' },
    { label: 'Pasaporte', value: 'PA' },
  ];

  protected buildForm(): FormGroup {
    return this.fb.group({
      document_type: ['NIT', Validators.required],
      document_number: ['', [Validators.required, Validators.maxLength(30)]],
      name: ['', [Validators.required, Validators.maxLength(160)]],
      contact_name: [''],
      phone: [''],
      email: ['', Validators.email],
      address: [''],
      city: [''],
      payment_terms_days: [0, [Validators.min(0), Validators.max(365)]],
      notes: [''],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { document_type: 'NIT', payment_terms_days: 0, is_active: true };
  }

  paymentLabel(days: number): string {
    return days > 0 ? `Crédito ${days} días` : 'Contado';
  }
}
