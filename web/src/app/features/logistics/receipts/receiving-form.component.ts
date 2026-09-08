import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
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
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ValidationErrors } from '../../../core/models/common.model';
import { Shipment, ShipmentReceipt, ShipmentReceiptPayload } from '../../../core/models/logistics.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Datos fijos de una fila (vienen de la planilla), paralelos al FormArray. */
interface RowMeta {
  shipment_item_id: number;
  product: { id: number; sku: string; name: string; base_unit: string | null };
  qty_base: number;
  pending_base: number;
}

/** Valor crudo de una fila del formulario. */
interface ItemRow {
  include: boolean;
  shipment_item_id: number;
  qty_received_base: number | null;
  qty_damaged_base: number | null;
  qty_extra_base: number | null;
  notes: string | null;
}

/** Cálculos derivados por fila. */
interface RowCalc {
  missing: number;
  hasNovelty: boolean;
  issue: string | null;
}

/** Opción del select de planillas recibibles. */
interface ShipmentOption {
  id: number;
  label: string;
  shipment: Shipment;
}

function docTone(status: string): ChipTone {
  return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
}

/**
 * Formulario de recepción en mina: planilla despachada, cantidades recibidas / dañadas / sobrantes
 * por ítem pendiente (en unidad base) y foto de la planilla firmada como requisito para confirmar.
 */
