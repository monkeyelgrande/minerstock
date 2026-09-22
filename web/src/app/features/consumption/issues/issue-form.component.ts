import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { CostCenter, Product, Recipient, Unit } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { Issue, IssuePayload, issueTone } from '../../../core/models/consumption.model';
import { ProductWarehouseBalance } from '../../../core/models/inventory.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { WarehouseContext } from '../../../core/services/warehouse-context.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
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
}

/** Información derivada de una fila: unidades, equivalente en base y stock disponible. */
interface RowMeta {
  options: UnitOption[];
  unit: UnitOption | null;
  decimals: 0 | 3;
  baseCode: string;
  /** "= N UND" cuando la unidad elegida no es la base. */
  equivalent: string;
  hint: string;
  /** Cantidad pedida convertida a unidad base. */
  qtyBase: number;
  stockLoaded: boolean;
  stock: number;
  exceeded: boolean;
}

type ItemGroup = FormGroup<{
  id: FormControl<number | null>;
  product: FormControl<Product | null>;
  unit_id: FormControl<number | null>;
  quantity: FormControl<number | null>;
  notes: FormControl<string | null>;
}>;

/** Formulario de vale de salida: bodega, receptor, centro de costo e ítems con conversión de unidad. */
@Component({
  selector: 'app-issue-form',
  imports: [
    ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule, SelectModule,
    TextareaModule, TooltipModule, AttachmentsComponent, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './issue-form.component.html',
})
export class IssueFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(ConsumptionApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`vales/:id/editar`); undefined en `vales/nuevo`. */
  readonly id = input<string>();

  readonly issue = signal<Issue | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly recipients = signal<Recipient[]>([]);
  readonly costCenters = signal<CostCenter[]>([]);
  /** Catálogo de unidades (para saber si admiten decimales). */
  readonly allUnits = signal<Unit[]>([]);
  /** Saldos por producto (todas las bodegas), cacheados por id de producto. */
  private readonly balances = signal<Map<number, ProductWarehouseBalance[]>>(new Map());
  private readonly balanceLoading = new Set<number>();

  /** Tipo de adjuntable del vale (el modelo compartido aún no lo incluye en la unión). */
  readonly attachType = 'issue' as unknown as AttachableType;

  readonly form = this.fb.group({
    warehouse_id: this.fb.control<number | null>(null, Validators.required),
    recipient_id: this.fb.control<number | null>(null, Validators.required),
    cost_center_id: this.fb.control<number | null>(null),
    date: this.fb.control<Date | null>(new Date(), Validators.required),
    notes: this.fb.control<string>('', { nonNullable: true }),
    items: this.fb.array<ItemGroup>([]),
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.issue()?.number ?? 'vale'}` : 'Nuevo vale de salida'));
  readonly statusLabel = computed(() => this.issue()?.status_label ?? 'Borrador');
  readonly statusTone = computed(() => issueTone(this.issue()?.status ?? 'borrador'));

  private readonly warehouseId = computed(() => this.formValue().warehouse_id ?? null);

  /** Metadatos por fila: opciones de unidad, equivalente en base y stock disponible en la bodega. */
  readonly rowMeta = computed<RowMeta[]>(() => {
    const wh = this.warehouseId();
    const cache = this.balances();
    const units = this.allUnits();
    const rows = this.formValue().items;
    return rows.map((r) => {
      const product = r.product ?? null;
      const options = product ? this.unitOptionsFor(product, units) : [];
      const unit = options.find((u) => u.id === r.unit_id) ?? null;
      const qty = Number(r.quantity ?? 0);
      const baseCode = product?.base_unit?.code ?? '';
      const qtyBase = this.round3(qty * (unit?.factor ?? 1));
      const equivalent = unit && unit.factor !== 1 && qty > 0 ? `= ${this.fmt(qtyBase)} ${baseCode}` : '';
      const list = product ? cache.get(product.id) : undefined;
      const cell = list?.find((b) => b.warehouse_id === wh);
      const stock = Number(cell?.qty ?? 0);
      const stockLoaded = list !== undefined;
      const exceeded = !!product && stockLoaded && wh !== null && qtyBase > stock;
      return { options, unit, decimals: unit?.allowsDecimals ? 3 : 0, baseCode, equivalent, hint: unit?.hint ?? '', qtyBase, stockLoaded, stock, exceeded };
    });
  });

  /** Filas cuya cantidad pedida (en base) supera el stock disponible. El servidor tiene la última palabra. */
  readonly exceededCount = computed(() => this.rowMeta().filter((m) => m.exceeded).length);

  get itemsArray(): FormArray<ItemGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.catalog.recipients
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.recipients.set(list));
    this.catalog.costCenters
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.costCenters.set(list));
    this.catalog.units
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((units) => this.allUnits.set(units));

    // Al elegir receptor se sugiere su centro de costo (solo si el usuario no lo ha tocado).
    this.form.controls.recipient_id.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      const cc = this.form.controls.cost_center_id;
      if (cc.dirty) return;
      const recipient = this.recipients().find((r) => r.id === id);
      cc.setValue(recipient?.cost_center_id ?? null);
    });

    // Carga el vale cuando cambia el id de ruta (nuevo → editar reutiliza el componente).
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
      this.issue.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .issue(id)
      .pipe(
        switchMap((v) => this.productsFor((v.items ?? []).map((i) => i.product_id)).pipe(map((products) => ({ v, products })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ v, products }) => {
          if (!v.is_editable) {
            this.toast.info('Vale no editable', `${v.number} está en estado "${v.status_label}".`);
            void this.router.navigate(['/bodega/vales', v.id]);
            return;
          }
          this.issue.set(v);
          this.patchForm(v, products);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/bodega/vales']);
        },
      });
  }

  /** Recarga solo el vale (adjuntos) sin tocar el formulario. */
  reloadIssue(): void {
    const v = this.issue();
    if (!v) return;
    this.api
      .issue(v.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.issue.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({ warehouse_id: this.ctx.activeId(), recipient_id: null, cost_center_id: null, date: new Date(), notes: '' });
    this.addItem();
    this.form.markAsPristine();
  }

  private patchForm(v: Issue, products: Map<number, Product>): void {
    this.itemsArray.clear();
    for (const it of v.items ?? []) {
      this.itemsArray.push(
        this.itemGroup({
          id: it.id,
          product: products.get(it.product_id) ?? null,
          unit_id: it.unit_id,
          quantity: Number(it.quantity),
          notes: it.notes ?? '',
        }),
      );
    }
    if (!this.itemsArray.length) this.addItem();
    // El orden importa: recipient_id dispara la sugerencia de centro de costo y luego se fija el real.
    this.form.patchValue({
      warehouse_id: v.warehouse_id,
      recipient_id: v.recipient_id,
      cost_center_id: v.cost_center_id,
      date: this.parseDate(v.date) ?? new Date(),
      notes: v.notes ?? '',
    });
    this.form.markAsPristine();
  }

  private productsFor(ids: number[]): Observable<Map<number, Product>> {
    const distinct = [...new Set(ids)];
    if (!distinct.length) return of(new Map<number, Product>());
    return forkJoin(distinct.map((id) => this.catalog.products.get(id))).pipe(map((list) => new Map(list.map((p) => [p.id, p]))));
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
    // Al cambiar el producto se propone la unidad base y se consulta el stock.
    g.controls.product.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const unitCtrl = g.controls.unit_id;
      if (!p) {
        unitCtrl.setValue(null);
        unitCtrl.disable();
        return;
      }
      unitCtrl.setValue(p.base_unit_id);
      unitCtrl.enable();
      this.fetchBalance(p.id);
    });
    if (init?.product) this.fetchBalance(init.product.id);
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
        };
      });
    return [base, ...alternates];
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

  /** Guarda el borrador; con `andConfirm` pide confirmación y descarga el stock. */
  save(andConfirm = false): void {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin ítems', 'Agrega al menos un ítem al vale.');
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
    const exceeded = this.exceededCount();
    this.confirm.confirm({
      header: 'Guardar y confirmar',
      message:
        'Confirmar descuenta el stock de la bodega al costo promedio.' +
        (exceeded > 0 ? ` Hay ${exceeded} línea(s) que superan el stock disponible; el sistema las rechazará.` : '') +
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
    const current = this.issue();
    const save$ = current ? this.api.updateIssue(current.id, payload) : this.api.createIssue(payload);
    let savedId: number | null = null;
    save$
      .pipe(
        switchMap((saved) => {
          savedId = saved.id;
          return andConfirm ? this.api.issueAction(saved.id, 'confirm') : of(saved);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.form.markAsPristine();
          if (andConfirm) this.toast.success('Vale confirmado y stock descontado.', saved.number);
          else this.toast.success(current ? 'Vale actualizado.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/bodega/vales', saved.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (!(err instanceof HttpErrorResponse) || err.status !== 422) return;
          const body = err.error as Partial<ValidationErrors>;
          if (savedId !== null) {
            // Se guardó el borrador pero la confirmación falló (p. ej. stock insuficiente).
            this.toast.warn('Borrador guardado, pero no se pudo confirmar', body.message);
            void this.router.navigate(['/bodega/vales', savedId]);
            return;
          }
          this.serverErrors.set(body.errors ?? {});
          this.toast.warn(body.errors ? 'Revisa el formulario' : 'No se pudo guardar', body.message);
        },
      });
  }

  private toPayload(): IssuePayload {
    const v = this.form.getRawValue();
    return {
      warehouse_id: v.warehouse_id as number,
      recipient_id: v.recipient_id as number,
      cost_center_id: v.cost_center_id ?? null,
      date: this.toIso(v.date) ?? '',
      notes: v.notes?.trim() || null,
      items: v.items.map((r) => ({
        id: r.id ?? undefined,
        product_id: r.product?.id as number,
        unit_id: r.unit_id as number,
        quantity: Number(r.quantity),
        notes: r.notes?.trim() || null,
      })),
    };
  }

  cancel(): void {
    const v = this.issue();
    void this.router.navigate(v ? ['/bodega/vales', v.id] : ['/bodega/vales']);
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

  showError(g: ItemGroup, field: 'product' | 'unit_id' | 'quantity'): boolean {
    const c = g.controls[field];
    return c.enabled && c.invalid && (c.touched || this.submitted());
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n);
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
