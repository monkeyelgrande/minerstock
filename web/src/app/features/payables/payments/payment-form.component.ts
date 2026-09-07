import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { map } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PayablesApi } from '../../../core/api/payables-api.service';
import { Supplier } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { PaymentMethod, SupplierInvoice, SupplierPaymentPayload } from '../../../core/models/payables.model';
import { ToastService } from '../../../core/services/toast.service';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Datos fijos de una fila (factura abierta del proveedor), paralelos al FormArray. */
interface RowMeta {
  invoice: SupplierInvoice;
  balance: number;
}

/** Valor crudo de una fila del formulario. */
interface AllocationRow {
  include: boolean;
  supplier_invoice_id: number;
  amount: number | null;
}

/** Registro de un pago a proveedor aplicado a facturas abiertas (solo creación; los pagos son inmutables). */
@Component({
  selector: 'app-payment-form',
  imports: [
    CurrencyPipe, DatePipe, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule,
    FieldComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-form.component.html',
})
export class PaymentFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(PayablesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Query param `?supplier_id=` para preseleccionar el proveedor. */
  readonly presetSupplierId = input<string | undefined>(undefined, { alias: 'supplier_id' });
  /** Query param `?invoice=` para premarcar una factura al cargar. */
  readonly invoice = input<string>();

  readonly suppliers = signal<Supplier[]>([]);
  readonly methods = signal<{ value: PaymentMethod; label: string }[]>([]);
  readonly meta = signal<RowMeta[]>([]);
  readonly invoicesLoading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    date: [new Date() as Date | null, Validators.required],
    method: [null as PaymentMethod | null, Validators.required],
    reference: ['', Validators.maxLength(100)],
    notes: ['', Validators.maxLength(2000)],
    allocations: this.fb.array<FormGroup>([]),
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  private readonly rows = computed(() => (this.formValue().allocations ?? []) as AllocationRow[]);

  /** Suma de los valores aplicados; es a la vez el valor total del pago (el API exige igualdad). */
  readonly totalApplied = computed(() =>
    this.rows().reduce((sum, r) => sum + (r.include ? Number(r.amount ?? 0) : 0), 0),
  );
  readonly includedCount = computed(() => this.rows().filter((r) => r.include && (r.amount ?? 0) > 0).length);
  readonly hasIssues = computed(() =>
    this.rows().some((r, i) => r.include && (r.amount ?? 0) > (this.meta()[i]?.balance ?? 0) + 0.005),
  );
  readonly selectedSupplier = computed(() => {
    const id = this.formValue().supplier_id;
    return this.suppliers().find((s) => s.id === id) ?? null;
  });

  get allocationsArray(): FormArray<FormGroup> {
    return this.form.controls.allocations;
  }

  constructor() {
    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        this.suppliers.set(list);
        const preset = this.presetSupplierId();
        if (preset && !this.form.controls.supplier_id.value && list.some((s) => s.id === +preset)) {
          this.onSupplierChange(+preset);
        }
      });
    this.api
      .paymentMethods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((m) => this.methods.set(Object.entries(m ?? {}).map(([value, label]) => ({ value: value as PaymentMethod, label }))));
  }

  // ---------- Proveedor y facturas abiertas ----------

  /** Al cambiar de proveedor se recargan sus facturas abiertas y se limpian las aplicaciones. */
  onSupplierChange(id: number | null): void {
    this.form.controls.supplier_id.setValue(id);
    this.allocationsArray.clear();
    this.meta.set([]);
    if (!id) return;
    this.invoicesLoading.set(true);
    this.api
      .invoices({ supplier_id: id, only_open: '1', per_page: 100, sort: 'due_date', dir: 'asc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // Evita aplicar una respuesta tardía si el usuario ya cambió de proveedor.
          if (this.form.controls.supplier_id.value !== id) return;
          const metas = res.data.map((inv) => ({ invoice: inv, balance: Number(inv.balance) }));
          this.meta.set(metas);
          const preset = this.invoice();
          for (const m of metas) {
            const preChecked = !!preset && m.invoice.id === +preset;
            this.allocationsArray.push(this.allocationGroup(m, preChecked));
          }
          this.invoicesLoading.set(false);
        },
        error: () => this.invoicesLoading.set(false),
      });
  }

  private allocationGroup(m: RowMeta, include: boolean): FormGroup {
    return this.fb.group({
      include: [include],
      supplier_invoice_id: [m.invoice.id],
      amount: [
        { value: include ? m.balance : null, disabled: !include },
        [Validators.required, Validators.min(0.01), Validators.max(m.balance)],
      ],
    });
  }

  /** Marcar / desmarcar una factura; al marcar se propone abonar todo el saldo. */
  onIncludeChange(i: number, checked: boolean): void {
    const g = this.allocationsArray.at(i);
    const amount = g.controls['amount'];
    if (checked) {
      amount.enable();
      if (!amount.value) amount.setValue(this.meta()[i]?.balance ?? null);
    } else {
      amount.disable();
    }
  }

  // ---------- Guardar ----------

  save(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar o valores no válidos.');
      return;
    }
    if (!this.includedCount()) {
      this.toast.warn('Sin facturas', 'Marca al menos una factura con un valor a aplicar mayor que 0.');
      return;
    }
    if (this.hasIssues()) {
      this.toast.warn('Valores no válidos', 'Hay facturas donde el valor aplicado supera el saldo.');
      return;
    }
    const supplier = this.selectedSupplier();
    const total = this.totalApplied();
    this.confirm.confirm({
      header: 'Registrar pago',
      message: `Se registrará un pago a ${supplier?.name ?? 'el proveedor'} por ${this.formatCop(total)} aplicado a ${this.includedCount()} factura(s). Los pagos no se pueden editar después. ¿Continuar?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Registrar pago',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.persist(),
    });
  }

  private persist(): void {
    this.saving.set(true);
    this.serverErrors.set({});
    const { payload, rowIndexes } = this.toPayload();
    this.api
      .createPayment(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.toast.success('Pago registrado.', `${saved.number} · ${this.formatCop(saved.amount)}`);
          void this.router.navigate(['/pagos/pagos', saved.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as Partial<ValidationErrors>;
            if (body.errors) {
              this.serverErrors.set(this.remapAllocationErrors(body.errors, rowIndexes));
              this.toast.warn('No se pudo registrar el pago', body.message);
            } else {
              this.formError.set(body.message ?? 'No se pudo registrar el pago.');
              this.toast.warn('No se pudo registrar el pago', body.message);
            }
          }
        },
      });
  }

  private toPayload(): { payload: SupplierPaymentPayload; rowIndexes: number[] } {
    const v = this.form.getRawValue();
    const rowIndexes: number[] = [];
    const allocations: SupplierPaymentPayload['allocations'] = [];
    (v.allocations as AllocationRow[]).forEach((r, i) => {
      if (!r.include || !(r.amount ?? 0)) return;
      rowIndexes.push(i);
      allocations.push({ supplier_invoice_id: r.supplier_invoice_id, amount: Number(r.amount) });
    });
    return {
      payload: {
        supplier_id: v.supplier_id as number,
        date: this.toIso(v.date) ?? '',
        method: v.method as PaymentMethod,
        reference: v.reference?.trim() || null,
        amount: this.totalApplied(),
        notes: v.notes?.trim() || null,
        allocations,
      },
      rowIndexes,
    };
  }

  private remapAllocationErrors(errors: Record<string, string[]>, rowIndexes: number[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(errors)) {
      const m = /^allocations\.(\d+)(\..+)?$/.exec(key);
      if (!m) {
        out[key] = msgs;
        continue;
      }
      const row = rowIndexes[Number(m[1])];
      out[row === undefined ? key : `allocations.${row}${m[2] ?? ''}`] = msgs;
    }
    return out;
  }

  cancel(): void {
    void this.router.navigate(['/pagos/pagos']);
  }

  // ---------- Utilidades ----------

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores de servidor de una fila que no corresponden al campo de valor. */
  rowError(i: number): string | undefined {
    return this.serverErrors()[`allocations.${i}`]?.[0] ?? this.serverErrors()[`allocations.${i}.supplier_invoice_id`]?.[0];
  }

  showError(g: FormGroup, field: string): boolean {
    const c = g.controls[field];
    return !!c && c.enabled && c.invalid && (c.touched || this.submitted());
  }

  formatCop(n: number): string {
    return `$${Math.round(n).toLocaleString('es-CO')}`;
  }

  private toIso(d: Date | null | undefined): string | undefined {
    if (!(d instanceof Date)) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
