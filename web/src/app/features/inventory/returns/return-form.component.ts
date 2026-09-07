import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
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
import { map, switchMap } from 'rxjs';

import { InventoryApi } from '../../../core/api/inventory-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ValidationErrors } from '../../../core/models/common.model';
import { GoodsReceipt, SupplierReturn, SupplierReturnPayload, SupplierReturnReason } from '../../../core/models/inventory.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Datos fijos de una fila (vienen de la recepción), paralelos al FormArray. */
interface RowMeta {
  goods_receipt_item_id: number;
  product: { id: number; sku: string; name: string; base_unit: string | null };
  qty_base: number;
  qty_returned_base: number;
  returnable_base: number;
  unit_cost_base: number;
}

/** Valor crudo de una fila del formulario. */
interface ItemRow {
  id: number | null;
  include: boolean;
  goods_receipt_item_id: number;
  qty_base: number | null;
  notes: string | null;
}

interface RowCalc {
  value: number;
  issue: string | null;
}

/** Opción del select de recepciones confirmadas. */
interface ReceiptOption {
  id: number;
  label: string;
  receipt: GoodsReceipt;
}

function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/** Formulario de devolución a proveedor: recepción confirmada de origen, motivo y cantidades a devolver en unidad base. */
@Component({
  selector: 'app-return-form',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './return-form.component.html',
})
export class ReturnFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  /** Id de ruta (`devoluciones/:id/editar`); undefined en `devoluciones/nueva`. */
  readonly id = input<string>();
  /** Query param `?receipt=` para preseleccionar la recepción de origen al crear. */
  readonly receipt = input<string>();

  readonly doc = signal<SupplierReturn | null>(null);
  readonly sourceReceipt = signal<GoodsReceipt | null>(null);
  readonly receiptOptions = signal<ReceiptOption[]>([]);
  readonly reasons = signal<{ value: SupplierReturnReason; label: string }[]>([]);
  readonly meta = signal<RowMeta[]>([]);
  readonly loading = signal(false);
  readonly receiptsLoading = signal(false);
  readonly itemsLoading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.group({
    goods_receipt_id: [null as number | null, Validators.required],
    date: [new Date() as Date | null, Validators.required],
    reason: [null as SupplierReturnReason | null, Validators.required],
    notes: ['', Validators.maxLength(2000)],
    items: this.fb.array<FormGroup>([]),
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.doc()?.number ?? 'devolución'}` : 'Nueva devolución'));

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);

  readonly calc = computed<RowCalc[]>(() =>
    this.rows().map((r, i) => {
      const m = this.meta()[i];
      if (!m) return { value: 0, issue: null };
      const qty = r.qty_base ?? 0;
      const issue = r.include && qty > m.returnable_base + 0.0005 ? `Supera lo disponible: máx. ${this.fmt(m.returnable_base)} ${m.product.base_unit ?? ''}`.trim() : null;
      return { value: Math.round(qty * m.unit_cost_base * 100) / 100, issue };
    }),
  );

  readonly includedCount = computed(() => this.rows().filter((r) => r.include && (r.qty_base ?? 0) > 0).length);
  readonly hasIssues = computed(() => this.calc().some((c) => c.issue));
  readonly total = computed(() => {
    const rows = this.rows();
    return this.calc().reduce((sum, c, i) => sum + (rows[i]?.include ? c.value : 0), 0);
  });

  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.api
      .returnReasons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.reasons.set(Object.entries(r ?? {}).map(([value, label]) => ({ value: value as SupplierReturnReason, label }))));

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
      this.doc.set(null);
      this.resetForm();
      this.loadReceipts();
      return;
    }
    this.loading.set(true);
    this.api
      .supplierReturn(id)
      .pipe(
        switchMap((d) => this.api.receipt(d.goods_receipt_id).pipe(map((r) => ({ d, r })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ d, r }) => {
          if (!d.is_editable) {
            this.toast.info('Devolución no editable', `${d.number} está en estado "${d.status_label}".`);
            void this.router.navigate(['/inventario/devoluciones', d.id]);
            return;
          }
          this.doc.set(d);
          this.sourceReceipt.set(r);
          this.receiptOptions.set([this.toOption(r)]);
          this.patchForm(d, r);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/inventario/devoluciones']);
        },
      });
  }

  /** Recepciones confirmadas (modo creación). */
  private loadReceipts(): void {
    this.receiptsLoading.set(true);
    this.api
      .receipts({ status: 'confirmado', per_page: 100, sort: 'received_at', dir: 'desc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.receiptOptions.set(res.data.map((r) => this.toOption(r)));
          this.receiptsLoading.set(false);
          const preset = this.receipt();
          if (preset && !this.form.controls.goods_receipt_id.value) {
            if (res.data.some((r) => r.id === +preset)) this.onReceiptChange(+preset);
            else this.toast.info('Recepción no disponible', 'La recepción indicada no está confirmada.');
          }
        },
        error: () => this.receiptsLoading.set(false),
      });
  }

  private toOption(r: GoodsReceipt): ReceiptOption {
    return { id: r.id, label: `${r.number} · ${r.order?.number ?? 'OC'} · ${r.order?.supplier?.name ?? '—'}`, receipt: r };
  }

  /** Recarga solo la devolución (adjuntos) sin tocar el formulario. */
  reloadDoc(): void {
    const d = this.doc();
    if (!d) return;
    this.api
      .supplierReturn(d.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.doc.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.meta.set([]);
    this.sourceReceipt.set(null);
    this.form.reset({ goods_receipt_id: null, date: new Date(), reason: null, notes: '' });
    this.form.controls.goods_receipt_id.enable();
  }

  private patchForm(d: SupplierReturn, r: GoodsReceipt): void {
    const saved = new Map((d.items ?? []).map((it) => [it.goods_receipt_item_id, it]));
    this.buildRows(r, (m) => {
      const it = saved.get(m.goods_receipt_item_id);
      return it ? { id: it.id, include: true, qty_base: Number(it.qty_base), notes: it.notes ?? '' } : { include: false, qty_base: null, notes: '' };
    });
    this.form.patchValue({
      goods_receipt_id: d.goods_receipt_id,
      date: this.parseDate(d.date) ?? new Date(),
      reason: d.reason,
      notes: d.notes ?? '',
    });
    this.form.controls.goods_receipt_id.disable();
    this.form.markAsPristine();
  }

  // ---------- Recepción de origen ----------

  onReceiptChange(id: number | null): void {
    this.form.controls.goods_receipt_id.setValue(id);
    this.itemsArray.clear();
    this.meta.set([]);
    this.sourceReceipt.set(null);
    if (!id) return;
    this.itemsLoading.set(true);
    this.api
      .receipt(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          // Evita aplicar una respuesta tardía si el usuario cambió de recepción.
          if (this.form.controls.goods_receipt_id.value !== id) return;
          this.sourceReceipt.set(r);
          this.buildRows(r, () => ({ include: false, qty_base: null, notes: '' }));
          this.itemsLoading.set(false);
        },
        error: () => this.itemsLoading.set(false),
      });
  }

  private buildRows(r: GoodsReceipt, init: (m: RowMeta) => Partial<ItemRow>): void {
    this.itemsArray.clear();
    const metas: RowMeta[] = [];
    for (const it of r.items ?? []) {
      const m: RowMeta = {
        goods_receipt_item_id: it.id,
        product: { id: it.product_id, sku: it.product?.sku ?? '', name: it.product?.name ?? `Producto #${it.product_id}`, base_unit: it.product?.base_unit ?? null },
        qty_base: Number(it.qty_base),
        qty_returned_base: Number(it.qty_returned_base),
        returnable_base: Number(it.returnable_base),
        unit_cost_base: Number(it.unit_cost_base),
      };
      metas.push(m);
      const row = init(m);
      // Sin disponible no se puede incluir la línea (salvo que ya esté en el borrador).
      this.itemsArray.push(this.itemGroup({ goods_receipt_item_id: it.id, ...row }, m.returnable_base <= 0 && !row.include));
    }
    this.meta.set(metas);
  }

  // ---------- Ítems ----------

  private itemGroup(init: Partial<ItemRow>, lockInclude = false): FormGroup {
    const include = init.include ?? false;
    return this.fb.group({
      id: [init.id ?? null],
      include: [{ value: include, disabled: lockInclude }],
      goods_receipt_item_id: [init.goods_receipt_item_id ?? null],
      qty_base: [{ value: init.qty_base ?? null, disabled: !include }, [Validators.required, Validators.min(0.001)]],
      notes: [{ value: init.notes ?? '', disabled: !include }, Validators.maxLength(255)],
    });
  }

  /** Incluir / excluir una línea; al incluir se propone todo lo disponible. */
  onIncludeChange(i: number, checked: boolean): void {
    const g = this.itemsArray.at(i);
    const qty = g.controls['qty_base'];
    if (checked) {
      qty.enable();
      g.controls['notes'].enable();
      if (!qty.value) qty.setValue(this.meta()[i]?.returnable_base ?? null);
    } else {
      qty.disable();
      g.controls['notes'].disable();
    }
  }

  // ---------- Guardar ----------

  save(andConfirm = false): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar o cantidades no válidas.');
      return;
    }
    if (!this.includedCount()) {
      this.toast.warn('Sin ítems', 'Incluye al menos una línea con cantidad a devolver mayor que 0.');
      return;
    }
    if (this.hasIssues()) {
      this.toast.warn('Cantidades no válidas', 'Hay líneas que superan lo disponible para devolver.');
      return;
    }
    if (!andConfirm) {
      this.persist(false);
      return;
    }
    this.confirm.confirm({
      header: 'Guardar y confirmar',
      message: 'Confirmar descuenta la mercancía del stock y la devolución no se puede editar después. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar devolución',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.persist(true),
    });
  }

  private persist(andConfirm: boolean): void {
    this.saving.set(true);
    this.serverErrors.set({});
    const { payload, rowIndexes } = this.toPayload();
    const current = this.doc();
    const save$ = current ? this.api.updateReturn(current.id, payload) : this.api.createReturn(payload);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.form.markAsPristine();
        if (!andConfirm) {
          this.saving.set(false);
          this.toast.success(current ? 'Devolución actualizada.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/inventario/devoluciones', saved.id]);
          return;
        }
        this.api
          .returnAction(saved.id, 'confirm')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (confirmed) => {
              this.saving.set(false);
              this.toast.success('Devolución confirmada.', `${confirmed.number} · mercancía descontada del stock.`);
              void this.router.navigate(['/inventario/devoluciones', confirmed.id]);
            },
            error: (err: unknown) => {
              this.saving.set(false);
              this.toast.warn('Borrador guardado, pero no se pudo confirmar', this.messageOf(err));
              void this.router.navigate(['/inventario/devoluciones', saved.id]);
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
            this.formError.set(body.message ?? 'No se pudo guardar la devolución.');
            this.toast.warn('No se pudo guardar', body.message);
          }
        }
      },
    });
  }

  private toPayload(): { payload: SupplierReturnPayload; rowIndexes: number[] } {
    const v = this.form.getRawValue();
    const rowIndexes: number[] = [];
    const items: SupplierReturnPayload['items'] = [];
    (v.items as ItemRow[]).forEach((r, i) => {
      if (!r.include || !(r.qty_base ?? 0)) return;
      rowIndexes.push(i);
      items.push({ id: r.id ?? undefined, goods_receipt_item_id: r.goods_receipt_item_id, qty_base: Number(r.qty_base), notes: r.notes?.trim() || null });
    });
    return {
      payload: {
        goods_receipt_id: v.goods_receipt_id as number,
        date: this.toIso(v.date) ?? '',
        reason: v.reason as SupplierReturnReason,
        notes: v.notes?.trim() || null,
        items,
      },
      rowIndexes,
    };
  }

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
    const d = this.doc();
    void this.router.navigate(d ? ['/inventario/devoluciones', d.id] : ['/inventario/devoluciones']);
  }

  // ---------- Utilidades ----------

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

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
