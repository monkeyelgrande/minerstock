import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ProductCategory } from '../../../core/models/catalog.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-product-categories-page',
  imports: [
    ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, SelectModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-categories-page.component.html',
})
export class ProductCategoriesPageComponent extends MasterPageBase<ProductCategory> {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  protected readonly api = inject(CatalogApi).productCategories;
  protected readonly entityName = 'la categoría';
  protected override readonly gender: 'm' | 'f' = 'f';

  /** Todas las categorías activas (para el selector de categoría padre). */
  readonly categories = signal<ProductCategory[]>([]);

  /** Opciones de padre: excluye la propia categoría cuando se edita. */
  readonly parentOptions = computed(() => {
    const currentId = this.editing()?.id;
    return this.categories().filter((c) => c.id !== currentId);
  });

  constructor() {
    super();
    this.loadCategories();
  }

  protected buildForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      parent_id: [null],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { parent_id: null, is_active: true };
  }

  /** Tras guardar, refresca el selector de padres para incluir la nueva categoría. */
  protected override afterSaved(): void {
    this.loadCategories();
  }

  private loadCategories(): void {
    this.api
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.categories.set(list));
  }
}
