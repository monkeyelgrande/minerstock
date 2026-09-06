import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, ProductCategory, ProductKind, Unit, Warehouse } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { ToastService } from '../../../core/services/toast.service';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';

interface UnitOption extends Unit {
  label: string;
}

/** Formulario de producto a página completa: datos generales, unidades alternas y parámetros por bodega. */
@Component({
  selector: 'app-product-form',
  imports: [
    ReactiveFormsModule, ButtonModule, CheckboxModule, InputNumberModule, InputTextModule, SelectModule,
    SelectButtonModule, TableModule, TabsModule, TextareaModule, ToggleSwitchModule, TooltipModule,
    FieldComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form.component.html',
})
export class ProductFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  /** Id de ruta (`productos/:id`); undefined en `productos/nuevo`. */
  readonly id = input<string>();

  readonly product = signal<Product | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly activeTab = signal('general');

  readonly categories = signal<ProductCategory[]>([]);
  readonly units = signal<UnitOption[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);

  readonly kindOptions: { label: string; value: ProductKind }[] = [
    { label: 'Consumible', value: 'consumible' },
    { label: 'Retornable', value: 'retornable' },
  ];

  readonly form = this.fb.group({
    sku: ['', [Validators.required, Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    category_id: [null as number | null],
    kind: ['consumible' as ProductKind, Validators.required],
    base_unit_id: [null as number | null, Validators.required],
    default_min_stock: [0 as number | null, [Validators.required, Validators.min(0)]],
    barcode: [''],
    description: [''],
    is_active: [true],
    units: this.fb.array<FormGroup>([]),
    warehouse_settings: this.fb.array<FormGroup>([]),
  });

  /** Valor del formulario como señal (para opciones dependientes). */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  readonly isEdit = computed(() => !!this.id());
  readonly canEdit = computed(() => (this.isEdit() ? this.auth.can('products.update') : this.auth.can('products.create')));
  readonly title = computed(() => (this.isEdit() ? this.product()?.name ?? 'Producto' : 'Nuevo producto'));

  readonly baseUnit = computed(() => {
    const id = this.formValue()?.base_unit_id;
    return this.units().find((u) => u.id === id) ?? null;
  });

  /** Opciones de unidad por fila: excluye la unidad base y las ya elegidas en otras filas. */
  readonly unitOptionsByRow = computed(() => {
    const value = this.formValue();
    const baseId = value?.base_unit_id;
    const rows = (value?.units ?? []) as { unit_id: number | null }[];
    const chosen = rows.map((r) => r?.unit_id ?? null);
    return rows.map((_, i) =>
      this.units().filter((u) => u.id !== baseId && (u.id === chosen[i] || !chosen.includes(u.id))),
    );
  });

  /** Opciones de bodega por fila: excluye las ya elegidas en otras filas. */
  readonly warehouseOptionsByRow = computed(() => {
    const rows = (this.formValue()?.warehouse_settings ?? []) as { warehouse_id: number | null }[];
    const chosen = rows.map((r) => r?.warehouse_id ?? null);
    return rows.map((_, i) => this.warehouses().filter((w) => w.id === chosen[i] || !chosen.includes(w.id)));
  });

  /** Texto "1 CAJA = 12 UND" por fila de unidad alterna. */
  readonly factorHints = computed(() => {
    const base = this.baseUnit();
    const rows = (this.formValue()?.units ?? []) as { unit_id: number | null; factor: number | null }[];
    return rows.map((r) => {
      const unit = this.units().find((u) => u.id === r?.unit_id);
      if (!unit || !base || !r?.factor || r.factor <= 0) return '';
      return `1 ${unit.code} = ${this.fmt(r.factor)} ${base.code}`;
    });
  });

  get unitsArray(): FormArray<FormGroup> {
    return this.form.controls.units;
  }

  get warehouseArray(): FormArray<FormGroup> {
    return this.form.controls.warehouse_settings;
  }

  constructor() {
    forkJoin({
      categories: this.catalog.productCategories.all(),
      units: this.catalog.units.all(),
      warehouses: this.catalog.warehouses.all(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ categories, units, warehouses }) => {
        this.categories.set(categories);
        this.units.set(units.map((u) => ({ ...u, label: `${u.code} — ${u.name}` })));
        this.warehouses.set(warehouses);
      });

    // Carga el producto cuando cambia el id de ruta (nuevo → editar reutiliza el componente).
    effect(() => {
      const id = this.id();
      untracked(() => this.loadProduct(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  private loadProduct(id: number | null): void {
    this.serverErrors.set({});
    this.submitted.set(false);
    if (!id) {
      this.product.set(null);
      this.resetForm();
      this.applyPermissions();
      return;
    }
    this.loading.set(true);
    this.catalog.products
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.product.set(p);
          this.patchForm(p);
          this.applyPermissions();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/catalogo/productos']);
        },
      });
  }

  private resetForm(): void {
    this.unitsArray.clear();
    this.warehouseArray.clear();
    this.form.reset({
      sku: '',
      name: '',
      category_id: null,
      kind: 'consumible',
      base_unit_id: null,
      default_min_stock: 0,
      barcode: '',
      description: '',
      is_active: true,
    });
  }

  private patchForm(p: Product): void {
    this.unitsArray.clear();
    this.warehouseArray.clear();
    for (const u of p.units ?? []) {
      this.unitsArray.push(this.unitGroup(u.unit_id, Number(u.factor), u.is_default_purchase));
    }
    for (const w of p.warehouse_settings ?? []) {
      this.warehouseArray.push(
        this.warehouseGroup(w.warehouse_id, Number(w.min_stock), w.max_stock === null ? null : Number(w.max_stock)),
      );
    }
    this.form.patchValue({
      sku: p.sku,
      name: p.name,
      category_id: p.category_id,
      kind: p.kind,
      base_unit_id: p.base_unit_id,
      default_min_stock: Number(p.default_min_stock),
      barcode: p.barcode ?? '',
      description: p.description ?? '',
      is_active: p.is_active,
    });
    this.form.markAsPristine();
  }

  private applyPermissions(): void {
    if (this.canEdit()) this.form.enable({ emitEvent: false });
    else this.form.disable({ emitEvent: false });
    // Fuerza recalcular las señales derivadas tras enable/disable sin eventos.
    this.form.updateValueAndValidity();
  }

  // ---------- Unidades alternas ----------

  private unitGroup(unitId: number | null = null, factor: number | null = null, isDefault = false): FormGroup {
    return this.fb.group({
      unit_id: [unitId, Validators.required],
      factor: [factor, [Validators.required, Validators.min(0.0001)]],
      is_default_purchase: [isDefault],
    });
  }

  addUnit(): void {
    this.unitsArray.push(this.unitGroup());
  }

  removeUnit(i: number): void {
    this.unitsArray.removeAt(i);
  }

  /** Solo una unidad puede ser la de compra por defecto. */
  setDefaultPurchase(i: number, checked: boolean): void {
    this.unitsArray.controls.forEach((g, idx) => {
      g.controls['is_default_purchase'].setValue(checked && idx === i);
    });
  }

  // ---------- Parámetros por bodega ----------

  private warehouseGroup(warehouseId: number | null = null, min: number | null = 0, max: number | null = null): FormGroup {
    return this.fb.group({
      warehouse_id: [warehouseId, Validators.required],
      min_stock: [min, [Validators.required, Validators.min(0)]],
      max_stock: [max, Validators.min(0)],
    });
  }

  addWarehouse(): void {
    this.warehouseArray.push(this.warehouseGroup());
  }

  removeWarehouse(i: number): void {
    this.warehouseArray.removeAt(i);
  }

  // ---------- Guardar ----------

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.activeTab.set(this.firstInvalidTab());
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    const v = this.form.getRawValue();
    const payload = {
      sku: v.sku,
      name: v.name,
      description: v.description || null,
      category_id: v.category_id,
      base_unit_id: v.base_unit_id,
      kind: v.kind,
      default_min_stock: v.default_min_stock ?? 0,
      barcode: v.barcode || null,
      is_active: v.is_active,
      units: (v.units as { unit_id: number; factor: number; is_default_purchase: boolean }[]).map((u) => ({
        unit_id: u.unit_id,
        factor: u.factor,
        is_default_purchase: !!u.is_default_purchase,
      })),
      warehouse_settings: (v.warehouse_settings as { warehouse_id: number; min_stock: number; max_stock: number | null }[]).map((w) => ({
        warehouse_id: w.warehouse_id,
        min_stock: w.min_stock ?? 0,
        max_stock: w.max_stock ?? null,
      })),
    };
    const current = this.product();
    const req = current ? this.catalog.products.update(current.id, payload) : this.catalog.products.create(payload);
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (current) {
          this.toast.success('Producto actualizado.');
          void this.router.navigate(['/catalogo/productos']);
        } else {
          this.toast.success('Producto creado.', `${saved.sku} — ${saved.name}`);
          void this.router.navigate(['/catalogo/productos', saved.id]);
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse && err.status === 422) {
          const body = err.error as ValidationErrors;
          this.serverErrors.set(body.errors ?? {});
          this.activeTab.set(this.firstErrorTab(Object.keys(body.errors ?? {})));
          this.toast.warn('Revisa el formulario', body.message);
        }
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/catalogo/productos']);
  }

  /** Primer error del servidor para un campo (soporta claves anidadas `units.0.factor`). */
  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores del servidor de una fila de un arreglo (ej. `units.0.*`), excluyendo los ya mostrados por campo. */
  rowErrors(prefix: string, i: number, shown: string[]): string[] {
    const errors = this.serverErrors();
    const out: string[] = [];
    for (const [key, msgs] of Object.entries(errors)) {
      if (!key.startsWith(`${prefix}.${i}`)) continue;
      const field = key.slice(`${prefix}.${i}.`.length);
      if (shown.includes(field)) continue;
      out.push(...msgs);
    }
    return out;
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '';
    return String(Number(n));
  }

  private firstInvalidTab(): string {
    const generalInvalid = Object.entries(this.form.controls).some(
      ([key, c]) => key !== 'units' && key !== 'warehouse_settings' && c.invalid,
    );
    if (generalInvalid) return 'general';
    if (this.unitsArray.invalid) return 'units';
    if (this.warehouseArray.invalid) return 'warehouses';
    return 'general';
  }

  private firstErrorTab(keys: string[]): string {
    if (keys.some((k) => k.startsWith('units'))) return 'units';
    if (keys.some((k) => k.startsWith('warehouse_settings'))) return 'warehouses';
    return 'general';
  }
}
