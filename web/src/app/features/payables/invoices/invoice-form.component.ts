import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { AdminApi } from '../../../core/api/admin-api.service';
import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { SupplierInvoice, SupplierInvoicePayload, payableTone } from '../../../core/models/payables.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/**
 * Fila de recepción seleccionable. Une las recepciones facturables del API con las ya
 * asociadas a la factura en edición (que no aparecen en ese listado; sin valores de prellenado).
 */
interface ReceiptRow {
  id: number;
  number: string;
  received_at: string | null;
  supplier_remission: string | null;
  order: { id: number; number: string; payment_days: number | null } | null;
  supplier: { id: number; name: string } | null;
  warehouse: { code: string; name: string } | null;
  items_count: number | null;
  subtotal: number | null;
  tax: number | null;
}

/** Formulario de factura de proveedor: recepciones a facturar (o compra menor sin recepciones) y valores. */
@Component({
  selector: 'app-invoice-form',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoice-form.component.html',
})
export class InvoiceFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(PayablesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly admin = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  /** Id de ruta (`facturas/:id/editar`); undefined en `facturas/nueva`. */
  readonly id = input<string>();
  /** Query param `?order=` para facturar las recepciones de una orden concreta. */
  readonly order = input<string>();
  /** Query param `?supplier_id=` para preseleccionar el proveedor. */
  readonly querySupplierId = input<string | undefined>(undefined, { alias: 'supplier_id' });

  readonly invoice = signal<SupplierInvoice | null>(null);
  readonly suppliers = signal<Supplier[]>([]);
  readonly receipts = signal<ReceiptRow[]>([]);
  readonly checked = signal<number[]>([]);
  readonly loading = signal(false);
  readonly receiptsLoading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly formError = signal<string | null>(null);

  /** IVA por defecto (%) de la configuración; propone el IVA en compras menores. */
  private defaultTaxRate = 19;
  /** Mientras sea true, el IVA se recalcula al escribir el subtotal (compra menor). */
  private taxAuto = true;

  readonly attachType = 'supplier_invoice' as AttachableType;

  readonly form = this.fb.group({
    supplier_id: this.fb.control<number | null>(null, Validators.required),
    supplier_invoice_number: ['', [Validators.required, Validators.maxLength(60)]],
    issue_date: this.fb.control<Date | null>(new Date(), Validators.required),
    due_date: this.fb.control<Date | null>(new Date(), Validators.required),
    subtotal: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    tax: this.fb.control<number | null>(0, Validators.min(0)),
    withholding: this.fb.control<number | null>(0, Validators.min(0)),
    notes: ['', Validators.maxLength(2000)],
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.invoice()?.number ?? 'factura'}` : 'Registrar factura'));

  /** Total a pagar = subtotal + IVA − retención (el servidor lo recalcula igual). */
  readonly total = computed(() => {
    const v = this.formValue();
    return this.round2((v.subtotal ?? 0) + (v.tax ?? 0) - (v.withholding ?? 0));
  });

  private readonly selectedSupplierId = computed(() => this.formValue().supplier_id);

  readonly selectedSupplier = computed(() => {
    const id = this.selectedSupplierId();
    return this.suppliers().find((s) => s.id === id) ?? this.invoice()?.supplier ?? null;
  });

  /** Recepciones visibles: por orden (`?order=`) o por el proveedor seleccionado. */
  readonly visibleReceipts = computed<ReceiptRow[]>(() => {
    const rows = this.receipts();
    if (!this.isEdit()) {
      const orderId = this.orderFilter();
      if (orderId) return rows.filter((r) => r.order?.id === orderId);
    }
    const supplierId = this.selectedSupplierId();
    if (supplierId) return rows.filter((r) => r.supplier?.id === supplierId);
    return rows;
  });

  /** Orden de la primera recepción marcada: las demás deben ser de la misma orden. */
  readonly firstCheckedOrderId = computed<number | null>(() => {
    const ids = this.checked();
    if (!ids.length) return null;
    const first = this.receipts().find((r) => r.id === ids[0]);
    return first?.order?.id ?? null;
  });

  readonly checkedCount = computed(() => this.checked().length);

  private orderFilter(): number | null {
    const o = this.order();
    return o && !Number.isNaN(+o) ? +o : null;
  }

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });

    // Con recepciones marcadas, cambiar la fecha de emisión recalcula el vencimiento.
    this.form.controls.issue_date.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.checked().length) this.applyDueDate();
      });

    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));

    if (this.auth.can('settings.view')) {
      this.admin
        .settings()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((s) => {
          if (s.default_tax_rate !== undefined && s.default_tax_rate !== null) this.defaultTaxRate = Number(s.default_tax_rate);
        });
    }
  }

  // ---------- Carga ----------

  private load(id: number | null): void {
    this.serverErrors.set({});
    this.formError.set(null);
    this.submitted.set(false);
    this.taxAuto = true;
    if (!id) {
      this.invoice.set(null);
      this.checked.set([]);
      this.form.reset({
        supplier_id: null,
        supplier_invoice_number: '',
        issue_date: new Date(),
        due_date: new Date(),
        subtotal: null,
        tax: 0,
        withholding: 0,
        notes: '',
      });
      const preset = this.querySupplierId();
      if (preset && !Number.isNaN(+preset)) {
        this.form.controls.supplier_id.setValue(+preset);
        this.form.controls.supplier_id.disable();
      } else {
        this.form.controls.supplier_id.enable();
      }
      this.loadReceipts([]);
      return;
    }
    this.loading.set(true);
    this.api
      .invoice(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => {
          if (!inv.is_editable) {
            this.toast.info('Factura no editable', `${inv.number} tiene pagos o notas crédito aplicadas, o está anulada.`);
            void this.router.navigate(['/pagos/facturas', inv.id]);
            return;
          }
          this.invoice.set(inv);
          this.taxAuto = false;
          this.form.patchValue({
            supplier_id: inv.supplier_id,
            supplier_invoice_number: inv.supplier_invoice_number,
            issue_date: this.parseDate(inv.issue_date) ?? new Date(),
            due_date: this.parseDate(inv.due_date) ?? new Date(),
            subtotal: Number(inv.subtotal),
            tax: Number(inv.tax),
            withholding: Number(inv.withholding),
            notes: inv.notes ?? '',
          });
          this.checked.set((inv.receipts ?? []).map((r) => r.id));
          if (inv.receipts?.length) this.form.controls.supplier_id.disable();
          else this.form.controls.supplier_id.enable();
          // Las recepciones de esta factura no aparecen en el listado de facturables: se mezclan aquí.
          const legacy: ReceiptRow[] = (inv.receipts ?? []).map((r) => ({
            id: r.id,
            number: r.number,
            received_at: r.received_at,
            supplier_remission: r.supplier_remission,
            order: inv.order ? { id: inv.order.id, number: inv.order.number, payment_days: null } : null,
            supplier: inv.supplier ? { id: inv.supplier.id, name: inv.supplier.name } : null,
            warehouse: null,
            items_count: null,
            subtotal: null,
            tax: null,
          }));
          this.form.markAsPristine();
          this.loading.set(false);
          this.loadReceipts(legacy);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/pagos/facturas']);
        },
      });
  }

  /** Recepciones confirmadas sin factura; `legacy` va primero (recepciones ya ligadas a la factura en edición). */
  private loadReceipts(legacy: ReceiptRow[]): void {
    this.receiptsLoading.set(true);
    this.api
      .invoiceableReceipts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.receipts.set([...legacy, ...list.map<ReceiptRow>((r) => ({ ...r, warehouse: r.warehouse ?? null }))]);
          this.receiptsLoading.set(false);
          // ?order= al crear: se marcan todas las recepciones de esa orden.
          const orderId = this.orderFilter();
          if (!this.isEdit() && orderId && !this.checked().length) {
            const ids = list.filter((r) => r.order.id === orderId).map((r) => r.id);
            if (ids.length) {
              this.checked.set(ids);
              this.applyChecked();
            } else {
              this.toast.info('Sin recepciones por facturar', 'La orden indicada no tiene recepciones confirmadas pendientes de factura.');
            }
          }
        },
        error: () => this.receiptsLoading.set(false),
      });
  }

  /** Recarga la factura (adjuntos) sin tocar el formulario. */
  reloadInvoice(): void {
    const inv = this.invoice();
    if (!inv) return;
    this.api
      .invoice(inv.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.invoice.set(fresh));
  }

  // ---------- Recepciones ----------

  isChecked(row: ReceiptRow): boolean {
    return this.checked().includes(row.id);
  }

  /** Deshabilitada si ya hay recepciones marcadas de otra orden. */
  isRowDisabled(row: ReceiptRow): boolean {
    const firstOrder = this.firstCheckedOrderId();
    if (firstOrder === null || this.isChecked(row)) return false;
    return row.order?.id !== firstOrder;
  }

  toggleReceipt(row: ReceiptRow, checked: boolean): void {
    const ids = this.checked();
    if (checked) {
      if (!ids.includes(row.id)) this.checked.set([...ids, row.id]);
    } else {
      this.checked.set(ids.filter((id) => id !== row.id));
    }
    this.applyChecked();
  }

  /** Marcar/desmarcar recalcula el prellenado: proveedor, subtotal, IVA y vencimiento. */
  private applyChecked(): void {
    const rows = this.receipts().filter((r) => this.checked().includes(r.id));
    const supplierCtrl = this.form.controls.supplier_id;
    if (rows.length) {
      const sup = rows.find((r) => r.supplier)?.supplier;
      if (sup) supplierCtrl.setValue(sup.id);
      supplierCtrl.disable();
    } else if (!this.querySupplierId() || this.isEdit()) {
      supplierCtrl.enable();
    }
    this.taxAuto = false;
    this.form.patchValue({
      subtotal: this.round2(rows.reduce((acc, r) => acc + Number(r.subtotal ?? 0), 0)) || null,
      tax: this.round2(rows.reduce((acc, r) => acc + Number(r.tax ?? 0), 0)),
    });
    if (rows.length) this.applyDueDate();
  }

  /** Vencimiento = emisión + días de pago de la orden (o del proveedor como respaldo). */
  private applyDueDate(): void {
    const issue = this.form.controls.issue_date.value;
    if (!(issue instanceof Date)) return;
    const rows = this.receipts().filter((r) => this.checked().includes(r.id));
    const withDays = rows.find((r) => r.order?.payment_days !== null && r.order?.payment_days !== undefined);
    const supplier = this.suppliers().find((s) => s.id === this.form.getRawValue().supplier_id);
    const days = withDays?.order?.payment_days ?? supplier?.payment_terms_days ?? 0;
    const due = new Date(issue);
    due.setDate(due.getDate() + Number(days ?? 0));
    this.form.controls.due_date.setValue(due);
  }

  onSupplierChange(): void {
    // Solo posible sin recepciones marcadas (el control se bloquea al marcar).
    this.taxAuto = !this.isEdit();
  }

  /** Compra menor: al escribir el subtotal se propone el IVA con la tasa por defecto. */
  onSubtotalInput(value: number | string | null): void {
    if (!this.taxAuto || this.checked().length) return;
    const subtotal = Number(value ?? 0);
    this.form.controls.tax.setValue(subtotal > 0 ? this.round2((subtotal * this.defaultTaxRate) / 100) : 0);
  }

  onTaxInput(): void {
    this.taxAuto = false;
  }

  // ---------- Guardar ----------

  save(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return;
    }
    if (this.total() <= 0) {
      this.toast.warn('Total no válido', 'El total a pagar (subtotal + IVA − retención) debe ser mayor que cero.');
      return;
    }
    const v = this.form.getRawValue();
    const ids = this.checked();
    const payload: SupplierInvoicePayload = {
      supplier_invoice_number: v.supplier_invoice_number.trim(),
      supplier_id: ids.length ? null : v.supplier_id,
      purchase_order_id: ids.length ? this.firstCheckedOrderId() : null,
      goods_receipt_ids: ids,
      issue_date: this.toIso(v.issue_date) ?? '',
      due_date: this.toIso(v.due_date) ?? '',
      subtotal: Number(v.subtotal),
      tax: Number(v.tax ?? 0),
      withholding: Number(v.withholding ?? 0),
      notes: v.notes.trim() || null,
    };
    this.saving.set(true);
    this.serverErrors.set({});
    const current = this.invoice();
    const save$ = current ? this.api.updateInvoice(current.id, payload) : this.api.createInvoice(payload);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.toast.success(current ? 'Factura actualizada.' : 'Factura registrada.', saved.number);
        void this.router.navigate(['/pagos/facturas', saved.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse) {
          const body = err.error as Partial<ValidationErrors>;
          if (body?.errors) {
            this.serverErrors.set(body.errors);
            this.toast.warn('Revisa el formulario', body.message);
          } else if (body?.message) {
            this.formError.set(body.message);
            this.toast.warn('No se pudo guardar', body.message);
          }
        }
      },
    });
  }

  cancel(): void {
    const inv = this.invoice();
    void this.router.navigate(inv ? ['/pagos/facturas', inv.id] : ['/pagos/facturas']);
  }

  // ---------- Utilidades ----------

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  minDueDate(): Date | null {
    return this.form.controls.issue_date.value ?? null;
  }

  payableTone = payableTone;

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
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
