import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, ProductCategory, ProductKind } from '../../../core/models/catalog.model';
import { ListParams } from '../../../core/models/common.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

/** Listado de productos. Crear/editar navega a la página de formulario. */
@Component({
  selector: 'app-products-page',
  imports: [
    FormsModule, TableModule, ButtonModule, SelectModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products-page.component.html',
})
export class ProductsPageComponent extends MasterPageBase<Product> {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogApi);
  readonly auth = inject(AuthService);
  protected readonly api = this.catalog.products;
  protected readonly entityName = 'el producto';

  readonly categories = signal<ProductCategory[]>([]);
  readonly categoryId = signal<number | null>(null);
  readonly kind = signal<ProductKind | null>(null);

  readonly kindOptions: { label: string; value: ProductKind | null }[] = [
    { label: 'Todos los tipos', value: null },
    { label: 'Consumible', value: 'consumible' },
    { label: 'Retornable', value: 'retornable' },
  ];

  constructor() {
    super();
    this.catalog.productCategories.all().subscribe((list) => this.categories.set(list));
  }

  /** No hay drawer en esta página; el formulario vive en ProductFormComponent. */
  protected buildForm(): FormGroup {
    return this.fb.group({});
  }

  protected override extraParams(): ListParams {
    return { category_id: this.categoryId() ?? undefined, kind: this.kind() ?? undefined };
  }

  setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.page.set(1);
    this.load();
  }

  setKind(kind: ProductKind | null): void {
    this.kind.set(kind);
    this.page.set(1);
    this.load();
  }

  goCreate(): void {
    void this.router.navigate(['/catalogo/productos/nuevo']);
  }

  goEdit(row: Product): void {
    void this.router.navigate(['/catalogo/productos', row.id]);
  }

  altUnits(row: Product): string {
    const units = row.units ?? [];
    if (!units.length) return '—';
    return units.map((u) => `${u.unit?.code ?? u.unit_id} ×${this.fmt(u.factor)}`).join(', ');
  }

  /** Número sin ceros decimales sobrantes (la API puede devolver "12.000"). */
  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '—';
    return String(Number(n));
  }
}
