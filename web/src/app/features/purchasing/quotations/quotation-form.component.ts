import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, forkJoin, map, of } from 'rxjs';

import { AdminApi } from '../../../core/api/admin-api.service';
import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, Supplier } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import {
  PRIORITY_LABELS,
  PendingRequestItem,
  Priority,
  Quotation,
  QuotationItem,
  QuotationPayload,
  priorityTone,
  statusTone,
} from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Controles de una fila de ítem. */
interface ItemControls {
  id: FormControl<number | null>;
  product: FormControl<Product | null>;
  purchase_request_item_id: FormControl<number | null>;
  request_number: FormControl<string | null>;
  unit_id: FormControl<number | null>;
  quantity: FormControl<number | null>;
  unit_price: FormControl<number | null>;
  tax_rate: FormControl<number>;
  delivery_days: FormControl<number | null>;
  not_quoted: FormControl<boolean>;
  notes: FormControl<string | null>;
}
type ItemGroup = FormGroup<ItemControls>;
type ItemValue = ReturnType<ItemGroup['getRawValue']>;

interface UnitOption {
  id: number;
  code: string;
  label: string;
  factor: number;
}

/** Grupo de ítems pendientes por solicitud (diálogo "Traer ítems"). */
interface PendingGroup {
  request: PendingRequestItem['request'];
  items: PendingRequestItem[];
}

/** Modo de guardado: borrador, marcar recibida o enviar la solicitud al proveedor. */
type SaveMode = 'draft' | 'receive' | 'send';

