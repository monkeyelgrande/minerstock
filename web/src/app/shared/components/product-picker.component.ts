import { ChangeDetectionStrategy, Component, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../core/api/catalog-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Product } from '../../core/models/catalog.model';
import { ProductQuickCreateComponent } from './product-quick-create.component';

/**
 * Buscador de productos con autocompletado (SKU o nombre) y creación rápida.
 * Como control de formulario su valor es el `Product` completo (o null);
 * el padre toma `product.id`, `base_unit_id` y `units` para la conversión.
 * El botón "+" (creación rápida) aparece si el usuario tiene `products.create` y `allowCreate` es true.
 */
@Component({
  selector: 'app-product-picker',
  imports: [AutoCompleteModule, FormsModule, ButtonModule, TooltipModule, ProductQuickCreateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ProductPickerComponent), multi: true }],
  template: `
    <div class="flex items-stretch gap-1">
      <p-autocomplete
        class="flex-1 min-w-0"
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
        <ng-template #empty>
          <div class="px-3 py-2 text-sm text-ink-3">
            Sin resultados.
            @if (canCreate()) {
              <button type="button" class="ml-1 font-medium text-link hover:underline" (mousedown)="$event.preventDefault()" (click)="openCreate()">Crear producto</button>
            }
          </div>
        </ng-template>
      </p-autocomplete>
      @if (canCreate()) {
        <p-button icon="pi pi-plus" severity="secondary" [outlined]="true" pTooltip="Crear producto nuevo" tooltipPosition="top" [disabled]="disabled()" (onClick)="openCreate()" />
      }
    </div>
    @if (canCreate()) {
      <app-product-quick-create [(visible)]="createOpen" [(initialName)]="typed" (created)="onCreated($event)" />
    }
  `,
})
export class ProductPickerComponent implements ControlValueAccessor {
  private readonly catalog = inject(CatalogApi);
  private readonly auth = inject(AuthService);

  readonly placeholder = input('Buscar producto por SKU o nombre…');
  /** Permite abrir la creación rápida (además del permiso products.create). */
  readonly allowCreate = input(true);

  readonly value = signal<Product | null>(null);
  readonly suggestions = signal<Product[]>([]);
  readonly disabled = signal(false);
  readonly createOpen = signal(false);
  readonly typed = signal('');

  readonly canCreate = computed(() => {
    this.auth.user();
    return this.allowCreate() && this.auth.can('products.create');
  });

  private onChange: (v: Product | null) => void = () => void 0;
  onTouched: () => void = () => void 0;

  search(event: AutoCompleteCompleteEvent): void {
    this.typed.set(event.query);
    this.catalog.products.list({ search: event.query, active: '1', per_page: 15 }).subscribe((r) => this.suggestions.set(r.data));
  }

  onSelect(p: Product | string | null): void {
    const product = p && typeof p === 'object' ? p : null;
    this.value.set(product);
    this.onChange(product);
  }

  openCreate(): void {
    this.createOpen.set(true);
  }

  onCreated(product: Product): void {
    this.value.set(product);
    this.onChange(product);
    this.onTouched();
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
