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
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, forkJoin, of } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, Unit } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { PRIORITY_LABELS, Priority, PurchaseRequest, PurchaseRequestPayload, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Opción de unidad para una fila: unidad base (factor 1) o unidad alterna del producto. */
interface UnitOption {
  id: number;
  code: string;
  name: string;
  factor: number;
  label: string;
  /** "1 CAJA = 12 UND" (vacío para la unidad base). */
  hint: string;
  allowsDecimals: boolean;
  isDefaultPurchase: boolean;
}

interface RowMeta {
  options: UnitOption[];
  unit: UnitOption | null;
  decimals: 0 | 3;
  equivalent: string;
  hint: string;
}

type ItemGroup = FormGroup<{
  id: FormControl<number | null>;
  product: FormControl<Product | null>;
  unit_id: FormControl<number | null>;
  quantity: FormControl<number | null>;
  notes: FormControl<string | null>;
}>;

/** Formulario de solicitud de compra (crear / editar borrador o rechazada). */
@Component({
  selector: 'app-request-form',
  imports: [
    ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule, SelectModule,
    TextareaModule, TooltipModule, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-form.component.html',
})
export class RequestFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`solicitudes/:id/editar`); undefined en `solicitudes/nueva`. */
  readonly id = input<string>();

  readonly request = signal<PurchaseRequest | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  /** Catálogo de unidades (para saber si admiten decimales). */
  readonly allUnits = signal<Unit[]>([]);

  readonly today = new Date();

  readonly priorityOptions: { label: string; value: Priority }[] = (Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => ({
    label: PRIORITY_LABELS[p],
    value: p,
  }));

  readonly form = this.fb.group({
    warehouse_id: this.fb.control<number | null>(null, Validators.required),
    required_date: this.fb.control<Date | null>(null),
    priority: this.fb.control<Priority>('normal', { nonNullable: true, validators: Validators.required }),
    notes: this.fb.control<string>('', { nonNullable: true }),
    items: this.fb.array<ItemGroup>([]),
  });

  /** Valor del formulario como señal (para los cálculos por fila). */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  readonly isEdit = computed(() => !!this.id());
  readonly busy = computed(() => this.saving() || this.submitting());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.request()?.number ?? 'solicitud'}` : 'Nueva solicitud de compra'));
  readonly status = computed(() => this.request()?.status ?? 'borrador');
  readonly statusLabel = computed(() => this.request()?.status_label ?? 'Borrador');
  readonly requesterName = computed(() => this.request()?.requester?.name ?? this.auth.user()?.name ?? '—');
  readonly itemCount = computed(() => (this.formValue()?.items ?? []).length);

  /** Metadatos calculados por fila: opciones de unidad, decimales permitidos y equivalente en unidad base. */
  readonly rowMeta = computed<RowMeta[]>(() => {
    const rows = (this.formValue()?.items ?? []) as Partial<{ product: Product | null; unit_id: number | null; quantity: number | null }>[];
    const units = this.allUnits();
    return rows.map((r) => {
      const product = r?.product ?? null;
      const options = product ? this.unitOptionsFor(product, units) : [];
      const unit = options.find((u) => u.id === r?.unit_id) ?? null;
      const qty = Number(r?.quantity ?? 0);
      const baseCode = product?.base_unit?.code ?? '';
      const equivalent = product && unit && qty > 0 ? `${this.fmt(qty * unit.factor)} ${baseCode}` : '';
      return { options, unit, decimals: unit?.allowsDecimals ? 3 : 0, equivalent, hint: unit?.hint ?? '' };
    });
  });

  get itemsArray(): FormArray<ItemGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.catalog.units
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((units) => this.allUnits.set(units));

    // Carga la solicitud cuando cambia el id de ruta (nueva → editar reutiliza el componente).
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  private load(id: number | null): void {
    this.serverErrors.set({});
    this.submitted.set(false);
    if (!id) {
      this.request.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .request(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pr) => {
          if (!pr.is_editable) {
            this.toast.warn('No editable', `La solicitud ${pr.number} está en estado "${pr.status_label}".`);
            void this.router.navigate(['/compras/solicitudes', pr.id]);
            return;
          }
          this.request.set(pr);
          this.loadProductsAndPatch(pr);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/solicitudes']);
        },
      });
  }

  /** Trae cada producto distinto (con sus unidades) y luego arma las filas. */
  private loadProductsAndPatch(pr: PurchaseRequest): void {
    const ids = Array.from(new Set((pr.items ?? []).map((i) => i.product_id)));
    const fetches: Record<number, Observable<Product | null>> = {};
    for (const pid of ids) fetches[pid] = this.catalog.products.get(pid);
    const source: Observable<Record<number, Product | null>> = ids.length ? forkJoin(fetches) : of({});
    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (products) => {
        this.patchForm(pr, products);
        this.loading.set(false);
      },
      error: () => {
        this.patchForm(pr, {});
        this.loading.set(false);
        this.toast.warn('Productos', 'No se pudieron cargar todos los productos de la solicitud.');
      },
    });
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({
      warehouse_id: this.ctx.activeId(),
      required_date: null,
      priority: 'normal',
      notes: '',
    });
    this.addItem();
    this.form.markAsPristine();
  }

  private patchForm(pr: PurchaseRequest, products: Record<number, Product | null>): void {
    this.itemsArray.clear();
    for (const it of pr.items ?? []) {
      const product = products[it.product_id] ?? null;
      this.itemsArray.push(this.itemGroup({ id: it.id, product, unit_id: it.unit_id, quantity: Number(it.quantity), notes: it.notes ?? '' }));
    }
    if (!this.itemsArray.length) this.addItem();
    this.form.patchValue({
      warehouse_id: pr.warehouse_id,
      required_date: pr.required_date ? this.parseDate(pr.required_date) : null,
      priority: pr.priority,
      notes: pr.notes ?? '',
    });
    this.form.markAsPristine();
  }

  // ---------- Ítems ----------

  private itemGroup(init?: { id: number | null; product: Product | null; unit_id: number | null; quantity: number | null; notes: string }): ItemGroup {
    const g: ItemGroup = this.fb.group({
      id: this.fb.control<number | null>(init?.id ?? null),
      product: this.fb.control<Product | null>(init?.product ?? null, Validators.required),
      unit_id: this.fb.control<number | null>({ value: init?.unit_id ?? null, disabled: !init?.product }, Validators.required),
      quantity: this.fb.control<number | null>(init?.quantity ?? null, [Validators.required, Validators.min(0.001)]),
      notes: this.fb.control<string | null>(init?.notes ?? ''),
    });
    // Al cambiar el producto se ajusta la unidad (compra por defecto o base) y se habilita el selector.
    g.controls.product.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const unitCtrl = g.controls.unit_id;
      if (!p) {
        unitCtrl.setValue(null);
        unitCtrl.disable();
        return;
      }
      const options = this.unitOptionsFor(p, this.allUnits());
      const def = options.find((u) => u.isDefaultPurchase) ?? options[0] ?? null;
      unitCtrl.setValue(def?.id ?? null);
      unitCtrl.enable();
    });
    return g;
  }

  addItem(): void {
    this.itemsArray.push(this.itemGroup());
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
    // Reindexa los errores del servidor de las filas siguientes.
    const errors = this.serverErrors();
    if (Object.keys(errors).some((k) => k.startsWith('items.'))) {
      const next: Record<string, string[]> = {};
      for (const [key, msgs] of Object.entries(errors)) {
        const m = /^items\.(\d+)\.(.+)$/.exec(key);
        if (!m) {
          next[key] = msgs;
          continue;
        }
        const idx = +m[1];
        if (idx === i) continue;
        next[`items.${idx > i ? idx - 1 : idx}.${m[2]}`] = msgs;
      }
      this.serverErrors.set(next);
    }
  }

  /** Unidad base + unidades alternas del producto. */
  private unitOptionsFor(product: Product, units: Unit[]): UnitOption[] {
    const baseRef = units.find((u) => u.id === product.base_unit_id);
    const baseCode = product.base_unit?.code ?? baseRef?.code ?? '';
    const baseName = product.base_unit?.name ?? baseRef?.name ?? '';
    const base: UnitOption = {
      id: product.base_unit_id,
      code: baseCode,
      name: baseName,
      factor: 1,
      label: `${baseCode} — ${baseName}`,
      hint: '',
      allowsDecimals: product.base_unit?.allows_decimals ?? baseRef?.allows_decimals ?? true,
      isDefaultPurchase: false,
    };
    const alternates: UnitOption[] = (product.units ?? [])
      .filter((u) => u.unit_id !== product.base_unit_id)
      .map((u) => {
        const ref = units.find((x) => x.id === u.unit_id);
        const code = u.unit?.code ?? ref?.code ?? '';
        const name = u.unit?.name ?? ref?.name ?? '';
        const factor = Number(u.factor) || 1;
        return {
          id: u.unit_id,
          code,
          name,
          factor,
          label: `${code} — ${name}`,
          hint: `1 ${code} = ${this.fmt(factor)} ${baseCode}`,
          allowsDecimals: ref?.allows_decimals ?? true,
          isDefaultPurchase: !!u.is_default_purchase,
        };
      });
    return [base, ...alternates];
  }

  // ---------- Guardar / enviar ----------

  saveDraft(): void {
    this.persist(false);
  }

  submitForApproval(): void {
    this.persist(true);
  }

  private persist(submit: boolean): void {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin ítems', 'Agrega al menos un ítem a la solicitud.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return;
    }
    const payload = this.buildPayload();
    if (submit) this.submitting.set(true);
    else this.saving.set(true);
    this.serverErrors.set({});

    const current = this.request();
    const req = current ? this.api.updateRequest(current.id, payload) : this.api.createRequest(payload);
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.form.markAsPristine();
        if (!submit) {
          this.saving.set(false);
          this.toast.success(current ? 'Solicitud actualizada.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/compras/solicitudes', saved.id]);
          return;
        }
        this.api
          .requestAction(saved.id, 'submit')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (sent) => {
              this.submitting.set(false);
              this.toast.success('Solicitud enviada a aprobación.', sent.number);
              void this.router.navigate(['/compras/solicitudes', sent.id]);
            },
            error: (err: unknown) => {
              this.submitting.set(false);
              this.handleError(err, 'No se pudo enviar a aprobación');
              // Quedó guardada como borrador: llevar al detalle para no perder el trabajo.
              void this.router.navigate(['/compras/solicitudes', saved.id]);
            },
          });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.submitting.set(false);
        this.handleError(err, 'No se pudo guardar la solicitud');
      },
    });
  }

  private buildPayload(): PurchaseRequestPayload {
    const v = this.form.getRawValue();
    return {
      warehouse_id: v.warehouse_id as number,
      required_date: v.required_date ? this.toIsoDate(v.required_date) : null,
      priority: v.priority,
      notes: v.notes?.trim() || null,
      items: v.items.map((it) => ({
        id: it.id ?? undefined,
        product_id: it.product?.id as number,
        unit_id: it.unit_id as number,
        quantity: Number(it.quantity),
        notes: it.notes?.trim() || null,
      })),
    };
  }

  private handleError(err: unknown, fallback: string): void {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const body = err.error as Partial<ValidationErrors>;
      if (body.errors && Object.keys(body.errors).length) {
        this.serverErrors.set(body.errors);
        this.toast.warn('Revisa el formulario', body.message);
      } else {
        this.toast.error(fallback, body.message);
      }
    }
    // Otros códigos ya los notifica el interceptor.
  }

  cancel(): void {
    const current = this.request();
    if (current) void this.router.navigate(['/compras/solicitudes', current.id]);
    else void this.router.navigate(['/compras/solicitudes']);
  }

  // ---------- Utilidades ----------

  /** Primer error del servidor para un campo (soporta claves anidadas `items.0.quantity`). */
  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores del servidor de una fila (`items.N.*`) que no se muestran ya bajo un campo concreto. */
  rowErrors(i: number, shown: string[]): string[] {
    const out: string[] = [];
    for (const [key, msgs] of Object.entries(this.serverErrors())) {
      if (!key.startsWith(`items.${i}.`)) continue;
      const field = key.slice(`items.${i}.`.length);
      if (shown.includes(field)) continue;
      out.push(...msgs);
    }
    return out;
  }

  showError(g: ItemGroup, field: 'product' | 'unit_id' | 'quantity'): boolean {
    const c = g.controls[field];
    return c.enabled && c.invalid && (c.touched || this.submitted());
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n);
  }

  statusTone = statusTone;

  private parseDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private toIsoDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}