/** Formulario de cotización a página completa: proveedor, vigencia e ítems con conversión de unidades. */
@Component({
  selector: 'app-quotation-form',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule,
    ButtonModule, CheckboxModule, DatePickerModule, DialogModule, InputNumberModule, MultiSelectModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quotation-form.component.html',
})
export class QuotationFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly admin = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`cotizaciones/:id/editar`); undefined en `cotizaciones/nueva`. */
  readonly id = input<string>();

  readonly quotation = signal<Quotation | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly suppliers = signal<Supplier[]>([]);
  readonly defaultTaxRate = signal(19);

  // Diálogo "Traer ítems de solicitudes aprobadas"
  readonly pickerOpen = signal(false);
  readonly pickerLoading = signal(false);
  readonly pickerAdding = signal(false);
  readonly pickerWarehouseId = signal<number | null>(null);
  readonly pendingItems = signal<PendingRequestItem[]>([]);
  readonly pickedIds = signal<Set<number>>(new Set());

  // Diálogo "Enviar solicitud de cotización" (tras guardar)
  readonly sendOpen = signal(false);
  readonly sending = signal(false);
  readonly sendSupplierIds = signal<number[]>([]);
  readonly savedForSend = signal<Quotation | null>(null);

  readonly form = this.fb.group({
    supplier_id: this.fb.control<number | null>(null, Validators.required),
    date: this.fb.control<Date | null>(new Date(), Validators.required),
    valid_until: this.fb.control<Date | null>(null),
    notes: this.fb.control<string>(''),
    items: this.fb.array<ItemGroup>([]),
  });

  /** Valor completo (incluye controles deshabilitados) como señal para los cálculos. */
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly canEdit = computed(() => (this.isEdit() ? this.auth.can('quotations.update') : this.auth.can('quotations.create')));
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.quotation()?.number ?? 'cotización'}` : 'Nueva cotización'));
  readonly status = computed(() => this.quotation()?.status ?? 'borrador');
  readonly statusLabel = computed(() => this.quotation()?.status_label ?? 'Borrador');
  /** Modo borrador (crear o editar un borrador): permite enviar al proveedor o marcar recibida. */
  readonly isDraftMode = computed(() => !this.isEdit() || this.status() === 'borrador');
  /** El checkbox "No cotizó" solo tiene sentido al reeditar precios de una recibida. */
  readonly showNotQuoted = computed(() => this.status() === 'recibida');

  readonly taxOptions = computed(() => {
    const rates = new Set<number>([0, 5, 19, this.defaultTaxRate()]);
    return [...rates].sort((a, b) => a - b).map((r) => ({ label: `${r} %`, value: r }));
  });

  private readonly items = computed(() => (this.formValue().items ?? []) as ItemValue[]);

  /** "Guardar y marcar recibida" solo cuando todos los ítems tienen precio (o "no cotizó"). */
  readonly allPriced = computed(() => {
    const rows = this.items();
    return rows.length > 0 && rows.every((r) => r.not_quoted || (r.unit_price !== null && r.unit_price !== undefined));
  });

  /** Proveedores adicionales elegibles en el diálogo de envío (excluye al destinatario). */
  readonly sendSupplierOptions = computed(() => {
    const currentId = this.savedForSend()?.supplier_id;
    return this.suppliers().filter((s) => s.id !== currentId);
  });

  /** Nombre del proveedor destinatario del envío. */
  readonly sendTargetName = computed(() => {
    const q = this.savedForSend();
    if (!q) return '';
    return q.supplier?.name ?? this.suppliers().find((s) => s.id === q.supplier_id)?.name ?? '';
  });

  /** Opciones de unidad por fila (unidad base + alternas del producto). */
  readonly unitOptionsByRow = computed(() => this.items().map((row) => this.unitOptionsFor(row.product)));

  /** Factor de conversión por fila (1 si es la unidad base). */
  readonly factorByRow = computed(() =>
    this.items().map((row, i) => this.unitOptionsByRow()[i].find((u) => u.id === row.unit_id)?.factor ?? 1),
  );

  /** Subtotal por fila (cantidad × precio, sin IVA; 0 si no cotizó o sin precio). */
  readonly lineTotals = computed(() =>
    this.items().map((row) => (row.not_quoted ? 0 : (Number(row.quantity) || 0) * (Number(row.unit_price) || 0))),
  );

  readonly totals = computed(() => {
    const rows = this.items();
    const lines = this.lineTotals();
    const subtotal = lines.reduce((a, b) => a + b, 0);
    const tax = rows.reduce((sum, row, i) => sum + lines[i] * ((Number(row.tax_rate) || 0) / 100), 0);
    return { subtotal, tax, total: subtotal + tax };
  });

  /** Ítems pendientes agrupados por solicitud, excluyendo los ya presentes en el formulario. */
  readonly pendingGroups = computed<PendingGroup[]>(() => {
    const used = new Set(this.items().map((r) => r.purchase_request_item_id).filter((v): v is number => v !== null));
    const groups = new Map<number, PendingGroup>();
    for (const item of this.pendingItems()) {
      if (used.has(item.id)) continue;
      const g = groups.get(item.request.id) ?? { request: item.request, items: [] };
      g.items.push(item);
      groups.set(item.request.id, g);
    }
    return [...groups.values()];
  });
  readonly pendingVisibleCount = computed(() => this.pendingGroups().reduce((n, g) => n + g.items.length, 0));
  readonly pickedCount = computed(() => this.pickedIds().size);

  get itemsArray(): FormArray<ItemGroup> {
    return this.form.controls.items;
  }

  constructor() {
    forkJoin({ suppliers: this.catalog.suppliers.all(), settings: this.admin.settings() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ suppliers, settings }) => {
        this.suppliers.set(suppliers);
        if (settings.default_tax_rate !== undefined && settings.default_tax_rate !== null) {
          this.defaultTaxRate.set(Number(settings.default_tax_rate));
        }
      });

    // Carga la cotización cuando cambia el id de ruta (nueva → editar reutiliza el componente).
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
      this.quotation.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .quotation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          if (!q.is_editable) {
            this.toast.warn('No editable', `La cotización ${q.number} está en estado "${q.status_label}".`);
            void this.router.navigate(['/compras/cotizaciones', q.id]);
            return;
          }
          this.quotation.set(q);
          this.patchForm(q);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/cotizaciones']);
        },
      });
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({ supplier_id: null, date: new Date(), valid_until: null, notes: '' });
  }

  /** Carga los productos completos (unidades) de los ítems y llena el formulario. */
  private patchForm(q: Quotation): void {
    const items = q.items ?? [];
    this.loadProducts([...new Set(items.map((i) => i.product_id))])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          this.itemsArray.clear();
          for (const i of items) this.itemsArray.push(this.itemGroupFrom(i, products.get(i.product_id) ?? null));
          this.form.patchValue({
            supplier_id: q.supplier_id,
            date: this.parseDate(q.date) ?? new Date(),
            valid_until: this.parseDate(q.valid_until),
            notes: q.notes ?? '',
          });
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private loadProducts(ids: number[]): Observable<Map<number, Product>> {
    if (!ids.length) return of(new Map<number, Product>());
    return forkJoin(ids.map((id) => this.catalog.products.get(id))).pipe(
      map((list) => new Map(list.map((p) => [p.id, p]))),
    );
  }

  /** Recarga solo los adjuntos tras subir/eliminar (sin tocar el formulario). */
  reloadAttachments(): void {
    const current = this.quotation();
    if (!current) return;
    this.api
      .quotation(current.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.quotation.set(q));
  }

  // ---------- Ítems ----------

  private itemGroup(init: Partial<ItemValue> = {}): ItemGroup {
    const g = this.fb.group<ItemControls>({
      id: this.fb.control<number | null>(init.id ?? null),
      product: this.fb.control<Product | null>(init.product ?? null, Validators.required),
      purchase_request_item_id: this.fb.control<number | null>(init.purchase_request_item_id ?? null),
      request_number: this.fb.control<string | null>(init.request_number ?? null),
      unit_id: this.fb.control<number | null>(init.unit_id ?? null, Validators.required),
      quantity: this.fb.control<number | null>(init.quantity ?? null, [Validators.required, Validators.min(0.0001)]),
      unit_price: this.fb.control<number | null>(init.unit_price ?? null, Validators.min(0)),
      tax_rate: this.fb.nonNullable.control<number>(init.tax_rate ?? this.defaultTaxRate()),
      delivery_days: this.fb.control<number | null>(init.delivery_days ?? null, Validators.min(0)),
      not_quoted: this.fb.nonNullable.control<boolean>(init.not_quoted ?? false),
      notes: this.fb.control<string | null>(init.notes ?? null),
    });
    // "No cotizó" limpia y bloquea el precio de la fila.
    if (g.controls.not_quoted.value) g.controls.unit_price.disable();
    g.controls.not_quoted.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((nq) => {
      if (nq) {
        g.controls.unit_price.setValue(null);
        g.controls.unit_price.disable();
      } else {
        g.controls.unit_price.enable();
      }
    });
    // Al cambiar el producto (fila libre) se propone la unidad de compra por defecto.
    g.controls.product.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      g.controls.unit_id.setValue(this.defaultUnitFor(p));
    });
    return g;
  }

  private itemGroupFrom(i: QuotationItem, product: Product | null): ItemGroup {
    return this.itemGroup({
      id: i.id,
      product,
      purchase_request_item_id: i.purchase_request_item_id,
      request_number: i.request?.number ?? null,
      unit_id: i.unit_id,
      quantity: Number(i.quantity),
      unit_price: i.unit_price !== null && i.unit_price !== undefined ? Number(i.unit_price) : null,
      tax_rate: Number(i.tax_rate),
      delivery_days: i.delivery_days,
      not_quoted: i.not_quoted,
      notes: i.notes,
    });
  }

  addItem(): void {
    this.itemsArray.push(this.itemGroup());
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
  }

  private unitOptionsFor(p: Product | null): UnitOption[] {
    if (!p) return [];
    const base = p.base_unit?.code ?? 'UND';
    const out: UnitOption[] = [{ id: p.base_unit_id, code: base, label: `${base} (base)`, factor: 1 }];
    for (const u of p.units ?? []) {
      const code = u.unit?.code ?? String(u.unit_id);
      out.push({ id: u.unit_id, code, label: `${code} · 1 = ${this.fmt(u.factor)} ${base}`, factor: Number(u.factor) });
    }
    return out;
  }

  private defaultUnitFor(p: Product | null): number | null {
    if (!p) return null;
    return p.units?.find((u) => u.is_default_purchase)?.unit_id ?? p.base_unit_id;
  }

  // ---------- Traer ítems de solicitudes aprobadas ----------

  openPicker(): void {
    this.pickedIds.set(new Set());
    this.pickerWarehouseId.set(null);
    this.pickerOpen.set(true);
    this.loadPending();
  }

  setPickerWarehouse(id: number | null): void {
    this.pickerWarehouseId.set(id);
    this.pickedIds.set(new Set());
    this.loadPending();
  }

  private loadPending(): void {
    this.pickerLoading.set(true);
    this.api
      .pendingItems({ warehouse_id: this.pickerWarehouseId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.pendingItems.set(list);
          this.pickerLoading.set(false);
        },
        error: () => this.pickerLoading.set(false),
      });
  }

  isPicked(id: number): boolean {
    return this.pickedIds().has(id);
  }

  togglePick(id: number, checked: boolean): void {
    this.pickedIds.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleGroup(g: PendingGroup, checked: boolean): void {
    this.pickedIds.update((set) => {
      const next = new Set(set);
      for (const i of g.items) {
        if (checked) next.add(i.id);
        else next.delete(i.id);
      }
      return next;
    });
  }

  groupAllPicked(g: PendingGroup): boolean {
    const set = this.pickedIds();
    return g.items.length > 0 && g.items.every((i) => set.has(i.id));
  }

  /** Agrega filas por cada ítem marcado: unidad de la solicitud y cantidad pendiente convertida. */
  addPicked(): void {
    const picked = this.pendingItems().filter((i) => this.pickedIds().has(i.id));
    if (!picked.length) return;
    this.pickerAdding.set(true);
    this.loadProducts([...new Set(picked.map((i) => i.product.id))])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          for (const item of picked) {
            const product = products.get(item.product.id) ?? null;
            const factor = Number(item.factor) || 1;
            const qty = Math.round((Number(item.pending_base) / factor) * 10000) / 10000;
            const g = this.itemGroup({
              product,
              purchase_request_item_id: item.id,
              request_number: item.request.number,
              quantity: qty,
              delivery_days: null,
            });
            // La unidad debe ser la de la solicitud (el valueChanges del producto no aplica aquí).
            g.controls.unit_id.setValue(item.unit.id);
            this.itemsArray.push(g);
          }
          this.pickerAdding.set(false);
          this.pickerOpen.set(false);
          this.toast.success(picked.length === 1 ? 'Ítem agregado.' : `${picked.length} ítems agregados.`);
        },
        error: () => this.pickerAdding.set(false),
      });
  }

  // ---------- Guardar ----------

  save(mode: SaveMode = 'draft'): void {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin ítems', 'Agrega al menos un ítem a la cotización.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    const v = this.form.getRawValue();
    const payload: QuotationPayload = {
      supplier_id: v.supplier_id as number,
      date: this.toIsoDate(v.date as Date),
      valid_until: v.valid_until ? this.toIsoDate(v.valid_until) : null,
      notes: v.notes?.trim() || null,
      items: (v.items as ItemValue[]).map((r) => ({
        id: r.id ?? undefined,
        product_id: r.product!.id,
        purchase_request_item_id: r.purchase_request_item_id ?? null,
        unit_id: r.unit_id as number,
        quantity: Number(r.quantity),
        unit_price: r.not_quoted || r.unit_price === null || r.unit_price === undefined ? null : Number(r.unit_price),
        tax_rate: Number(r.tax_rate ?? 0),
        delivery_days: r.delivery_days ?? null,
        not_quoted: !!r.not_quoted,
        notes: r.notes?.trim() || null,
      })),
    };
    const current = this.quotation();
    const req = current ? this.api.updateQuotation(current.id, payload) : this.api.createQuotation(payload);
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        if (mode === 'receive' && saved.status === 'borrador') {
          this.receive(saved);
          return;
        }
        if (mode === 'send' && saved.status === 'borrador') {
          this.saving.set(false);
          this.savedForSend.set(saved);
          this.sendSupplierIds.set([]);
          this.sendOpen.set(true);
          return;
        }
        this.saving.set(false);
        this.toast.success(current ? 'Cotización actualizada.' : 'Cotización creada.', saved.number);
        void this.router.navigate(['/compras/cotizaciones', saved.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.handleError(err);
      },
    });
  }

  private receive(saved: Quotation): void {
    this.api
      .quotationAction(saved.id, 'receive')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          this.saving.set(false);
          this.toast.success('Cotización guardada y marcada como recibida.', q.number);
          void this.router.navigate(['/compras/cotizaciones', q.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.handleError(err);
          // Ya quedó guardada: llevamos al detalle para que pueda marcarla desde allí.
          void this.router.navigate(['/compras/cotizaciones', saved.id]);
        },
      });
  }

  // ---------- Enviar solicitud al proveedor ----------

  /** Cierre del diálogo (X o máscara): la cotización ya quedó guardada, vamos al detalle. */
  onSendVisibleChange(visible: boolean): void {
    if (visible) return;
    this.sendOpen.set(false);
    this.goToSaved();
  }

  cancelSend(): void {
    this.sendOpen.set(false);
    this.goToSaved();
  }

  private goToSaved(): void {
    const q = this.savedForSend();
    this.savedForSend.set(null);
    if (q) {
      this.toast.success('Cotización guardada sin enviar.', q.number);
      void this.router.navigate(['/compras/cotizaciones', q.id]);
    }
  }

  confirmSend(): void {
    const q = this.savedForSend();
    if (!q) return;
    this.sending.set(true);
    this.api
      .sendQuotation(q.id, this.sendSupplierIds())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          this.savedForSend.set(null);
          this.sendOpen.set(false);
          this.toast.success(res.message, q.number);
          if (res.data.length > 1) {
            void this.router.navigate(['/compras/cotizaciones'], { queryParams: { status: 'enviada' } });
          } else {
            void this.router.navigate(['/compras/cotizaciones', q.id]);
          }
        },
        error: (err: unknown) => {
          this.sending.set(false);
          this.handleError(err);
        },
      });
  }

  private handleError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status !== 422) return;
    const body = err.error as Partial<ValidationErrors>;
    if (body.errors && Object.keys(body.errors).length) {
      this.serverErrors.set(body.errors);
      this.toast.warn('Revisa el formulario', body.message);
    } else {
      // Regla de negocio (DomainException): el interceptor no muestra los 422.
      this.toast.error('No se pudo guardar', body.message);
    }
  }

  cancel(): void {
    const current = this.quotation();
    void this.router.navigate(current ? ['/compras/cotizaciones', current.id] : ['/compras/cotizaciones']);
  }

  // ---------- Utilidades de plantilla ----------

  /** Primer error del servidor para un campo (soporta claves anidadas `items.0.unit_price`). */
  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores del servidor de una fila (`items.i.*`) no mostrados junto a un campo. */
  rowErrors(i: number, shown: string[]): string[] {
    const out: string[] = [];
    for (const [key, msgs] of Object.entries(this.serverErrors())) {
      if (!key.startsWith(`items.${i}.`) && key !== `items.${i}`) continue;
      const field = key.slice(`items.${i}.`.length);
      if (shown.includes(field)) continue;
      out.push(...msgs);
    }
    return out;
  }

  showError(g: ItemGroup, field: keyof ItemControls): boolean {
    const c = g.controls[field];
    return c.invalid && (c.touched || this.submitted());
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '';
    return String(Number(n));
  }

  priorityLabel(p: Priority): string {
    return PRIORITY_LABELS[p] ?? p;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private toIsoDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  statusTone = statusTone;
  priorityTone = priorityTone;
}
