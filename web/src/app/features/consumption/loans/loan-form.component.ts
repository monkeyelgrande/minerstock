import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors as NgValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { ConsumptionApi } from '../../../core/api/consumption-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { Product, Recipient } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { Loan, LoanPayload, loanTone } from '../../../core/models/consumption.model';
import { ProductWarehouseBalance } from '../../../core/models/inventory.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Valor crudo de una fila de herramienta. */
interface ItemRow {
  id: number | null;
  product: Product | null;
  qty_base: number | null;
  notes: string | null;
}

/** Información derivada de una fila: stock disponible en la bodega elegida. */
interface RowInfo {
  unit: string;
  loaded: boolean;
  available: number;
  exceeded: boolean;
}

/** El picker no filtra por tipo, así que se valida aquí: solo herramientas retornables. */
function retornableValidator(c: AbstractControl): NgValidationErrors | null {
  const p = c.value as Product | null;
  return p && p.kind !== 'retornable' ? { retornable: true } : null;
}

/** Formulario de préstamo de herramientas: datos generales e ítems retornables en unidad base. */
@Component({
  selector: 'app-loan-form',
  imports: [
    DecimalPipe, ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule,
    SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loan-form.component.html',
})
export class LoanFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(ConsumptionApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`prestamos/:id/editar`); undefined en `prestamos/nuevo`. */
  readonly id = input<string>();

  readonly loan = signal<Loan | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly recipients = signal<Recipient[]>([]);
  /** Saldos por producto (todas las bodegas), cacheados por id de producto. */
  private readonly balances = signal<Map<number, ProductWarehouseBalance[]>>(new Map());
  private readonly balanceLoading = new Set<number>();

  /** Tipo de adjuntable del préstamo (el modelo compartido aún no lo incluye en la unión). */
  readonly attachType = 'loan' as AttachableType;

  readonly form = this.fb.group({
    warehouse_id: [null as number | null, Validators.required],
    recipient_id: [null as number | null, Validators.required],
    loaned_at: [new Date() as Date | null, Validators.required],
    expected_return_at: [null as Date | null],
    notes: [''],
    items: this.fb.array<FormGroup>([]),
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.loan()?.number ?? 'préstamo'}` : 'Nuevo préstamo de herramientas'));

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);
  private readonly warehouseId = computed(() => this.formValue().warehouse_id ?? null);
  /** Fecha mínima de la devolución esperada (no puede ser antes del préstamo). */
  readonly minReturnDate = computed(() => this.formValue().loaned_at ?? null);

  /** Stock disponible de cada fila para la bodega elegida. */
  readonly rowInfo = computed<RowInfo[]>(() => {
    const wh = this.warehouseId();
    const cache = this.balances();
    return this.rows().map((r) => {
      const unit = r.product?.base_unit?.code ?? '';
      if (!r.product) return { unit, loaded: false, available: 0, exceeded: false };
      const list = cache.get(r.product.id);
      const cell = list?.find((b) => b.warehouse_id === wh);
      const available = Number(cell?.qty ?? 0);
      const qty = Number(r.qty_base ?? 0);
      return { unit, loaded: list !== undefined, available, exceeded: list !== undefined && qty > available };
    });
  });

  readonly exceededCount = computed(() => this.rowInfo().filter((i) => i.exceeded).length);

  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.catalog.recipients
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.recipients.set(list));

    // Carga el préstamo cuando cambia el id de ruta (nuevo → editar reutiliza el componente).
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
      this.loan.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .loan(id)
      .pipe(
        switchMap((l) => this.productsFor((l.items ?? []).map((i) => i.product_id)).pipe(map((products) => ({ l, products })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ l, products }) => {
          if (!l.is_editable) {
            this.toast.info('Préstamo no editable', `${l.number} está en estado "${l.status_label}".`);
            void this.router.navigate(['/bodega/prestamos', l.id]);
            return;
          }
          this.loan.set(l);
          this.patchForm(l, products);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/bodega/prestamos']);
        },
      });
  }

  /** Recarga solo el préstamo (adjuntos) sin tocar el formulario. */
  reloadLoan(): void {
    const l = this.loan();
    if (!l) return;
    this.api
      .loan(l.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.loan.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({ warehouse_id: this.ctx.activeId(), recipient_id: null, loaned_at: new Date(), expected_return_at: null, notes: '' });
    this.addItem();
  }

  private patchForm(l: Loan, products: Map<number, Product>): void {
    this.itemsArray.clear();
    for (const it of l.items ?? []) {
      this.itemsArray.push(
        this.itemGroup({
          id: it.id,
          product: products.get(it.product_id) ?? null,
          qty_base: Number(it.qty_base),
          notes: it.notes ?? '',
        }),
      );
    }
    this.form.patchValue({
      warehouse_id: l.warehouse_id,
      recipient_id: l.recipient_id,
      loaned_at: this.parseDate(l.loaned_at) ?? new Date(),
      expected_return_at: this.parseDate(l.expected_return_at),
      notes: l.notes ?? '',
    });
    this.form.markAsPristine();
  }

  private productsFor(ids: number[]): Observable<Map<number, Product>> {
    const distinct = [...new Set(ids)];
    if (!distinct.length) return of(new Map<number, Product>());
    return forkJoin(distinct.map((id) => this.catalog.products.get(id))).pipe(map((list) => new Map(list.map((p) => [p.id, p]))));
  }

  // ---------- Bodega ----------

  /** Al cambiar de bodega se refrescan los saldos de los productos ya elegidos. */
  onWarehouseChange(): void {
    this.balances.set(new Map());
    this.balanceLoading.clear();
    for (const r of this.rows()) {
      if (r.product) this.fetchBalance(r.product.id);
    }
  }

  // ---------- Ítems ----------

  private itemGroup(init: Partial<ItemRow> = {}): FormGroup {
    const g = this.fb.group({
      id: [init.id ?? null],
      product: [init.product ?? null, [Validators.required, retornableValidator]],
      qty_base: [init.qty_base ?? null, [Validators.required, Validators.min(0.001)]],
      notes: [init.notes ?? ''],
    });
    g.controls['product'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p: Product | null) => {
      if (p) this.fetchBalance(p.id);
    });
    if (init.product) this.fetchBalance(init.product.id);
    return g;
  }

  addItem(): void {
    this.itemsArray.push(this.itemGroup());
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
  }

  private fetchBalance(productId: number): void {
    if (this.balances().has(productId) || this.balanceLoading.has(productId)) return;
    this.balanceLoading.add(productId);
    this.inventory
      .productBalances(productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.balanceLoading.delete(productId);
          const next = new Map(this.balances());
          next.set(productId, list);
          this.balances.set(next);
        },
        error: () => this.balanceLoading.delete(productId),
      });
  }

  // ---------- Guardar ----------

  /** Guarda el borrador; con `andConfirm` pide confirmación y descuenta las herramientas del stock. */
  save(andConfirm = false): void {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin herramientas', 'Agrega al menos una herramienta al préstamo.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return;
    }
    if (!andConfirm) {
      this.persist(false);
      return;
    }
    this.confirm.confirm({
      header: 'Guardar y confirmar',
      message: 'Confirmar descuenta las herramientas del stock al costo promedio. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.persist(true),
    });
  }

  private persist(andConfirm: boolean): void {
    this.saving.set(true);
    this.serverErrors.set({});
    const payload = this.toPayload();
    const current = this.loan();
    const save$ = current ? this.api.updateLoan(current.id, payload) : this.api.createLoan(payload);
    let savedId: number | null = null;
    save$
      .pipe(
        switchMap((saved) => {
          savedId = saved.id;
          return andConfirm ? this.api.loanAction(saved.id, 'confirm') : of(saved);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          if (andConfirm) this.toast.success('Préstamo confirmado: herramientas descontadas del stock.', saved.number);
          else this.toast.success(current ? 'Préstamo actualizado.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/bodega/prestamos', saved.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (!(err instanceof HttpErrorResponse) || err.status !== 422) return;
          const body = err.error as Partial<ValidationErrors>;
          if (savedId !== null) {
            // Se guardó el borrador pero la confirmación falló (p. ej. stock insuficiente).
            this.toast.warn('Borrador guardado, pero no se pudo confirmar', body.message);
            void this.router.navigate(['/bodega/prestamos', savedId]);
            return;
          }
          this.serverErrors.set(body.errors ?? {});
          this.toast.warn(body.errors ? 'Revisa el formulario' : 'No se pudo guardar', body.message);
        },
      });
  }

  private toPayload(): LoanPayload {
    const v = this.form.getRawValue();
    return {
      warehouse_id: v.warehouse_id as number,
      recipient_id: v.recipient_id as number,
      loaned_at: this.toIso(v.loaned_at) ?? '',
      expected_return_at: this.toIso(v.expected_return_at) ?? null,
      notes: v.notes?.trim() || null,
      items: (v.items as ItemRow[]).map((r) => ({
        id: r.id ?? undefined,
        product_id: r.product?.id as number,
        qty_base: Number(r.qty_base ?? 0),
        notes: r.notes?.trim() || null,
      })),
    };
  }

  cancel(): void {
    const l = this.loan();
    void this.router.navigate(l ? ['/bodega/prestamos', l.id] : ['/bodega/prestamos']);
  }

  // ---------- Utilidades ----------

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** Errores del servidor de una fila (`items.N.*`) que no se muestran bajo un campo concreto. */
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

  /** true si la fila tiene producto elegido pero no es retornable. */
  notRetornable(g: FormGroup): boolean {
    return !!g.controls['product']?.hasError('retornable');
  }

  loanTone = loanTone;

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
