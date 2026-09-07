import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { forkJoin } from 'rxjs';

import { CatalogApi } from '../../core/api/catalog-api.service';
import { Product, ProductCategory, Unit } from '../../core/models/catalog.model';
import { ValidationErrors } from '../../core/models/common.model';
import { ToastService } from '../../core/services/toast.service';
import { FieldComponent } from './field.component';

/**
 * Diálogo de creación rápida de producto (los datos mínimos del catálogo) para usarlo
 * sin salir de un documento. Emite el producto creado con sus unidades cargadas.
 */
@Component({
  selector: 'app-product-quick-create',
  imports: [ReactiveFormsModule, DialogModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, SelectButtonModule, FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Nuevo producto"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '560px' }"
      appendTo="body"
      (onHide)="reset()"
    >
      <form [formGroup]="form" (submit)="$event.preventDefault(); save()" novalidate class="space-y-4">
        <p class="text-xs text-ink-3 -mt-1">
          Datos mínimos para poder usar el producto ahora. Podrás completar el resto (descripción, mínimos por bodega, más unidades) en Catálogo › Productos.
        </p>
        <div class="grid grid-cols-3 gap-3">
          <app-field label="SKU" [required]="true" [control]="form.controls.sku" [serverError]="err('sku')" [submitted]="submitted()">
            <input pInputText formControlName="sku" class="w-full uppercase" placeholder="CEM-050" />
          </app-field>
          <div class="col-span-2">
            <app-field label="Nombre" [required]="true" [control]="form.controls.name" [serverError]="err('name')" [submitted]="submitted()">
              <input pInputText formControlName="name" class="w-full" placeholder="Cemento gris 50 kg" />
            </app-field>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <app-field label="Categoría" [serverError]="err('category_id')">
            <p-select formControlName="category_id" [options]="categories()" optionLabel="name" optionValue="id" placeholder="Sin categoría" [showClear]="true" [filter]="true" appendTo="body" styleClass="w-full" />
          </app-field>
          <app-field label="Unidad base" [required]="true" hint="En esta unidad se guarda el stock." [control]="form.controls.base_unit_id" [serverError]="err('base_unit_id')" [submitted]="submitted()">
            <p-select formControlName="base_unit_id" [options]="units()" optionLabel="label" optionValue="id" placeholder="Seleccionar" [filter]="true" appendTo="body" styleClass="w-full" />
          </app-field>
        </div>
        <app-field label="Tipo" [required]="true">
          <p-selectbutton formControlName="kind" [options]="kinds" optionLabel="label" optionValue="value" [allowEmpty]="false" />
        </app-field>

        <div class="rounded-lg border border-line bg-canvas/60 p-3 space-y-3">
          <div class="text-[13px] font-medium text-ink">Unidad de compra (opcional)</div>
          <div class="grid grid-cols-2 gap-3">
            <app-field label="Unidad" [serverError]="err('units.0.unit_id')">
              <p-select formControlName="alt_unit_id" [options]="altUnits()" optionLabel="label" optionValue="id" placeholder="Igual a la base" [showClear]="true" appendTo="body" styleClass="w-full" />
            </app-field>
            <app-field label="Contiene" [hint]="factorHint()" [serverError]="err('units.0.factor')">
              <p-inputnumber formControlName="alt_factor" [min]="0.0001" [maxFractionDigits]="4" [useGrouping]="false" styleClass="w-full" inputStyleClass="w-full" placeholder="12" />
            </app-field>
          </div>
        </div>
      </form>

      <ng-template #footer>
        <p-button label="Cancelar" severity="secondary" [outlined]="true" (onClick)="visible.set(false)" [disabled]="saving()" />
        <p-button label="Crear producto" icon="pi pi-check" (onClick)="save()" [loading]="saving()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ProductQuickCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);

  readonly visible = model(false);
  /** Texto escrito en el buscador, para prellenar el nombre. */
  readonly initialName = model('');
  readonly created = output<Product>();

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly categories = signal<ProductCategory[]>([]);
  readonly units = signal<(Unit & { label: string })[]>([]);
  private loaded = false;

  readonly kinds = [
    { label: 'Consumible', value: 'consumible' },
    { label: 'Retornable (herramienta)', value: 'retornable' },
  ];

  readonly form = this.fb.nonNullable.group({
    sku: ['', [Validators.required, Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    category_id: [null as number | null],
    base_unit_id: [null as number | null, Validators.required],
    kind: ['consumible' as 'consumible' | 'retornable', Validators.required],
    alt_unit_id: [null as number | null],
    alt_factor: [null as number | null],
  });

  readonly altUnits = signal<(Unit & { label: string })[]>([]);

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.ensureOptions();
        const name = this.initialName();
        if (name && !this.form.controls.name.value) this.form.controls.name.setValue(name);
      }
    });
    this.form.controls.base_unit_id.valueChanges.subscribe((base) => {
      this.altUnits.set(this.units().filter((u) => u.id !== base));
      if (this.form.controls.alt_unit_id.value === base) this.form.controls.alt_unit_id.setValue(null);
    });
  }

  factorHint(): string {
    const alt = this.units().find((u) => u.id === this.form.controls.alt_unit_id.value);
    const base = this.units().find((u) => u.id === this.form.controls.base_unit_id.value);
    const f = this.form.controls.alt_factor.value;
    if (!alt || !base) return 'Cuántas unidades base trae la unidad de compra.';
    return `1 ${alt.code} = ${f ?? '?'} ${base.code}`;
  }

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  save(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if ((v.alt_unit_id && !v.alt_factor) || (!v.alt_unit_id && v.alt_factor)) {
      this.serverErrors.set({ 'units.0.factor': ['Indica unidad y factor, o deja ambos vacíos.'] });
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    const payload: Record<string, unknown> = {
      sku: v.sku.trim().toUpperCase(),
      name: v.name.trim(),
      category_id: v.category_id,
      base_unit_id: v.base_unit_id,
      kind: v.kind,
      is_active: true,
      units: v.alt_unit_id ? [{ unit_id: v.alt_unit_id, factor: v.alt_factor, is_default_purchase: true }] : [],
    };
    this.catalog.products.create(payload).subscribe({
      next: (product) => {
        this.saving.set(false);
        this.toast.success('Producto creado.', `${product.sku} · ${product.name}`);
        this.created.emit(product);
        this.visible.set(false);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        if (e instanceof HttpErrorResponse && e.status === 422) {
          const body = e.error as ValidationErrors;
          this.serverErrors.set(body.errors ?? {});
          this.toast.warn('Revisa el formulario', body.message);
        }
      },
    });
  }

  reset(): void {
    this.form.reset({ sku: '', name: '', category_id: null, base_unit_id: null, kind: 'consumible', alt_unit_id: null, alt_factor: null });
    this.serverErrors.set({});
    this.submitted.set(false);
    this.initialName.set('');
  }

  private ensureOptions(): void {
    if (this.loaded) return;
    this.loaded = true;
    forkJoin({ cats: this.catalog.productCategories.all(), units: this.catalog.units.all() }).subscribe(({ cats, units }) => {
      this.categories.set(cats);
      const list = units.map((u) => ({ ...u, label: `${u.code} — ${u.name}` }));
      this.units.set(list);
      this.altUnits.set(list.filter((u) => u.id !== this.form.controls.base_unit_id.value));
      const und = list.find((u) => u.code === 'UND');
      if (und && !this.form.controls.base_unit_id.value) this.form.controls.base_unit_id.setValue(und.id);
    });
  }
}