@Component({
  selector: 'app-receiving-form',
  imports: [
    DatePipe, DecimalPipe, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, FieldComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receiving-form.component.html',
})
export class ReceivingFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(LogisticsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  /** Id de ruta (`recepcion/:id/editar`); undefined en `recepcion/nueva`. */
  readonly id = input<string>();
  /** Query param `?shipment=` para preseleccionar la planilla al crear. */
  readonly shipment = input<string>();

  readonly receipt = signal<ShipmentReceipt | null>(null);
  readonly shipments = signal<Shipment[]>([]);
  readonly selectedShipment = signal<Shipment | null>(null);
  readonly meta = signal<RowMeta[]>([]);
  readonly loading = signal(false);
  readonly shipmentsLoading = signal(false);
  readonly shipmentLoading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.group({
    shipment_id: [null as number | null, Validators.required],
    received_at: [new Date() as Date | null, Validators.required],
    notes: ['', Validators.maxLength(2000)],
    items: this.fb.array<FormGroup>([]),
  });

  /** Valor crudo del formulario como señal (incluye filas excluidas, cuyos controles están deshabilitados). */
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => (this.isEdit() ? `Editar ${this.receipt()?.number ?? 'recepción'}` : 'Registrar recepción'));
  readonly hasSignedSheet = computed(() => !!this.receipt()?.has_signed_sheet);

  readonly shipmentOptions = computed<ShipmentOption[]>(() =>
    this.shipments().map((s) => ({
      id: s.id,
      label: [
        s.number,
        `${s.origin?.code ?? s.origin?.name ?? '—'} → ${s.destination?.code ?? s.destination?.name ?? '—'}`,
        s.vehicle?.plate,
      ]
        .filter(Boolean)
        .join(' · '),
      shipment: s,
    })),
  );

  private readonly rows = computed(() => (this.formValue().items ?? []) as ItemRow[]);

  /** Faltante calculado, novedad y posible exceso por fila. */
  readonly calc = computed<RowCalc[]>(() =>
    this.rows().map((r, i) => {
      const m = this.meta()[i];
      if (!m) return { missing: 0, hasNovelty: false, issue: null };
      const received = r.qty_received_base ?? 0;
      const damaged = r.qty_damaged_base ?? 0;
      const extra = r.qty_extra_base ?? 0;
      const missing = Math.max(0, this.round3(m.pending_base - received - damaged));
      const issue =
        r.include && received + damaged > m.pending_base + 0.0005
          ? `Recibido + dañado supera lo pendiente (${this.fmt(m.pending_base)} ${m.product.base_unit ?? ''})`.trim()
          : null;
      return { missing, hasNovelty: r.include && (missing > 0 || damaged > 0 || extra > 0), issue };
    }),
  );

  readonly includedCount = computed(() => this.rows().filter((r) => r.include).length);
  readonly noveltyCount = computed(() => this.calc().filter((c, i) => this.rows()[i]?.include && c.hasNovelty).length);
  readonly cleanCount = computed(() => this.includedCount() - this.noveltyCount());
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
      this.loadShipments();
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
            void this.router.navigate(['/logistica/recepcion', r.id]);
            return;
          }
          this.receipt.set(r);
          this.api
            .shipment(r.shipment_id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (s) => {
                this.selectedShipment.set(s);
                this.patchForm(r, s);
                this.loading.set(false);
              },
              error: () => {
                this.selectedShipment.set(null);
                this.patchForm(r, null);
                this.loading.set(false);
              },
            });
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/logistica/recepcion']);
        },
      });
  }

  /** Planillas despachadas / recibidas parcialmente que se pueden recibir (modo creación). */
  private loadShipments(): void {
    this.shipmentsLoading.set(true);
    this.api
      .shipments({ status: 'despachada,recibida_parcial', per_page: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.shipments.set(res.data);
          this.shipmentsLoading.set(false);
          const preset = this.shipment();
          if (preset && !this.form.controls.shipment_id.value) {
            const found = res.data.find((s) => s.id === +preset);
            if (found) this.onShipmentChange(found.id);
            else this.toast.info('Planilla no disponible', 'La planilla indicada no tiene ítems pendientes de recibir.');
          }
        },
        error: () => this.shipmentsLoading.set(false),
      });
  }

  /** Recarga solo la recepción (adjuntos / planilla firmada) sin tocar el formulario. */
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
    this.selectedShipment.set(null);
    this.form.reset({ shipment_id: null, received_at: new Date(), notes: '' });
    this.form.controls.shipment_id.enable();
  }

  // ---------- Planilla ----------

  /** Al elegir planilla (creando) se cargan sus ítems con pendiente. */
  onShipmentChange(id: number | null): void {
    this.form.controls.shipment_id.setValue(id);
    this.itemsArray.clear();
    this.meta.set([]);
    this.selectedShipment.set(null);
    if (!id) return;
    this.shipmentLoading.set(true);
    this.api
      .shipment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.shipmentLoading.set(false);
          // Ignora respuestas tardías si el usuario cambió de planilla.
          if (this.form.controls.shipment_id.value !== s.id) return;
          this.selectedShipment.set(s);
          this.buildRows(s);
        },
        error: () => this.shipmentLoading.set(false),
      });
  }

  /** Filas desde los ítems de la planilla con pendiente > 0 (recibido prellenado = pendiente). */
  private buildRows(s: Shipment): void {
    this.itemsArray.clear();
    const metas: RowMeta[] = [];
    for (const it of s.items ?? []) {
      const pending = Number(it.pending_base);
      if (pending <= 0) continue;
      metas.push(this.metaFromShipmentItem(it.id, it.product, Number(it.qty_base), pending));
      this.itemsArray.push(
        this.itemGroup({ include: true, shipment_item_id: it.id, qty_received_base: pending, qty_damaged_base: 0, qty_extra_base: 0, notes: '' }),
      );
    }
    this.meta.set(metas);
  }

  /** Modo edición: mezcla los ítems guardados con los pendientes actuales de la planilla. */
  private patchForm(r: ShipmentReceipt, s: Shipment | null): void {
    this.itemsArray.clear();
    const metas: RowMeta[] = [];
    const saved = new Map((r.items ?? []).map((it) => [it.shipment_item_id, it]));
    const seen = new Set<number>();

    for (const si of s?.items ?? []) {
      const pending = Number(si.pending_base);
      const it = saved.get(si.id);
      if (pending <= 0 && !it) continue;
      seen.add(si.id);
      metas.push(this.metaFromShipmentItem(si.id, si.product, Number(si.qty_base), pending));
      this.itemsArray.push(
        this.itemGroup(
          it
            ? {
                include: true,
                shipment_item_id: si.id,
                qty_received_base: Number(it.qty_received_base),
                qty_damaged_base: Number(it.qty_damaged_base),
                qty_extra_base: Number(it.qty_extra_base),
                notes: it.notes ?? '',
              }
            : { include: false, shipment_item_id: si.id, qty_received_base: pending, qty_damaged_base: 0, qty_extra_base: 0, notes: '' },
        ),
      );
    }
    // Ítems del borrador cuyo ítem de planilla ya no viene en la respuesta (se conservan para poder corregirlos).
    for (const it of r.items ?? []) {
      if (seen.has(it.shipment_item_id)) continue;
      metas.push(
        this.metaFromShipmentItem(
          it.shipment_item_id,
          it.product,
          Number(it.shipment_item?.qty_base ?? 0),
          Number(it.shipment_item?.pending_base ?? 0),
        ),
      );
      this.itemsArray.push(
        this.itemGroup({
          include: true,
          shipment_item_id: it.shipment_item_id,
          qty_received_base: Number(it.qty_received_base),
          qty_damaged_base: Number(it.qty_damaged_base),
          qty_extra_base: Number(it.qty_extra_base),
          notes: it.notes ?? '',
        }),
      );
    }
    this.meta.set(metas);

    this.form.patchValue({
      shipment_id: r.shipment_id,
      received_at: this.parseDate(r.received_at) ?? new Date(),
      notes: r.notes ?? '',
    });
    this.form.controls.shipment_id.disable();
    this.form.markAsPristine();
  }

  private metaFromShipmentItem(
    shipmentItemId: number,
    product: { id: number; sku: string; name: string; base_unit: string | null } | null,
    qtyBase: number,
    pendingBase: number,
  ): RowMeta {
    return {
      shipment_item_id: shipmentItemId,
      product: {
        id: product?.id ?? 0,
        sku: product?.sku ?? '',
        name: product?.name ?? 'Producto',
        base_unit: product?.base_unit ?? null,
      },
      qty_base: qtyBase,
      pending_base: pendingBase,
    };
  }

  // ---------- Ítems ----------

  private itemGroup(init: ItemRow): FormGroup {
    const include = init.include;
    return this.fb.group({
      include: [include],
      shipment_item_id: [init.shipment_item_id],
      qty_received_base: [{ value: init.qty_received_base, disabled: !include }, [Validators.required, Validators.min(0)]],
      qty_damaged_base: [{ value: init.qty_damaged_base, disabled: !include }, Validators.min(0)],
      qty_extra_base: [{ value: init.qty_extra_base, disabled: !include }, Validators.min(0)],
      notes: [{ value: init.notes ?? '', disabled: !include }, Validators.maxLength(255)],
    });
  }

  /** Incluir / excluir una línea: las excluidas quedan en tránsito para una próxima recepción. */
  onIncludeChange(i: number, checked: boolean): void {
    const g = this.itemsArray.at(i);
    for (const key of ['qty_received_base', 'qty_damaged_base', 'qty_extra_base', 'notes']) {
      if (checked) g.controls[key].enable();
      else g.controls[key].disable();
    }
  }

  // ---------- Guardar ----------

  /** Guarda el borrador; con `andConfirm` (solo edición) pide confirmación e ingresa la mercancía al stock. */
  save(andConfirm = false): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warn('Revisa el formulario', 'Hay campos obligatorios sin completar o cantidades no válidas.');
      return;
    }
    if (!this.includedCount()) {
      this.toast.warn('Sin ítems', 'Incluye al menos una línea de la planilla.');
      return;
    }
    if (this.hasIssues()) {
      this.toast.warn('Cantidades no válidas', 'Hay líneas donde recibido + dañado supera lo pendiente.');
      return;
    }
    if (!andConfirm) {
      this.persist(false);
      return;
    }
    this.confirm.confirm({
      header: 'Guardar y confirmar',
      message: 'Confirmar ingresa al stock lo recibido en buen estado y registra las novedades. ¿Continuar?',
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
          if (current) {
            this.toast.success('Recepción actualizada.', saved.number);
          } else {
            this.toast.success('Borrador guardado.', `${saved.number} · adjunta la planilla firmada para confirmar.`);
          }
          void this.router.navigate(['/logistica/recepcion', saved.id]);
          return;
        }
        this.api
          .receiptAction(saved.id, 'confirm')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (confirmed) => {
              this.saving.set(false);
              this.toast.success('Recepción confirmada.', `${confirmed.number} · mercancía ingresada al stock.`);
              void this.router.navigate(['/logistica/recepcion', confirmed.id]);
            },
            error: (err: unknown) => {
              this.saving.set(false);
              this.toast.warn('Borrador guardado, pero no se pudo confirmar', this.messageOf(err));
              void this.router.navigate(['/logistica/recepcion', saved.id]);
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

  private toPayload(): { payload: ShipmentReceiptPayload; rowIndexes: number[] } {
    const v = this.form.getRawValue();
    const rowIndexes: number[] = [];
    const items: ShipmentReceiptPayload['items'] = [];
    (v.items as ItemRow[]).forEach((r, i) => {
      if (!r.include) return;
      rowIndexes.push(i);
      items.push({
        shipment_item_id: r.shipment_item_id,
        qty_received_base: Number(r.qty_received_base ?? 0),
        qty_damaged_base: Number(r.qty_damaged_base ?? 0),
        qty_extra_base: Number(r.qty_extra_base ?? 0),
        notes: r.notes?.trim() || null,
      });
    });
    return {
      payload: {
        shipment_id: v.shipment_id as number,
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
    void this.router.navigate(r ? ['/logistica/recepcion', r.id] : ['/logistica/recepcion']);
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
