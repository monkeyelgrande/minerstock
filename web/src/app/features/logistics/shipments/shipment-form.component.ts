import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { InventoryApi } from '../../../core/api/inventory-api.service';
import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Driver, Product, Vehicle } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { ProductWarehouseBalance } from '../../../core/models/inventory.model';
import { Shipment, ShipmentPayload, ShippablePendingItem, shipmentTone } from '../../../core/models/logistics.model';
import { PRIORITY_LABELS, Priority, priorityTone } from '../../../core/models/purchasing.model';
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
}

/** Valor crudo de una fila de ítem. */
interface ItemRow {
  id: number | null;
  product: Product | null;
  purchase_request_item_id: number | null;
  request_number: string | null;
  unit_id: number | null;
  quantity: number | null;
  notes: string | null;
}

interface VehicleOption {
  id: number;
  label: string;
}

/** Grupo de ítems pendientes por solicitud (diálogo "Traer pendientes"). */
interface PendingGroup {
  request: { id: number; number: string; priority: Priority; required_date: string | null };
  items: ShippablePendingItem[];
}

/** Formulario de planilla de viaje: ruta y transporte, ítems (manuales o desde solicitudes) y validación de stock en origen. */
@Component({
  selector: 'app-shipment-form',
  imports: [
    DatePipe, FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, DialogModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, ProductPickerComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipment-form.component.html',
})
export class ShipmentFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(LogisticsApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  /** Id de ruta (`planillas/:id/editar`); undefined en `planillas/nueva`. */
  readonly id = input<string>();

  readonly shipment = signal<Shipment | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly vehicles = signal<Vehicle[]>([]);
  readonly drivers = signal<Driver[]>([]);

  /** Saldos por bodega de cada producto usado en el formulario (cache por product_id). */
  readonly balances = signal<Map<number, ProductWarehouseBalance[]>>(new Map());
  private readonly balancesLoading = new Set<number>();

  // Diálogo "Traer pendientes de solicitudes"
  readonly pendingOpen = signal(false);
  readonly pendingLoading = signal(false);
  readonly pendingAdding = signal(false);
  readonly pendingItems = signal<ShippablePendingItem[]>([]);
  readonly pendingSelected = signal<Set<number>>(new Set());

  readonly form = this.fb.group({
    origin_warehouse_id: [null as number | null, Validators.required],
    destination_warehouse_id: [null as number | null, Validators.required],
    vehicle_id: [null as number | null],
    driver_id: [null as number | null],
    notes: [''],
    items: this.fb.array<FormGroup>([]),
  });

  /** Valor crudo del formulario como señal (incluye controles deshabilitados, p. ej. producto vinculado). */
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.shipment()?.number ?? 'planilla'}` : 'Nueva planilla de viaje'));

  readonly vehicleOptions = computed<VehicleOption[]>(() =>
    this.vehicles().map((v) => ({ id: v.id, label: `${v.plate} · ${v.type}${v.brand ? ' ' + v.brand : ''}` })),
  );

  readonly originId = computed(() => this.formValue().origin_warehouse_id ?? null);
  readonly destinationId = computed(() => this.formValue().destination_warehouse_id ?? null);

  /** La bodega destino no puede ser la misma de origen. */
  readonly destinationOptions = computed(() => this.ctx.options().filter((w) => w.id !== this.originId()));

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);

  /** Opciones de unidad por fila: unidad base + alternas del producto elegido. */
  readonly unitOptionsByRow = computed(() => this.rows().map((r) => this.unitOptions(r.product)));

  /** Cantidad en unidad base por fila (cantidad × factor de la unidad elegida). */
  readonly baseQtyByRow = computed(() =>
    this.rows().map((r, i) => {
      const unit = this.unitOptionsByRow()[i]?.find((u) => u.id === r.unit_id);
      return this.round3((r.quantity ?? 0) * (unit?.factor ?? 1));
    }),
  );

  /** Stock disponible en la bodega origen por fila (null si aún no se conoce). */
  readonly originStockByRow = computed(() => {
    const origin = this.originId();
    const balances = this.balances();
    return this.rows().map((r) => {
      if (!r.product || !origin) return null;
      const list = balances.get(r.product.id);
      if (!list) return null;
      return Number(list.find((b) => b.warehouse_id === origin)?.qty ?? 0);
    });
  });

  /** Filas cuya cantidad supera el stock disponible en origen. */
  readonly insufficientByRow = computed(() =>
    this.originStockByRow().map((stock, i) => stock !== null && this.baseQtyByRow()[i] > stock),
  );

  readonly anyInsufficient = computed(() => this.insufficientByRow().some(Boolean));

  /** Ítems pendientes agrupados por solicitud (excluye los ya vinculados en el formulario). */
  readonly pendingGroups = computed<PendingGroup[]>(() => {
    const linked = new Set(this.rows().map((r) => r.purchase_request_item_id).filter((x): x is number => x !== null));
    const groups = new Map<number, PendingGroup>();
    for (const it of this.pendingItems()) {
      if (linked.has(it.id)) continue;
      let g = groups.get(it.request.id);
      if (!g) {
        g = { request: it.request, items: [] };
        groups.set(it.request.id, g);
      }
      g.items.push(it);
    }
    return [...groups.values()];
  });

  readonly pendingVisibleCount = computed(() => this.pendingGroups().reduce((n, g) => n + g.items.length, 0));

  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    this.catalog.vehicles
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.vehicles.set(list));
    this.catalog.drivers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.drivers.set(list));

    // Carga la planilla cuando cambia el id de ruta (nueva → editar reutiliza el componente).
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });

    // Bodega origen por defecto: la activa en la topbar (solo al crear y si aún no se eligió).
    effect(() => {
      const active = this.ctx.activeId();
      untracked(() => {
        if (!this.isEdit() && active && !this.form.controls.origin_warehouse_id.value) {
          this.form.controls.origin_warehouse_id.setValue(active);
        }
      });
    });
  }

  // ---------- Carga ----------

  private load(id: number | null): void {
    this.serverErrors.set({});
    this.submitted.set(false);
    if (!id) {
      this.shipment.set(null);
      this.resetForm();
      return;
    }
    this.loading.set(true);
    this.api
      .shipment(id)
      .pipe(
        switchMap((s) => this.productsFor((s.items ?? []).map((i) => i.product_id)).pipe(map((products) => ({ s, products })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ s, products }) => {
          if (!s.is_editable) {
            this.toast.info('Planilla no editable', `${s.number} está en estado "${s.status_label}".`);
            void this.router.navigate(['/logistica/planillas', s.id]);
            return;
          }
          this.shipment.set(s);
          this.patchForm(s, products);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/logistica/planillas']);
        },
      });
  }

  /** Recarga solo la planilla (adjuntos) sin tocar el formulario. */
  reloadShipment(): void {
    const s = this.shipment();
    if (!s) return;
    this.api
      .shipment(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fresh) => this.shipment.set(fresh));
  }

  private resetForm(): void {
    this.itemsArray.clear();
    this.form.reset({
      origin_warehouse_id: this.ctx.activeId(),
      destination_warehouse_id: null,
      vehicle_id: null,
      driver_id: null,
      notes: '',
    });
  }

  private patchForm(s: Shipment, products: Map<number, Product>): void {
    this.itemsArray.clear();
    for (const it of s.items ?? []) {
      this.itemsArray.push(
        this.itemGroup({
          id: it.id,
          product: products.get(it.product_id) ?? null,
          purchase_request_item_id: it.purchase_request_item_id,
          request_number: it.request?.number ?? null,
          unit_id: it.unit_id,
          quantity: Number(it.quantity),
          notes: it.notes ?? '',
        }),
      );
      this.ensureBalances(it.product_id);
    }
    this.form.patchValue({
      origin_warehouse_id: s.origin_warehouse_id,
      destination_warehouse_id: s.destination_warehouse_id,
      vehicle_id: s.vehicle_id,
      driver_id: s.driver_id,
      notes: s.notes ?? '',
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

  /** Carga (una sola vez) los saldos por bodega de un producto, para la columna "Stock en origen". */
  private ensureBalances(productId: number): void {
    if (this.balances().has(productId) || this.balancesLoading.has(productId)) return;
    this.balancesLoading.add(productId);
    this.inventory
      .productBalances(productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.balancesLoading.delete(productId);
          const next = new Map(this.balances());
          next.set(productId, list);
          this.balances.set(next);
        },
        error: () => {
          this.balancesLoading.delete(productId);
          const next = new Map(this.balances());
          next.set(productId, []);
          this.balances.set(next);
        },
      });
  }

  // ---------- Ruta ----------

  onOriginChange(id: number | null): void {
    if (id && this.form.controls.destination_warehouse_id.value === id) {
      this.form.controls.destination_warehouse_id.setValue(null);
    }
  }

  // ---------- Ítems ----------

  private itemGroup(init: Partial<ItemRow> = {}): FormGroup {
    const linked = !!init.purchase_request_item_id;
    const g = this.fb.group({
      id: [init.id ?? null],
      product: [{ value: init.product ?? null, disabled: linked }, Validators.required],
      purchase_request_item_id: [init.purchase_request_item_id ?? null],
      request_number: [init.request_number ?? null],
      unit_id: [init.unit_id ?? null, Validators.required],
      quantity: [init.quantity ?? null, [Validators.required, Validators.min(0.001)]],
      notes: [init.notes ?? ''],
    });
    // Al cambiar el producto se propone la unidad base y se cargan sus saldos.
    g.controls['product'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p: Product | null) => {
      const opts = this.unitOptions(p);
      g.controls['unit_id'].setValue(opts[0]?.id ?? null);
      if (p) this.ensureBalances(p.id);
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
    const base: UnitOption = { id: p.base_unit_id, code: baseCode, factor: 1, label: baseCode };
    const alts = (p.units ?? []).map<UnitOption>((u) => {
      const code = u.unit?.code ?? String(u.unit_id);
      const factor = Number(u.factor);
      return { id: u.unit_id, code, factor, label: `${code} (${this.fmt(factor)} ${baseCode})` };
    });
    return [base, ...alts];
  }

  /** Cantidad en unidad base de una fila, para mostrar "= 24 UND". */
  baseHint(i: number): string {
    const r = this.rows()[i];
    if (!r?.product || !r.unit_id || !r.quantity) return '';
    const unit = this.unitOptionsByRow()[i]?.find((u) => u.id === r.unit_id);
    if (!unit || unit.factor === 1) return '';
    return `= ${this.fmt(this.baseQtyByRow()[i])} ${r.product.base_unit?.code ?? ''}`;
  }

  baseUnitCode(i: number): string {
    return this.rows()[i]?.product?.base_unit?.code ?? '';
  }

  // ---------- Pendientes de solicitudes ----------

  openPending(): void {
    const destination = this.destinationId();
    if (!destination) return;
    this.pendingOpen.set(true);
    this.pendingSelected.set(new Set());
    this.pendingLoading.set(true);
    this.api
      .pendingRequestItems(destination, this.originId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.pendingItems.set(list);
          this.pendingLoading.set(false);
        },
        error: () => this.pendingLoading.set(false),
      });
  }

  togglePending(it: ShippablePendingItem, checked: boolean): void {
    if (Number(it.origin_stock) <= 0) return;
    const next = new Set(this.pendingSelected());
    if (checked) next.add(it.id);
    else next.delete(it.id);
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
                notes: it.notes ?? '',
              }),
            );
            this.ensureBalances(it.product.id);
          }
          this.pendingAdding.set(false);
          this.pendingOpen.set(false);
          this.toast.success(items.length === 1 ? 'Ítem agregado a la planilla.' : `${items.length} ítems agregados a la planilla.`);
        },
        error: () => this.pendingAdding.set(false),
      });
  }

  priorityLabel(p: Priority): string {
    return PRIORITY_LABELS[p] ?? p;
  }

  // ---------- Guardar ----------

  /** Guarda como borrador y navega al detalle. */
  save(): void {
    this.doSave(false);
  }

  /** Confirma y luego guarda + despacha. Si el despacho falla, el borrador queda guardado. */
  saveAndDispatch(): void {
    if (!this.validate()) return;
    this.confirm.confirm({
      header: 'Despachar planilla',
      message: 'Despachar descarga el stock del origen al costo promedio y deja la mercancía en tránsito. ¿Continuar?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Guardar y despachar',
      rejectLabel: 'Cancelar',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.doSave(true),
    });
  }

  private validate(): boolean {
    this.submitted.set(true);
    if (!this.itemsArray.length) {
      this.toast.warn('Sin ítems', 'Agrega al menos un ítem a la planilla.');
      return false;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar.');
      return false;
    }
    return true;
  }

  private doSave(andDispatch: boolean): void {
    if (!this.validate() || this.saving()) return;
    this.saving.set(true);
    this.serverErrors.set({});
    const payload = this.toPayload();
    const current = this.shipment();
    const save$ = current ? this.api.updateShipment(current.id, payload) : this.api.createShipment(payload);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.form.markAsPristine();
        if (!andDispatch) {
          this.saving.set(false);
          this.toast.success(current ? 'Planilla actualizada.' : 'Borrador guardado.', saved.number);
          void this.router.navigate(['/logistica/planillas', saved.id]);
          return;
        }
        // Despacho tras guardar: si falla (p. ej. stock insuficiente) el borrador queda guardado.
        this.api
          .shipmentAction(saved.id, 'dispatch')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (fresh) => {
              this.saving.set(false);
              this.toast.success('Planilla despachada.', fresh.number);
              void this.router.navigate(['/logistica/planillas', fresh.id]);
            },
            error: (err: unknown) => {
              this.saving.set(false);
              const msg =
                err instanceof HttpErrorResponse && err.status === 422
                  ? (err.error as { message?: string }).message
                  : undefined;
              this.toast.warn('Borrador guardado, pero no se pudo despachar', msg ?? 'Inténtalo de nuevo desde el detalle.');
              void this.router.navigate(['/logistica/planillas', saved.id]);
            },
          });
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

  private toPayload(): ShipmentPayload {
    const v = this.form.getRawValue();
    return {
      origin_warehouse_id: v.origin_warehouse_id as number,
      destination_warehouse_id: v.destination_warehouse_id as number,
      vehicle_id: v.vehicle_id ?? null,
      driver_id: v.driver_id ?? null,
      notes: v.notes?.trim() || null,
      items: (v.items as ItemRow[]).map((r) => ({
        id: r.id ?? undefined,
        product_id: r.product?.id as number,
        purchase_request_item_id: r.purchase_request_item_id ?? null,
        unit_id: r.unit_id as number,
        quantity: Number(r.quantity ?? 0),
        notes: r.notes?.trim() || null,
      })),
    };
  }

  cancel(): void {
    const s = this.shipment();
    void this.router.navigate(s ? ['/logistica/planillas', s.id] : ['/logistica/planillas']);
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
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
  }

  shipmentTone = shipmentTone;
  priorityTone = priorityTone;

  private round3(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
}
