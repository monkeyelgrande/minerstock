import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { AdminApi } from '../../../core/api/admin-api.service';
import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Product, Supplier } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { PendingRequestItem, PurchaseOrder, PurchaseOrderPayload, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Opción de unidad de una fila (unidad base + alternas del producto). */
interface UnitOption {
  id: number;
  code: string;
  factor: number;
  label: string;
  isDefault: boolean;
}

/** Valor crudo de una fila de ítem. */
interface ItemRow {
  id: number | null;
  product: Product | null;
  purchase_request_item_id: number | null;
  quotation_item_id: number | null;
  request_number: string | null;
  unit_id: number | null;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  notes: string | null;
}

type PaymentTerms = 'contado' | 'credito';

/** Formulario de orden de compra: proveedor y condiciones, ítems (manuales o desde solicitudes aprobadas) y totales. */
@Component({
  selector: 'app-order-form',
  imports: [
    CurrencyPipe, FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule, DialogModule,
    InputNumberModule, InputTextModule, SelectModule, SelectButtonModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-form.component.html',
})
export class OrderFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly admin = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`ordenes/:id/editar`); undefined en `ordenes/nueva`. */
  readonly id = input<string>();

  readonly order = signal<PurchaseOrder | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly suppliers = signal<Supplier[]>([]);
  readonly defaultTaxRate = signal(19);

  // Diálogo "Traer ítems de solicitudes aprobadas"
  readonly pendingOpen = signal(false);
  readonly pendingLoading = signal(false);
  readonly pendingAdding = signal(false);
  readonly pendingItems = signal<PendingRequestItem[]>([]);
  readonly pendingSelected = signal<Set<number>>(new Set());
  readonly pendingSearch = signal('');
  readonly pendingOnlyWarehouse = signal(true);

  readonly paymentOptions: { label: string; value: PaymentTerms }[] = [
    { label: 'Contado', value: 'contado' },
    { label: 'Crédito', value: 'credito' },
  ];

  readonly form = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    warehouse_id: [null as number | null, Validators.required],
    date: [new Date() as Date | null, Validators.required],
    expected_date: [null as Date | null],
    payment_terms: ['contado' as PaymentTerms, Validators.required],
    payment_days: [0 as number | null, [Validators.min(0), Validators.max(365)]],
    notes: [''],
    items: this.fb.array<FormGroup>([]),
  });

  /** Valor crudo del formulario como señal (incluye controles deshabilitados, p. ej. producto vinculado). */
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.order()?.number ?? 'orden'}` : 'Nueva orden de compra'));
  readonly isCredit = computed(() => this.formValue().payment_terms === 'credito');

  readonly taxOptions = computed(() => {
    const rates = new Set([0, 5, 19, this.defaultTaxRate()]);
    return [...rates].sort((a, b) => a - b).map((r) => ({ label: `${r} %`, value: r }));
  });

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);

  /** Opciones de unidad por fila: unidad base + alternas del producto elegido. */
  readonly unitOptionsByRow = computed(() => this.rows().map((r) => this.unitOptions(r.product)));

  /** Subtotal por fila (cantidad × precio). */
  readonly lineTotals = computed(() => this.rows().map((r) => this.round2((r.quantity ?? 0) * (r.unit_price ?? 0))));

  readonly totals = computed(() => {
    const rows = this.rows();
    const lines = this.lineTotals();
    let subtotal = 0;
    let tax = 0;
    rows.forEach((r, i) => {
      subtotal += lines[i];
      tax += this.round2((lines[i] * (r.tax_rate ?? 0)) / 100);
    });
    subtotal = this.round2(subtotal);
    tax = this.round2(tax);
    return { subtotal, tax, total: this.round2(subtotal + tax) };
  });

  /** Ítems pendientes visibles en el diálogo (excluye los ya agregados y aplica filtros). */
  readonly pendingVisible = computed(() => {
    const linked = new Set(this.rows().map((r) => r.purchase_request_item_id).filter((x): x is number => x !== null));
    const q = this.pendingSearch().trim().toLowerCase();
    const wh = this.pendingOnlyWarehouse() ? this.formValue().warehouse_id : null;
    return this.pendingItems().filter((it) => {
      if (linked.has(it.id)) return false;
      if (wh && it.request.warehouse.id !== wh) return false;
      if (!q) return true;
      return (
        it.product.name.toLowerCase().includes(q) ||
        it.product.sku.toLowerCase().includes(q) ||
        it.request.number.toLowerCase().includes(q)
      );
    });
  });

  readonly pendingAllChecked = computed(() => {
    const visible = this.pendingVisible();
    const sel = this.pendingSelected();
    return visible.length > 0 && visible.every((it) => sel.has(it.id));
  });

  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));

    if (this.auth.can('settings.view')) {
      this.admin
        .settings()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (s) => {
            const rate = Number(s.default_tax_rate);
            if (!Number.isNaN(rate)) this.defaultTaxRate.set(rate);
          },
          error: () => void 0,
        });
    }

    // Carga la orden cuando cambia el id de ruta (nueva → editar reutiliza el componente).
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });

    // Bodega por defecto: la activa en la topbar (solo al crear y si aún no se eligió).
    effect(() => {
      const active = this.ctx.activeId();
      untracked(() => {
        if (!this.isEdit() && active && !this.form.controls.warehouse_id.value) {
          this.form.controls.warehouse_id.setValue(active);
        }
      });
    });
  }

  // ---------- Carga ----------

  private load(id: number | null): void {
    this.serverErrors.set({});
    this.submitted.set(false);
    if (!id) {
      this.order.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .order(id)
      .pipe(
        switchMap((o) => this.productsFor((o.items ?? []).map((i) => i.product_id)).pipe(map((products) => ({ o, products })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ o, products }) => {
          if (!o.is_editable) {
            this.toast.info('Orden no editable', `${o.number} está en estado "${o.status_label}".`);
            void this.router.navigate(['/compras/ordenes', o.id]);
            return;
          }
          this.order.set(o);
          this.patchForm(o, products);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/ordenes']);
        },
      });
  }

  /** Recarga solo la orden (adjuntos) sin tocar el formulario. */
  reloadOrder(): void {
    const o = this.order();
    if (!o) return;
    this.api
      .order(o.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.order.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({
      supplier_id: null,
      warehouse_id: this.ctx.activeId(),
      date: new Date(),
      expected_date: null,
      payment_terms: 'contado',
      payment_days: 0,
      notes: '',
    });
  }

  private patchForm(o: PurchaseOrder, products: Map<number, Product>): void {
    this.itemsArray.clear();
    for (const it of o.items ?? []) {
      this.itemsArray.push(
        this.itemGroup({
          id: it.id,
          product: products.get(it.product_id) ?? null,
          purchase_request_item_id: it.purchase_request_item_id,
          quotation_item_id: it.quotation_item_id,
          request_number: it.request?.number ?? null,
          unit_id: it.unit_id,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          tax_rate: Number(it.tax_rate),
          notes: it.notes ?? '',
        }),
      );
    }
    this.form.patchValue({
      supplier_id: o.supplier_id,
      warehouse_id: o.warehouse_id,
      date: this.parseDate(o.date) ?? new Date(),
      expected_date: this.parseDate(o.expected_date),
      payment_terms: o.payment_terms ?? 'contado',
      payment_days: Number(o.payment_days ?? 0),
      notes: o.notes ?? '',
    });
    this.form.markAsPristine();
  }

  /** Carga los productos completos (unidades) de una lista de ids. */
  private productsFor(ids: number[]): Observable<Map<number, Product>> {
    const distinct = [...new Set(ids)];
    if (!distinct.length) return of(new Map<number, Product>());
    return forkJoin(distinct.map((id) => this.catalog.products.get(id))).pipe(
      map((list) => new Map(list.map((p) => [p.id, p]))),
    );
  }

  // ---------- Proveedor / condiciones ----------

  /** Al elegir proveedor (creando) se proponen sus condiciones de pago. */
  onSupplierChange(id: number | null): void {
    if (this.isEdit()) return;
    const s = this.suppliers().find((x) => x.id === id);
    if (!s) return;
    const days = Number(s.payment_terms_days ?? 0);
    this.form.patchValue({ payment_terms: days > 0 ? 'credito' : 'contado', payment_days: days > 0 ? days : 0 });
  }

  onPaymentTermsChange(terms: PaymentTerms): void {
    if (terms === 'contado') this.form.controls.payment_days.setValue(0);
    else if (!this.form.controls.payment_days.value) {
      const s = this.suppliers().find((x) => x.id === this.form.controls.supplier_id.value);
      this.form.controls.payment_days.setValue(Number(s?.payment_terms_days) || 30);
    }
  }

  // ---------- Ítems ----------

  private itemGroup(init: Partial<ItemRow> = {}): FormGroup {
    const linked = !!init.purchase_request_item_id;
    const g = this.fb.group({
      id: [init.id ?? null],
      product: [{ value: init.product ?? null, disabled: linked }, Validators.required],
      purchase_request_item_id: [init.purchase_request_item_id ?? null],
      quotation_item_id: [init.quotation_item_id ?? null],
      request_number: [init.request_number ?? null],
      unit_id: [init.unit_id ?? null, Validators.required],
      quantity: [init.quantity ?? null, [Validators.required, Validators.min(0.0001)]],
      unit_price: [init.unit_price ?? null, [Validators.required, Validators.min(0)]],
      tax_rate: [init.tax_rate ?? this.defaultTaxRate()],
      notes: [init.notes ?? ''],
    });
    // Al cambiar el producto se propone la unidad de compra por defecto (o la base).
    g.controls['product'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p: Product | null) => {
      const opts = this.unitOptions(p);
      const def = opts.find((u) => u.isDefault) ?? opts[0] ?? null;
      g.controls['unit_id'].setValue(def?.id ?? null);
    });
    return g;
  }

  addItem(): void {
    this.itemsArray.push(this.itemGroup());
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
  }

  unitOptions(p: Product | null): UnitOption[] {
    if (!p) return [];
    const baseCode = p.base_unit?.code ?? 'UND';
    const base: UnitOption = { id: p.base_unit_id, code: baseCode, factor: 1, label: baseCode, isDefault: false };
    const alts = (p.units ?? []).map<UnitOption>((u) => {
      const code = u.unit?.code ?? String(u.unit_id);
      const factor = Number(u.factor);
      return { id: u.unit_id, code, factor, label: `${code} (${this.fmt(factor)} ${baseCode})`, isDefault: !!u.is_default_purchase };
    });
    return [base, ...alts];
  }

  /** Cantidad en unidad base de una fila, para mostrar "= 24 UND". */
  baseHint(i: number): string {
    const r = this.rows()[i];
    if (!r?.product || !r.unit_id || !r.quantity) return '';
    const unit = this.unitOptionsByRow()[i]?.find((u) => u.id === r.unit_id);
    if (!unit || unit.factor === 1) return '';
    return `= ${this.fmt(this.round3(r.quantity * unit.factor))} ${r.product.base_unit?.code ?? ''}`;
  }

  // ---------- Ítems desde solicitudes aprobadas ----------

  openPending(): void {
    this.pendingOpen.set(true);
    this.pendingSelected.set(new Set());
    this.pendingSearch.set('');
    this.pendingLoading.set(true);
    this.api
      .pendingItems()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.pendingItems.set(list);
          this.pendingLoading.set(false);
        },
        error: () => this.pendingLoading.set(false),
      });
  }

  togglePending(id: number, checked: boolean): void {
    const next = new Set(this.pendingSelected());
    if (checked) next.add(id);
    else next.delete(id);
    this.pendingSelected.set(next);
  }

  togglePendingAll(checked: boolean): void {
    const next = new Set(this.pendingSelected());
    for (const it of this.pendingVisible()) {
      if (checked) next.add(it.id);
      else next.delete(it.id);
    }
    this.pendingSelected.set(next);
  }

  addPending(): void {
    const sel = this.pendingSelected();
    const items = this.pendingItems().filter((it) => sel.has(it.id));
    if (!items.length) return;
    this.pendingAdding.set(true);
    this.productsFor(items.map((it) => it.product.id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          for (const it of items) {
            const product = products.get(it.product.id) ?? null;
            const factor = Number(it.factor) || 1;
            this.itemsArray.push(
              this.itemGroup({
                product,
                purchase_request_item_id: it.id,
                request_number: it.request.number,
                unit_id: it.unit.id,
                quantity: this.round3(Number(it.pending_base) / factor),
                unit_price: null,
                tax_rate: this.defaultTaxRate(),
                notes: it.notes ?? '',
              }),
            );
          }
          this.pendingAdding.set(false);
          this.pendingOpen.set(false);
          this.toast.success(items.length === 1 ? 'Ítem agregado.' : `${items.length} ítems agregados.`, 'Completa el precio unitario de cada línea.');
        },
        error: () => this.pendingAdding.set(false),
      });
  }

  // ---------- Guardar ----------

  /** Guarda (crear/actualizar); con `andSubmit` la envía a aprobación al terminar. */
  save(andSubmit = false): void {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin ítems', 'Agrega al menos un ítem a la orden.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    const payload = this.toPayload();
    const current = this.order();
    const save$ = current ? this.api.updateOrder(current.id, payload) : this.api.createOrder(payload);
    save$
      .pipe(
        switchMap((saved) => (andSubmit ? this.api.orderAction(saved.id, 'submit') : of(saved))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          if (andSubmit) this.toast.success('Orden enviada a aprobación.', saved.number);
          else this.toast.success(current ? 'Orden actualizada.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/compras/ordenes', saved.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as Partial<ValidationErrors>;
            this.serverErrors.set(body.errors ?? {});
            this.toast.warn(body.errors ? 'Revisa el formulario' : 'No se pudo guardar', body.message);
          }
        },
      });
  }

  private toPayload(): PurchaseOrderPayload {
    const v = this.form.getRawValue();
    const terms = (v.payment_terms ?? 'contado') as PaymentTerms;
    return {
      supplier_id: v.supplier_id as number,
      warehouse_id: v.warehouse_id as number,
      date: this.toIso(v.date) ?? '',
      expected_date: this.toIso(v.expected_date) ?? null,
      payment_terms: terms,
      payment_days: terms === 'credito' ? Number(v.payment_days ?? 0) : 0,
      notes: v.notes?.trim() || null,
      items: (v.items as ItemRow[]).map((r) => ({
        id: r.id ?? undefined,
        product_id: r.product?.id as number,
        purchase_request_item_id: r.purchase_request_item_id ?? null,
        quotation_item_id: r.quotation_item_id ?? null,
        unit_id: r.unit_id as number,
        quantity: Number(r.quantity ?? 0),
        unit_price: Number(r.unit_price ?? 0),
        tax_rate: Number(r.tax_rate ?? 0),
        notes: r.notes?.trim() || null,
      })),
    };
  }

  cancel(): void {
    const o = this.order();
    void this.router.navigate(o ? ['/compras/ordenes', o.id] : ['/compras/ordenes']);
  }

  // ---------- Utilidades ----------

  /** Primer error del servidor para un campo (soporta claves anidadas `items.0.quantity`). */
  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores del servidor de una fila (ej. `items.0.*`), excluyendo los ya mostrados por campo. */
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

  showError(g: FormGroup, field: string): boolean {
    const c = g.controls[field];
    return !!c && c.invalid && (c.touched || this.submitted());
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '';
    return String(Number(n));
  }

  statusTone = statusTone;

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private round3(n: number): number {
    return Math.round(n * 1000) / 1000;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private toIso(d: Date | null | undefined): string | undefined {
    if (!(d instanceof Date)) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
