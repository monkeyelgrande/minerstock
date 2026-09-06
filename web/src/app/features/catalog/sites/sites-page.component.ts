import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Site, SiteType } from '../../../core/models/catalog.model';
import { ListParams } from '../../../core/models/common.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-sites-page',
  imports: [
    ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule, SelectModule,
    ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sites-page.component.html',
})
export class SitesPageComponent extends MasterPageBase<Site> {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  protected readonly api = inject(CatalogApi).sites;
  protected readonly entityName = 'la sede';
  protected override readonly gender: 'm' | 'f' = 'f';

  readonly siteTypes: { label: string; value: SiteType }[] = [
    { label: 'Municipio', value: 'municipio' },
    { label: 'Mina', value: 'mina' },
  ];
  readonly typeFilterOptions: { label: string; value: '' | SiteType }[] = [
    { label: 'Todas', value: '' },
    ...this.siteTypes,
  ];

  /** Filtro extra del listado por tipo de sede. */
  readonly typeFilter = signal<'' | SiteType>('');

  protected buildForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(160)]],
      type: ['municipio', Validators.required],
      address: [''],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { type: 'municipio', is_active: true };
  }

  protected override extraParams(): ListParams {
    return { type: this.typeFilter() || undefined };
  }

  onTypeFilterChange(value: '' | SiteType): void {
    this.typeFilter.set(value);
    this.page.set(1);
    this.load();
  }

  typeLabel(type: SiteType): string {
    return this.siteTypes.find((t) => t.value === type)?.label ?? type;
  }
}
