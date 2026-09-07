import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CreditNoteApplication, SupplierCreditNote, SupplierInvoice, payableTone } from '../../../core/models/payables.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Datos fijos de una fila del diálogo de aplicación, paralelos al FormArray. */
interface RowMeta {
  invoice: SupplierInvoice;
  balance: number;
}

/** Valor crudo de una fila del diálogo. */
interface ApplicationRow {
  include: boolean;
  supplier_invoice_id: number;
  amount: number | null;
}

/** Detalle de nota crédito: aplicaciones a facturas, datos de origen y adjuntos. */
@Component({
  selector: 'app-credit-note-detail',
  imports: [
    CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, ButtonModule, CheckboxModule, DialogModule,
    InputNumberModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './credit-note-detail.component.html',
})
export class CreditNoteDetailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PayablesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly doc = signal<SupplierCreditNote | null>(null);
  readonly loading = signal(false);
  readonly cancelling = signal(false);
  readonly removingId = signal<number | null>(null);

  readonly canUpdate = computed(() => this.auth.can('supplier_credit_notes.update'));
  readonly canDelete = computed(() => this.auth.can('supplier_credit_notes.delete'));

  readonly applications = computed<CreditNoteApplication[]>(() => this.doc()?.applications ?? []);
  readonly available = computed(() => Number(this.doc()?.available ?? 0));

  readonly showApply = computed(() => this.doc()?.status === 'disponible' && this.available() > 0 && this.canUpdate());
  readonly showCancel = computed(() => {
    const d = this.doc();
    return !!d && d.status !== 'anulada' && !this.applications().length && this.canDelete();
  });
  readonly showRemove = computed(() => this.doc()?.status !== 'anulada' && this.canUpdate());

  // Diálogo "Aplicar a facturas"
  readonly dialogOpen = signal(false);
  readonly invoicesLoading = signal(false);
  readonly applying = signal(false);
  readonly dialogSubmitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly meta = signal<RowMeta[]>([]);

  readonly applyForm = this.fb.group({ applications: this.fb.array<FormGroup>([]) });

  private readonly applyValue = toSignal(this.applyForm.valueChanges.pipe(map(() => this.applyForm.getRawValue())), {
    initialValue: this.applyForm.getRawValue(),
  });
  private readonly rows = computed(() => (this.applyValue().applications ?? []) as ApplicationRow[]);

  readonly totalToApply = computed(() =>
    this.rows().reduce((sum, r) => sum + (r.include ? Number(r.amount ?? 0) : 0), 0),
  );
  readonly includedCount = computed(() => this.rows().filter((r) => r.include && (r.amount ?? 0) > 0).length);
  readonly overAvailable = computed(() => this.totalToApply() > this.available() + 0.005);
  readonly hasRowIssues = computed(() =>
    this.rows().some((r, i) => r.include && (r.amount ?? 0) > (this.meta()[i]?.balance ?? 0) + 0.005),
  );

  get applicationsArray(): FormArray<FormGroup> {
    return this.applyForm.controls.applications;
  }

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  load(id: number | null = this.doc()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .creditNote(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.doc.set(d);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/pagos/notas-credito']);
        },
      });
  }

  /** Devolución de origen (el nombre `return` no se puede usar en plantillas). */
  origin(): { id: number; number: string } | null {
    return this.doc()?.return ?? null;
  }

  // ---------- Aplicar a facturas ----------

  openApplyDialog(): void {
    const d = this.doc();
    if (!d) return;
    this.dialogSubmitted.set(false);
    this.serverErrors.set({});
    this.applicationsArray.clear();
    this.meta.set([]);
    this.dialogOpen.set(true);
    this.invoicesLoading.set(true);
    this.api
      .invoices({ supplier_id: d.supplier_id, only_open: '1', per_page: 100, sort: 'due_date', dir: 'asc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const metas = res.data.map((inv) => ({ invoice: inv, balance: Number(inv.balance) }));
          this.meta.set(metas);
          for (const m of metas) {
            this.applicationsArray.push(
              this.fb.group({
                include: [false],
                supplier_invoice_id: [m.invoice.id],
                amount: [{ value: null as number | null, disabled: true }, [Validators.required, Validators.min(0.01), Validators.max(m.balance)]],
              }),
            );
          }
          this.invoicesLoading.set(false);
        },
        error: () => this.invoicesLoading.set(false),
      });
  }

  /** Marcar / desmarcar una factura; al marcar se propone el mínimo entre el saldo y lo aún disponible. */
  onIncludeChange(i: number, checked: boolean): void {
    const g = this.applicationsArray.at(i);
    const amount = g.controls['amount'];
    if (checked) {
      amount.enable();
      if (!amount.value) {
        const balance = this.meta()[i]?.balance ?? 0;
        const remaining = Math.max(0, this.available() - this.totalToApply());
        amount.setValue(Math.min(balance, remaining) || null);
      }
    } else {
      amount.disable();
    }
  }

  apply(): void {
    this.dialogSubmitted.set(true);
    if (this.applyForm.invalid) {
      this.applyForm.markAllAsTouched();
      return;
    }
    if (!this.includedCount()) {
      this.toast.warn('Sin facturas', 'Marca al menos una factura con un valor a aplicar mayor que 0.');
      return;
    }
    if (this.hasRowIssues() || this.overAvailable()) {
      this.toast.warn('Valores no válidos', 'El valor a aplicar supera el saldo de la factura o el disponible de la nota.');
      return;
    }
    const d = this.doc();
    if (!d) return;
    this.applying.set(true);
    this.serverErrors.set({});
    const applications = (this.rows() as ApplicationRow[])
      .filter((r) => r.include && (r.amount ?? 0) > 0)
      .map((r) => ({ supplier_invoice_id: r.supplier_invoice_id, amount: Number(r.amount) }));
    this.api
      .applyCreditNote(d.id, applications)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.applying.set(false);
          this.dialogOpen.set(false);
          this.doc.set(fresh);
          this.toast.success('Nota crédito aplicada.', `${fresh.number} · ${applications.length} factura(s).`);
        },
        error: (err: unknown) => {
          this.applying.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as { message?: string; errors?: Record<string, string[]> };
            if (body.errors) this.serverErrors.set(body.errors);
            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
            this.toast.warn('No se pudo aplicar la nota', first ?? body.message);
          }
        },
      });
  }

  removeApplication(a: CreditNoteApplication): void {
    const d = this.doc();
    if (!d || this.removingId() !== null) return;
    this.confirm.confirm({
      header: 'Quitar aplicación',
      message: `¿Quitar la aplicación de ${a.invoice?.number ?? 'la factura'}? La factura recupera su saldo y la nota vuelve a quedar disponible por ese valor.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Quitar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.removingId.set(a.id);
        this.api
          .removeCreditNoteApplication(d.id, a.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.removingId.set(null);
              this.doc.set(fresh);
              this.toast.success('Aplicación quitada.', 'La factura recuperó su saldo.');
            },
            error: (err: unknown) => {
              this.removingId.set(null);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string; errors?: Record<string, string[]> };
                const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                this.toast.warn('No se pudo quitar la aplicación', first ?? body.message);
              }
            },
          });
      },
    });
  }

  cancelNote(): void {
    const d = this.doc();
    if (!d || this.cancelling()) return;
    this.confirm.confirm({
      header: 'Anular nota crédito',
      message: `¿Anular la nota ${d.number}? El saldo a favor deja de estar disponible y la acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Anular',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.cancelling.set(true);
        this.api
          .cancelCreditNote(d.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.cancelling.set(false);
              this.doc.set(fresh);
              this.toast.success('Nota crédito anulada.', fresh.number);
            },
            error: (err: unknown) => {
              this.cancelling.set(false);
              if (err instanceof HttpErrorResponse && err.status === 422) {
                const body = err.error as { message?: string; errors?: Record<string, string[]> };
                const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                this.toast.warn('No se pudo anular', first ?? body.message);
              }
            },
          });
      },
    });
  }

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  showError(g: FormGroup, field: string): boolean {
    const c = g.controls[field];
    return !!c && c.enabled && c.invalid && (c.touched || this.dialogSubmitted());
  }

  payableTone = payableTone;
}
