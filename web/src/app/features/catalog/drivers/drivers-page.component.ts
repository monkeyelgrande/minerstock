import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Driver } from '../../../core/models/catalog.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

/** Estado de vigencia de la licencia. */
export type LicenseStatus = 'expired' | 'soon' | 'ok' | null;

@Component({
  selector: 'app-drivers-page',
  imports: [
    ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, SelectModule, DatePickerModule,
    ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drivers-page.component.html',
})
export class DriversPageComponent extends MasterPageBase<Driver> {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  protected readonly api = inject(CatalogApi).drivers;
  protected readonly entityName = 'el chofer';

  readonly licenseCategories = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'].map((c) => ({ label: c, value: c }));

  protected buildForm(): FormGroup {
    return this.fb.group({
      document_number: ['', [Validators.required, Validators.maxLength(30)]],
      name: ['', [Validators.required, Validators.maxLength(160)]],
      phone: [''],
      license_number: [''],
      license_category: [null],
      license_expires_at: [null as Date | null],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { license_category: null, license_expires_at: null, is_active: true };
  }

  /** La API entrega la fecha como cadena; el datepicker trabaja con Date. */
  protected override patchForm(row: Driver): void {
    this.form.reset();
    this.form.patchValue({ ...row, license_expires_at: this.parseDate(row.license_expires_at) });
  }

  /** Convierte la fecha del datepicker a 'YYYY-MM-DD' (sin zona horaria). */
  protected override toPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const date = raw['license_expires_at'];
    return { ...raw, license_expires_at: date instanceof Date ? this.toIsoDate(date) : null };
  }

  /** Fecha formateada dd/MM/yyyy para la tabla. */
  formatDate(value: string | null): string {
    const d = this.parseDate(value);
    if (!d) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  /** Vencida, por vencer (≤ 30 días) o vigente. */
  licenseStatus(value: string | null): LicenseStatus {
    const d = this.parseDate(value);
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'soon';
    return 'ok';
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private toIsoDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
