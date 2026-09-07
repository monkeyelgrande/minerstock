import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { Product } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { Adjustment, AdjustmentPayload, ProductWarehouseBalance } from '../../../core/models/inventory.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../../shared/components/product-picker.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { simpleStatusTone } from './status-tone';

type MoveType = 'entrada' | 'salida';

/** Valor crudo de una fila de ítem. */
interface ItemRow {
  id: number | null;
  product: Product | null;
  type: MoveType;
  quantity: number | null;
  unit_cost: number | null;
  notes: string | null;
}

/** Información derivada de una fila: stock actual, costo promedio y stock resultante. */
interface RowInfo {
  unit: string;
  loaded: boolean;
  current: number;
  avgCost: number;
  resulting: number;
  negative: boolean;
}

/** Motivos que solo genera el sistema y no se ofrecen en el formulario manual. */
const SYSTEM_REASONS = ['conteo', 'devolucion_prestamo_danada'];

/** Formulario de ajuste de inventario: datos generales e ítems con entrada/salida en unidad base. */
@Component({
  selector: 'app-adjustment-form',
  imports: [
    CurrencyPipe, DecimalPipe, ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule,
    SelectModule, SelectButtonModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustment-form.component.html',
})
export class AdjustmentFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`ajustes/:id/editar`); undefined en `ajustes/nuevo`. */
  readonly id = input<string>();

  readonly adjustment = signal<Adjustment | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly reasons = signal<{ label: string; value: string }[]>([]);
  /** Saldos por producto (todas las bodegas), cacheados por id de producto. */
  private readonly balances = signal<Map<number, ProductWarehouseBalance[]>>(new Map());
  private readonly balanceLoading = new Set<number>();

  /** Tipo de adjuntable del ajuste (el modelo compartido aún no lo incluye en la unión). */
  readonly attachType = 'adjustment' as AttachableType;

  readonly typeOptions: { label: string; value: MoveType; icon: string }[] = [
    { label: 'Entrada', value: 'entrada', icon: 'pi pi-arrow-down' },
    { label: 'Salida', value: 'salida', icon: 'pi pi-arrow-up' },
  ];

  readonly form = this.fb.group({
    warehouse_id: [null as number | null, Validators.required],
    date: [new Date() as Date | null, Validators.required],
    reason: [null as string | null, Validators.required],
    notes: [''],
    items: this.fb.array<FormGroup>([]),
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.adjustment()?.number ?? 'ajuste'}` : 'Nuevo ajuste de inventario'));

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);
  private readonly warehouseId = computed(() => this.formValue().warehouse_id ?? null);

  /** Stock actual / resultante de cada fila para la bodega elegida. */
  readonly rowInfo = computed<RowInfo[]>(() => {
    const wh = this.warehouseId();
    const cache = this.balances();
    return this.rows().map((r) => {
      const unit = r.product?.base_unit?.code ?? '';
      if (!r.product) return { unit, loaded: false, current: 0, avgCost: 0, resulting: 0, negative: false };
      const list = cache.get(r.product.id);
      const cell = list?.find((b) => b.warehouse_id === wh);
      const current = Number(cell?.qty ?? 0);
      const avgCost = Number(cell?.avg_cost ?? 0);
      const qty = Number(r.quantity ?? 0);
      const resulting = this.round3(r.type === 'salida' ? current - qty : current + qty);
      return { unit, loaded: list !== undefined, current, avgCost, resulting, negative: resulting < 0 };
    });
  });

  readonly summary = computed(() => {
    const rows = this.rows();
    return {
      entries: rows.filter((r) => r.type === 'entrada').length,
      exits: rows.filter((r) => r.type === 'salida').length,
      negatives: this.rowInfo().filter((i) => i.negative).length,
    };
  });

  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.api
      .adjustmentReasons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((map) =>
        this.reasons.set(
          Object.entries(map)
            .filter(([value]) => !SYSTEM_REASONS.includes(value))
            .map(([value, label]) => ({ value, label })),
        ),
      );

    // Carga el ajuste cuando cambia el id de ruta (nuevo → editar reutiliza el componente).
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
      this.adjustment.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .adjustment(id)
      .pipe(
        switchMap((a) => this.productsFor((a.items ?? []).map((i) => i.product_id)).pipe(map((products) => ({ a, products })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ a, products }) => {
          if (!a.is_editable) {
            this.toast.info('Ajuste no editable', a.stock_count_id ? `${a.number} fue generado por un conteo físico.` : `${a.number} está en estado "${a.status_label}".`);
            void this.router.navigate(['/inventario/ajustes', a.id]);
            return;
          }
          this.adjustment.set(a);
          this.patchForm(a, products);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/inventario/ajustes']);
        },
      });
  }

  /** Recarga solo el ajuste (adjuntos) sin tocar el formulario. */
  reloadAdjustment(): void {
    const a = this.adjustment();
    if (!a) return;
    this.api
      .adjustment(a.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.adjustment.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({ warehouse_id: this.ctx.activeId(), date: new Date(), reason: null, notes: '' });
    this.addItem();
  }

  private patchForm(a: Adjustment, products: Map<number, Product>): void {
    this.itemsArray.clear();
    for (const it of a.items ?? []) {
      const qty = Number(it.qty_base);
      this.itemsArray.push(
        this.itemGroup({
          id: it.id,
          product: products.get(it.product_id) ?? null,
          type: qty < 0 ? 'salida' : 'entrada',
          quantity: Math.abs(qty),
          unit_cost: qty > 0 && it.unit_cost !== null ? Number(it.unit_cost) : null,
          notes: it.notes ?? '',
        }),
      );
    }
    this.form.patchValue({
      warehouse_id: a.warehouse_id,
      date: this.parseDate(a.date) ?? new Date(),
      reason: a.reason,
      notes: a.notes ?? '',
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
    const type: MoveType = init.type ?? 'entrada';
    const g = this.fb.group({
      id: [init.id ?? null],
      product: [init.product ?? null, Validators.required],
      type: [type, Validators.required],
      quantity: [init.quantity ?? null, [Validators.required, Validators.min(0.001)]],
      unit_cost: [{ value: init.unit_cost ?? null, disabled: type === 'salida' }, Validators.min(0)],
      notes: [init.notes ?? ''],
    });
    g.controls['product'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p: Product | null) => {
      if (p) this.fetchBalance(p.id);
    });
    // El costo unitario solo aplica a entradas; las salidas usan el costo promedio actual.
    g.controls['type'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((t: MoveType | null) => {
      const cost = g.controls['unit_cost'];
      if (t === 'salida') {
        cost.setValue(null);
        cost.disable();
      } else {
        cost.enable();
      }
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
    this.api
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

  /** Guarda el borrador; con `andConfirm` pide confirmación y aplica el ajuste al stock. */
  save(andConfirm = false): void {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin ítems', 'Agrega al menos un ítem al ajuste.');
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
    const neg = this.summary().negatives;
    this.confirm.confirm({
      header: 'Guardar y confirmar',
      message:
        'Confirmar aplica el ajuste al stock y no se puede editar después.' +
        (neg > 0 ? ` Hay ${neg} línea(s) cuyo stock resultante sería negativo; el sistema las rechazará.` : '') +
        ' ¿Continuar?',
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
    const current = this.adjustment();
    const save$ = current ? this.api.updateAdjustment(current.id, payload) : this.api.createAdjustment(payload);
    let savedId: number | null = null;
    save$
      .pipe(
        switchMap((saved) => {
          savedId = saved.id;
          return andConfirm ? this.api.adjustmentAction(saved.id, 'confirm') : of(saved);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          if (andConfirm) this.toast.success('Ajuste confirmado y aplicado al stock.', saved.number);
          else this.toast.success(current ? 'Ajuste actualizado.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/inventario/ajustes', saved.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (!(err instanceof HttpErrorResponse) || err.status !== 422) return;
          const body = err.error as Partial<ValidationErrors>;
          if (savedId !== null) {
            // Se guardó el borrador pero la confirmación falló (p. ej. stock insuficiente).
            this.toast.warn('Borrador guardado, pero no se pudo confirmar', body.message);
            void this.router.navigate(['/inventario/ajustes', savedId]);
            return;
          }
          this.serverErrors.set(body.errors ?? {});
          this.toast.warn(body.errors ? 'Revisa el formulario' : 'No se pudo guardar', body.message);
        },
      });
  }

  private toPayload(): AdjustmentPayload {
    const v = this.form.getRawValue();
    return {
      warehouse_id: v.warehouse_id as number,
      date: this.toIso(v.date) ?? '',
      reason: v.reason as string,
      notes: v.notes?.trim() || null,
      items: (v.items as ItemRow[]).map((r) => {
        const qty = Math.abs(Number(r.quantity ?? 0));
        const entry = r.type === 'entrada';
        return {
          id: r.id ?? undefined,
          product_id: r.product?.id as number,
          qty_base: entry ? qty : -qty,
          unit_cost: entry && r.unit_cost !== null && r.unit_cost !== undefined ? Number(r.unit_cost) : null,
          notes: r.notes?.trim() || null,
        };
      }),
    };
  }

  cancel(): void {
    const a = this.adjustment();
    void this.router.navigate(a ? ['/inventario/ajustes', a.id] : ['/inventario/ajustes']);
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

  statusTone = simpleStatusTone;

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
