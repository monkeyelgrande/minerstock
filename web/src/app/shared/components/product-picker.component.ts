import { ChangeDetectionStrategy, Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';

import { CatalogApi } from '../../core/api/catalog-api.service';
import { Product } from '../../core/models/catalog.model';

/**
 * Buscador de productos con autocompletado (SKU o nombre).
 * Como control de formulario su valor es el `Product` completo (o null);
 * el padre toma `product.id`, `base_unit_id` y `units` para la conversión.
 */
@Component({
  selector: 'app-product-picker',
  imports: [AutoCompleteModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ProductPickerComponent), multi: true }],
  template: `
    <p-autocomplete
      [ngModel]="value()"
      (ngModelChange)="onSelect($event)"
      [suggestions]="suggestions()"
      (completeMethod)="search($event)"
      optionLabel="name"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      [minLength]="1"
      [delay]="250"
      [forceSelection]="true"
      [showClear]="true"
      appendTo="body"
      styleClass="w-full"
      inputStyleClass="w-full"
      (onBlur)="onTouched()"
    >
      <ng-template #item let-p>
        <div class="flex flex-col leading-tight">
          <span class="text-sm font-medium">{{ p.name }}</span>
          <span class="text-xs text-ink-3">{{ p.sku }} · {{ p.base_unit?.code }}@if (p.category) { · {{ p.category.name }} }</span>
        </div>
      </ng-template>
    </p-autocomplete>
  `,
})
export class ProductPickerComponent implements ControlValueAccessor {
  private readonly catalog = inject(CatalogApi);

  readonly placeholder = input('Buscar producto por SKU o nombre…');
  readonly value = signal<Product | null>(null);
  readonly suggestions = signal<Product[]>([]);
  readonly disabled = signal(false);

  private onChange: (v: Product | null) => void = () => void 0;
  onTouched: () => void = () => void 0;

  search(event: AutoCompleteCompleteEvent): void {
    this.catalog.products.list({ search: event.query, active: '1', per_page: 15 }).subscribe((r) => this.suggestions.set(r.data));
  }

  onSelect(p: Product | string | null): void {
    const product = p && typeof p === 'object' ? p : null;
    this.value.set(product);
    this.onChange(product);
  }

  writeValue(v: Product | null): void {
    this.value.set(v);
  }

  registerOnChange(fn: (v: Product | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
