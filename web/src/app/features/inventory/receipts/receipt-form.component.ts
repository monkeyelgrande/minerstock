import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ValidationErrors } from '../../../core/models/common.model';
import { GoodsReceipt, GoodsReceiptPayload, ReceivableOrder } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Opción de unidad de una fila (base + alternas del producto). */
interface UnitOption {
  id: number;
  code: string;
  factor: number;
  label: string;
}

/** Datos fijos de una fila (vienen de la orden), paralelos al FormArray. */
interface RowMeta {
  purchase_order_item_id: number;
  product: { id: number; sku: string; name: string; base_unit: string | null };
  units: UnitOption[];
  purchaseUnitId: number;
  qty_base: number;
  qty_received_base: number;
  pending_base: number;
}

/** Valor crudo de una fila del formulario. */
interface ItemRow {
  id: number | null;
  include: boolean;
  purchase_order_item_id: number;
  unit_id: number | null;
  quantity: number | null;
  notes: string | null;
}

/** Cálculos derivados por fila. */
interface RowCalc {
  factor: number;
  base: number;
  max: number;
  issue: string | null;
}

/** Opción del select de órdenes recibibles. */
interface OrderOption {
  id: number;
  label: string;
  order: ReceivableOrder;
}

function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Formulario de recepción de compra: orden emitida, bodega de ingreso y cantidades recibidas por ítem pendiente. */
@Component({
  selector: 'app-receipt-form',
  imports: [
    DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receipt-form.component.html',
})
export class ReceiptFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`recepciones/:id/editar`); undefined en `recepciones/nueva`. */
  readonly id = input<string>();
  /** Query param `?order=` para preseleccionar la orden de compra al crear. */
  readonly order = input<string>();

  readonly receipt = signal<GoodsReceipt | null>(null);
  readonly orders = signal<ReceivableOrder[]>([]);
  readonly meta = signal<RowMeta[]>([]);
  readonly loading = signal(false);
  readonly ordersLoading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.group({
    purchase_order_id: [null as number | null, Validators.required],
    warehouse_id: [null as number | null, Validators.required],
    received_at: [new Date() as Date | null, Validators.required],
    supplier_remission: ['', Validators.maxLength(60)],
    notes: ['', Validators.maxLength(2000)],
    items: this.fb.array<FormGroup>([]),
  });

  /** Valor crudo del formulario como señal (incluye filas excluidas, cuyos controles están deshabilitados). */
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.receipt()?.number ?? 'recepción'}` : 'Nueva recepción'));

  readonly orderOptions = computed<OrderOption[]>(() =>
    this.orders().map((o) => ({
      id: o.id,
      label: `${o.number} · ${o.supplier.name} · ${o.items.length} ítem${o.items.length === 1 ? '' : 's'} pendiente${o.items.length === 1 ? '' : 's'}`,
      order: o,
    })),
  );

  readonly selectedOrder = computed<ReceivableOrder | null>(() => {
    const id = this.formValue().purchase_order_id;
    return this.orders().find((o) => o.id === id) ?? null;
  });

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);

  /** Factor, equivalente en base, máximo permitido y posible exceso por fila. */
  readonly calc = computed<RowCalc[]>(() =>
    this.rows().map((r, i) => {
      const m = this.meta()[i];
      if (!m) return { factor: 1, base: 0, max: 0, issue: null };
      const factor = m.units.find((u) => u.id === r.unit_id)?.factor ?? 1;
      const base = this.round3((r.quantity ?? 0) * factor);
      const max = this.floor3(m.pending_base / factor);
      const issue =
        r.include && base > m.pending_base + 0.0005
          ? `Supera lo pendiente: máx. ${this.fmt(max)} ${m.units.find((u) => u.id === r.unit_id)?.code ?? ''}`.trim()
          : null;
      return { factor, base, max, issue };
    }),
  );

  readonly includedCount = computed(() => this.rows().filter((r) => r.include && (r.quantity ?? 0) > 0).length);
  readonly hasIssues = computed(() => this.calc().some((c) => c.issue));

  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    // Carga según el id de ruta (nueva → editar reutiliza el componente).
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  private load(id: number | null): void {
    this.serverErrors.set({});
    this.formError.set(null);
    this.submitted.set(false);
    if (!id) {
      this.receipt.set(null);
      this.resetForm();
      this.loadOrders();
      return;
    }
    this.loading.set(true);
    this.api
      .receipt(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (!r.is_editable) {
            this.toast.info('Recepción no editable', `${r.number} está en estado "${r.status_label}".`);
            void this.router.navigate(['/inventario/recepciones', r.id]);
            return;
          }
          this.receipt.set(r);
          this.api
            .receivableOrders({ id: r.purchase_order_id })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (orders) => {
                this.orders.set(orders);
                this.patchForm(r, orders[0] ?? null);
                this.loading.set(false);
              },
              error: () => {
                this.orders.set([]);
                this.patchForm(r, null);
                this.loading.set(false);
              },
            });
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/inventario/recepciones']);
        },
      });
  }

  /** Órdenes emitidas / recibidas parcial con ítems pendientes (modo creación). */
  private loadOrders(): void {
    this.ordersLoading.set(true);
    this.api
      .receivableOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          this.orders.set(orders);
          this.ordersLoading.set(false);
          const preset = this.order();
          if (preset && !this.form.controls.purchase_order_id.value) {
            const found = orders.find((o) => o.id === +preset);
            if (found) this.onOrderChange(found.id);
            else this.toast.info('Orden no disponible', 'La orden indicada no tiene ítems pendientes de recibir.');
          }
        },
        error: () => this.ordersLoading.set(false),
      });
  }

  /** Recarga solo la recepción (adjuntos) sin tocar el formulario. */
  reloadReceipt(): void {
    const r = this.receipt();
    if (!r) return;
    this.api
      .receipt(r.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.receipt.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.meta.set([]);
    this.form.reset({ purchase_order_id: null, warehouse_id: null, received_at: new Date(), supplier_remission: '', notes: '' });
    this.form.controls.purchase_order_id.enable();
  }

  /** Modo edición: mezcla los ítems guardados con los pendientes actuales de la orden (unidades, pendiente). */
  private patchForm(r: GoodsReceipt, order: ReceivableOrder | null): void {
    this.itemsArray.clear();
    const metas: RowMeta[] = [];
    const saved = new Map((r.items ?? []).map((it) => [it.purchase_order_item_id, it]));
    const seen = new Set<number>();

    for (const oi of order?.items ?? []) {
      seen.add(oi.id);
      const it = saved.get(oi.id);
      const m = this.metaFromOrderItem(oi);
      metas.push(m);
      this.itemsArray.push(
        this.itemGroup(
          it
            ? { id: it.id, include: true, purchase_order_item_id: oi.id, unit_id: it.unit_id, quantity: Number(it.quantity), notes: it.notes ?? '' }
            : { include: false, purchase_order_item_id: oi.id, unit_id: oi.unit.id, quantity: this.floor3(oi.pending_base / (Number(oi.factor) || 1)), notes: '' },
        ),
      );
    }
    // Ítems del borrador cuyo pendiente ya fue cubierto por otras recepciones (se conservan para poder corregirlos).
    for (const it of r.items ?? []) {
      if (seen.has(it.purchase_order_item_id)) continue;
      const unitCode = it.unit?.code ?? '—';
      const base = it.product?.base_unit ?? null;
      const factor = Number(it.factor) || 1;
      metas.push({
        purchase_order_item_id: it.purchase_order_item_id,
        product: { id: it.product_id, sku: it.product?.sku ?? '', name: it.product?.name ?? `Producto #${it.product_id}`, base_unit: base },
        units: [{ id: it.unit_id, code: unitCode, factor, label: this.unitLabel(unitCode, factor, base) }],
        purchaseUnitId: it.unit_id,
        qty_base: Number(it.order_item?.qty_base ?? 0),
        qty_received_base: Number(it.order_item?.qty_received_base ?? 0),
        pending_base: Number(it.order_item?.pending_base ?? 0),
      });
      this.itemsArray.push(
        this.itemGroup({ id: it.id, include: true, purchase_order_item_id: it.purchase_order_item_id, unit_id: it.unit_id, quantity: Number(it.quantity), notes: it.notes ?? '' }),
      );
    }
    this.meta.set(metas);

    this.form.patchValue({
      purchase_order_id: r.purchase_order_id,
      warehouse_id: r.warehouse_id,
      received_at: this.parseDate(r.received_at) ?? new Date(),
      supplier_remission: r.supplier_remission ?? '',
      notes: r.notes ?? '',
    });
    this.form.controls.purchase_order_id.disable();
    this.form.markAsPristine();
  }

  // ---------- Orden ----------

  /** Al elegir orden (creando): bodega de la orden y filas desde sus ítems pendientes. */
  onOrderChange(id: number | null): void {
    this.form.controls.purchase_order_id.setValue(id);
    const o = this.orders().find((x) => x.id === id) ?? null;
    this.itemsArray.clear();
    if (!o) {
      this.meta.set([]);
      return;
    }
    this.form.controls.warehouse_id.setValue(o.warehouse.id);
    const metas: RowMeta[] = [];
    for (const oi of o.items) {
      metas.push(this.metaFromOrderItem(oi));
      this.itemsArray.push(
        this.itemGroup({
          include: true,
          purchase_order_item_id: oi.id,
          unit_id: oi.unit.id,
          quantity: this.floor3(oi.pending_base / (Number(oi.factor) || 1)),
          notes: '',
        }),
      );
    }
    this.meta.set(metas);
  }

  private metaFromOrderItem(oi: ReceivableOrder['items'][number]): RowMeta {
    const base = oi.product.base_unit ?? null;
    const units = oi.units.map<UnitOption>((u) => ({ id: u.id, code: u.code, factor: Number(u.factor) || 1, label: this.unitLabel(u.code, Number(u.factor) || 1, base) }));
    // Garantiza que la unidad de compra esté disponible aunque no figure entre las del producto.
    if (!units.some((u) => u.id === oi.unit.id)) {
      const factor = Number(oi.factor) || 1;
      units.push({ id: oi.unit.id, code: oi.unit.code, factor, label: this.unitLabel(oi.unit.code, factor, base) });
    }
    return {
      purchase_order_item_id: oi.id,
      product: { id: oi.product.id, sku: oi.product.sku, name: oi.product.name, base_unit: base },
      units,
      purchaseUnitId: oi.unit.id,
      qty_base: Number(oi.qty_base),
      qty_received_base: Number(oi.qty_received_base),
      pending_base: Number(oi.pending_base),
    };
  }

  private unitLabel(code: string, factor: number, base: string | null): string {
    return factor === 1 ? code : `${code} (= ${this.fmt(factor)} ${base ?? ''})`.trim();
  }

  // ---------- Ítems ----------

  private itemGroup(init: Partial<ItemRow>): FormGroup {
    const include = init.include ?? true;
    const g = this.fb.group({
      id: [init.id ?? null],
      include: [include],
      purchase_order_item_id: [init.purchase_order_item_id ?? null],
      unit_id: [{ value: init.unit_id ?? null, disabled: !include }, Validators.required],
      quantity: [{ value: init.quantity ?? null, disabled: !include }, [Validators.required, Validators.min(0.001)]],
      notes: [{ value: init.notes ?? '', disabled: !include }, Validators.maxLength(255)],
    });
    return g;
  }

  /** Incluir / excluir una línea: las excluidas no se envían ni se validan. */
  onIncludeChange(i: number, checked: boolean): void {
    const g = this.itemsArray.at(i);
    for (const key of ['unit_id', 'quantity', 'notes']) {
      if (checked) g.controls[key].enable();
      else g.controls[key].disable();
    }
  }

  /** Al cambiar la unidad se propone de nuevo el pendiente convertido a esa unidad. */
  onUnitChange(i: number, unitId: number | null): void {
    const m = this.meta()[i];
    const unit = m?.units.find((u) => u.id === unitId);
    if (!m || !unit) return;
    this.itemsArray.at(i).controls['quantity'].setValue(this.floor3(m.pending_base / unit.factor));
  }

  // ---------- Guardar ----------

  /** Guarda el borrador; con `andConfirm` pide confirmación y luego ingresa la mercancía al stock. */
  save(andConfirm = false): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar o cantidades no válidas.');
      return;
    }
    if (!this.includedCount()) {
      this.toast.warn('Sin ítems', 'Incluye al menos una línea con cantidad recibida mayor que 0.');
      return;
    }
    if (this.hasIssues()) {
      this.toast.warn('Cantidades no válidas', 'Hay líneas que superan lo pendiente de la orden.');
      return;
    }
    if (!andConfirm) {
      this.persist(false);
      return;
    }
    this.confirm.confirm({
      header: 'Guardar y confirmar',
      message: 'Confirmar ingresa la mercancía al stock y la recepción no se puede editar después. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar recepción',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.persist(true),
    });
  }

  private persist(andConfirm: boolean): void {
    this.saving.set(true);
    this.serverErrors.set({});
    const { payload, rowIndexes } = this.toPayload();
    const current = this.receipt();
    const save$ = current ? this.api.updateReceipt(current.id, payload) : this.api.createReceipt(payload);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.form.markAsPristine();
        if (!andConfirm) {
          this.saving.set(false);
          this.toast.success(current ? 'Recepción actualizada.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/inventario/recepciones', saved.id]);
          return;
        }
        this.api
          .receiptAction(saved.id, 'confirm')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (confirmed) => {
              this.saving.set(false);
              this.toast.success('Recepción confirmada.', `${confirmed.number} · mercancía ingresada al stock.`);
              void this.router.navigate(['/inventario/recepciones', confirmed.id]);
            },
            error: (err: unknown) => {
              this.saving.set(false);
              this.toast.warn('Borrador guardado, pero no se pudo confirmar', this.messageOf(err));
              void this.router.navigate(['/inventario/recepciones', saved.id]);
            },
          });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse && err.status === 422) {
          const body = err.error as Partial<ValidationErrors>;
          if (body.errors) {
            this.serverErrors.set(this.remapItemErrors(body.errors, rowIndexes));
            this.toast.warn('Revisa el formulario', body.message);
          } else {
            this.formError.set(body.message ?? 'No se pudo guardar la recepción.');
            this.toast.warn('No se pudo guardar', body.message);
          }
        }
      },
    });
  }

  private toPayload(): { payload: GoodsReceiptPayload; rowIndexes: number[] } {
    const v = this.form.getRawValue();
    const rowIndexes: number[] = [];
    const items: GoodsReceiptPayload['items'] = [];
    (v.items as ItemRow[]).forEach((r, i) => {
      if (!r.include || !(r.quantity ?? 0)) return;
      rowIndexes.push(i);
      items.push({
        id: r.id ?? undefined,
        purchase_order_item_id: r.purchase_order_item_id,
        unit_id: r.unit_id ?? null,
        quantity: Number(r.quantity),
        notes: r.notes?.trim() || null,
      });
    });
    return {
      payload: {
        purchase_order_id: v.purchase_order_id as number,
        warehouse_id: v.warehouse_id ?? null,
        supplier_remission: v.supplier_remission?.trim() || null,
        received_at: this.toIso(v.received_at) ?? '',
        notes: v.notes?.trim() || null,
        items,
      },
      rowIndexes,
    };
  }

  /** Reindexa `items.N.*` del servidor (índice del payload) al índice de fila del formulario. */
  private remapItemErrors(errors: Record<string, string[]>, rowIndexes: number[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(errors)) {
      const m = /^items\.(\d+)(\..+)?$/.exec(key);
      if (!m) {
        out[key] = msgs;
        continue;
      }
      const row = rowIndexes[Number(m[1])];
      out[row === undefined ? key : `items.${row}${m[2] ?? ''}`] = msgs;
    }
    return out;
  }

  private messageOf(err: unknown): string | undefined {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const body = err.error as { message?: string; errors?: Record<string, string[]> };
      return (body.errors ? Object.values(body.errors)[0]?.[0] : undefined) ?? body.message;
    }
    return undefined;
  }

  cancel(): void {
    const r = this.receipt();
    void this.router.navigate(r ? ['/inventario/recepciones', r.id] : ['/inventario/recepciones']);
  }

  // ---------- Utilidades ----------

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores del servidor de una fila (ej. `items.0.*`), excluyendo los ya mostrados por campo. */
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

  showError(g: FormGroup, field: string): boolean {
    const c = g.controls[field];
    return !!c && c.enabled && c.invalid && (c.touched || this.submitted());
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
  }

  docTone = docTone;

  private round3(n: number): number {
    return Math.round(n * 1000) / 1000;
  }

  /** Redondeo hacia abajo a 3 decimales: garantiza que el equivalente en base no supere el pendiente. */
  private floor3(n: number): number {
    return Math.floor(n * 1000 + 1e-6) / 1000;
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
