import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CostCenter, Site } from '../../../core/models/catalog.model';
import { ListParams } from '../../../core/models/common.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-cost-centers-page',
  imports: [
    ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule, SelectModule,
    ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cost-centers-page.component.html',
})
export class CostCentersPageComponent extends MasterPageBase<CostCenter> {
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(CatalogApi);
  readonly auth = inject(AuthService);
  protected readonly api = this.catalog.costCenters;
  protected readonly entityName = 'el centro de costo';

  /** Sedes activas para el selector del formulario y el filtro del listado. */
  readonly sites = signal<Site[]>([]);
  /** Filtro extra del listado por sede. */
  readonly siteFilter = signal<number | null>(null);

  constructor() {
    super();
    this.catalog.sites
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sites) => this.sites.set(sites));
  }

  protected buildForm(): FormGroup {
    return this.fb.group({
      code: ['', [Validators.required, Validators.maxLength(20)]],
      name: ['', [Validators.required, Validators.maxLength(160)]],
      site_id: [null],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { site_id: null, is_active: true };
  }

  protected override toPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    return { ...raw, code: String(raw['code'] ?? '').trim().toUpperCase() };
  }

  protected override extraParams(): ListParams {
    return { site_id: this.siteFilter() ?? undefined };
  }

  protected override rowLabel(row: CostCenter): string {
    return `${row.code} – ${row.name}`;
  }

  onSiteFilterChange(value: number | null): void {
    this.siteFilter.set(value);
    this.page.set(1);
    this.load();
  }
}
