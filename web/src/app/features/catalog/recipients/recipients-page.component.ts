import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { CostCenter, Recipient, RecipientType, Site } from '../../../core/models/catalog.model';
import { ListParams } from '../../../core/models/common.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-recipients-page',
  imports: [
    ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule, SelectModule,
    ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recipients-page.component.html',
})
export class RecipientsPageComponent extends MasterPageBase<Recipient> {
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(CatalogApi);
  readonly auth = inject(AuthService);
  protected readonly api = this.catalog.recipients;
  protected readonly entityName = 'el receptor';

  readonly recipientTypes: { label: string; value: RecipientType }[] = [
    { label: 'Persona', value: 'persona' },
    { label: 'Área', value: 'area' },
  ];
  readonly typeFilterOptions: { label: string; value: '' | RecipientType }[] = [
    { label: 'Todos', value: '' },
    ...this.recipientTypes,
  ];

  /** Filtro extra del listado por tipo de receptor. */
  readonly typeFilter = signal<'' | RecipientType>('');

  readonly sites = signal<Site[]>([]);
  readonly costCenters = signal<CostCenter[]>([]);
  /** Centros de costo con etiqueta "CÓDIGO – Nombre" para el selector. */
  readonly costCenterOptions = computed(() =>
    this.costCenters().map((cc) => ({ label: `${cc.code} – ${cc.name}`, value: cc.id })),
  );

  constructor() {
    super();
    this.catalog.sites
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sites) => this.sites.set(sites));
    this.catalog.costCenters
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.costCenters.set(list));
  }

  protected buildForm(): FormGroup {
    return this.fb.group({
      type: ['persona', Validators.required],
      name: ['', [Validators.required, Validators.maxLength(160)]],
      document_number: [''],
      phone: [''],
      cost_center_id: [null],
      site_id: [null],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { type: 'persona', cost_center_id: null, site_id: null, is_active: true };
  }

  protected override extraParams(): ListParams {
    return { type: this.typeFilter() || undefined };
  }

  onTypeFilterChange(value: '' | RecipientType): void {
    this.typeFilter.set(value);
    this.page.set(1);
    this.load();
  }

  typeLabel(type: RecipientType): string {
    return this.recipientTypes.find((t) => t.value === type)?.label ?? type;
  }
}
