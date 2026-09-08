import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { Quotation, QuotationItem, QuotationResponsePayload, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

/** Fila editable del diálogo "Registrar respuesta". */
interface RespondRow {
  id: number;
  productName: string;
  productSku: string;
  quantity: number;
  unitCode: string;
  not_quoted: boolean;
  unit_price: number | null;
  tax_rate: number;
  delivery_days: number | null;
}

/** Detalle de una cotización (flujo RFQ): datos, ítems, adjuntos, envío al proveedor y registro de su respuesta. */
@Component({
  selector: 'app-quotation-detail',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, FormsModule, RouterLink,
    ButtonModule, CheckboxModule, DatePickerModule, DialogModule, InputNumberModule, MultiSelectModule, SelectModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quotation-detail.component.html',
})
export class QuotationDetailComponent {
  private readonly api = inject(PurchasingApi);
  private readonly catalog = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly quotation = signal<Quotation | null>(null);
  readonly loading = signal(false);
  readonly acting = signal(false);

  // Diálogo "Enviar solicitud de cotización"
  readonly sendOpen = signal(false);
  readonly sending = signal(false);
  readonly sendSupplierIds = signal<number[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  private suppliersLoaded = false;

  // Diálogo "Registrar respuesta"
  readonly respondOpen = signal(false);
  readonly responding = signal(false);
  readonly respondRows = signal<RespondRow[]>([]);
  readonly respondValidUntil = signal<Date | null>(null);

  readonly canUpdate = computed(() => this.auth.can('quotations.update'));
  readonly canDelete = computed(() => this.auth.can('quotations.delete'));
  readonly canEdit = computed(() => !!this.quotation()?.is_editable && this.canUpdate());
  readonly canSend = computed(() => this.quotation()?.status === 'borrador' && this.canUpdate());
  readonly canRespond = computed(() => !!this.quotation()?.can_respond && this.canUpdate());
  readonly canDiscard = computed(() => {
    const s = this.quotation()?.status;
    return (s === 'borrador' || s === 'enviada' || s === 'recibida') && this.canUpdate();
  });
  readonly canRemove = computed(() => this.quotation()?.status === 'borrador' && this.canDelete());
  readonly canCompare = computed(() => {
    const s = this.quotation()?.status;
    return s === 'recibida' || s === 'seleccionada';
  });

  readonly items = computed(() => this.quotation()?.items ?? []);
  readonly selectedCount = computed(() => this.items().filter((i) => i.is_selected || i.purchase_order_item_id).length);
  /** "Marcar recibida" (borrador) solo cuando todos los ítems tienen precio o "no cotizó". */
  readonly allPriced = computed(() => {
    const rows = this.items();
    return rows.length > 0 && rows.every((i) => i.not_quoted || i.unit_price !== null);
  });
  readonly canReceive = computed(() => this.quotation()?.status === 'borrador' && this.allPriced() && this.canUpdate());

  /** Proveedores adicionales elegibles en el diálogo de envío (excluye al destinatario). */
  readonly sendSupplierOptions = computed(() => {
    const currentId = this.quotation()?.supplier_id;
    return this.suppliers().filter((s) => s.id !== currentId);
  });

  readonly taxOptions = [
    { label: '0 %', value: 0 },
    { label: '5 %', value: 5 },
    { label: '19 %', value: 19 },
  ];

  /** Totales en vivo del diálogo de respuesta (solo filas con precio). */
  readonly respondTotals = computed(() => {
    const rows = this.respondRows();
    let subtotal = 0;
    let tax = 0;
    for (const r of rows) {
      if (r.not_quoted || r.unit_price === null) continue;
      const line = r.quantity * r.unit_price;
      subtotal += line;
      tax += line * ((r.tax_rate || 0) / 100);
    }
    return { subtotal, tax, total: subtotal + tax };
  });

  /** La respuesta exige cada ítem con precio o "no cotizó", y al menos uno con precio. */
  readonly respondValid = computed(() => {
    const rows = this.respondRows();
    return (
      rows.length > 0 &&
      rows.every((r) => r.not_quoted || r.unit_price !== null) &&
      rows.some((r) => !r.not_quoted && r.unit_price !== null)
    );
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  load(id: number | null): void {
    if (!id) {
      void this.router.navigate(['/compras/cotizaciones']);
      return;
    }
    this.loading.set(true);
    this.api
      .quotation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          this.quotation.set(q);
          this.loading.set(false);
          this.maybeAutoOpenRespond(q);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/compras/cotizaciones']);
        },
      });
  }

  /** Abre el diálogo de respuesta al llegar con `?respond=1` (desde el listado). */
  private maybeAutoOpenRespond(q: Quotation): void {
    if (this.route.snapshot.queryParamMap.get('respond') !== '1') return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { respond: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (q.can_respond && this.canUpdate()) this.openRespond();
  }

  reload(): void {
    const q = this.quotation();
    if (q) this.load(q.id);
  }

  goEdit(): void {
    const q = this.quotation();
    if (q) void this.router.navigate(['/compras/cotizaciones', q.id, 'editar']);
  }

  goComparison(): void {
    const q = this.quotation();
    if (q) void this.router.navigate(['/compras/comparativa'], { queryParams: { supplier_id: q.supplier_id } });
  }

  /** Abre el PDF "Solicitud de cotización" en una pestaña nueva. */
  downloadPdf(): void {
    const q = this.quotation();
    if (!q) return;
    this.api
      .quotationPdf(q.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((blob) => window.open(URL.createObjectURL(blob)));
  }

  // ---------- Enviar al proveedor ----------

  openSend(): void {
    this.sendSupplierIds.set([]);
    this.sendOpen.set(true);
    if (this.suppliersLoaded) return;
    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        this.suppliers.set(list);
        this.suppliersLoaded = true;
      });
  }

  confirmSend(): void {
    const q = this.quotation();
    if (!q) return;
    this.sending.set(true);
    this.api
      .sendQuotation(q.id, this.sendSupplierIds())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          this.sendOpen.set(false);
          this.toast.success(res.message, q.number);
          if (res.data.length > 1) {
            void this.router.navigate(['/compras/cotizaciones'], { queryParams: { status: 'enviada' } });
          } else {
            this.reload();
          }
        },
        error: (err: unknown) => {
          this.sending.set(false);
          this.toastDomainError('No se pudo enviar', err);
        },
      });
  }

  // ---------- Registrar respuesta ----------

  openRespond(): void {
    const q = this.quotation();
    if (!q) return;
    this.respondRows.set((q.items ?? []).map((i) => this.respondRowFrom(i)));
    this.respondValidUntil.set(this.parseDate(q.valid_until));
    this.respondOpen.set(true);
  }

  private respondRowFrom(i: QuotationItem): RespondRow {
    return {
      id: i.id,
      productName: i.product?.name ?? '—',
      productSku: i.product?.sku ?? '',
      quantity: Number(i.quantity),
      unitCode: i.unit?.code ?? '',
      not_quoted: i.not_quoted,
      unit_price: i.unit_price !== null && i.unit_price !== undefined ? Number(i.unit_price) : null,
      tax_rate: Number(i.tax_rate) || 0,
      delivery_days: i.delivery_days,
    };
  }

  patchRow(id: number, patch: Partial<RespondRow>): void {
    this.respondRows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  toggleNotQuoted(id: number, checked: boolean): void {
    this.patchRow(id, checked ? { not_quoted: true, unit_price: null } : { not_quoted: false });
  }

  submitRespond(): void {
    const q = this.quotation();
    if (!q || !this.respondValid()) return;
    this.responding.set(true);
    const validUntil = this.respondValidUntil();
    const payload: QuotationResponsePayload = {
      valid_until: validUntil ? this.toIsoDate(validUntil) : null,
      items: this.respondRows().map((r) => ({
        id: r.id,
        unit_price: r.not_quoted ? null : r.unit_price,
        tax_rate: r.tax_rate,
        delivery_days: r.delivery_days,
        not_quoted: r.not_quoted,
      })),
    };
    this.api
      .respondQuotation(q.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.responding.set(false);
          this.respondOpen.set(false);
          this.quotation.set(updated);
          this.toast.success('Respuesta del proveedor registrada.', updated.number);
        },
        error: (err: unknown) => {
          this.responding.set(false);
          this.toastDomainError('No se pudo registrar la respuesta', err);
        },
      });
  }

  // ---------- Transiciones ----------

  receive(): void {
    const q = this.quotation();
    if (!q) return;
    this.runAction(q, 'receive', 'Cotización marcada como recibida.');
  }

  discard(): void {
    const q = this.quotation();
    if (!q) return;
    const hint = q.status === 'enviada' ? ' Úsalo si el proveedor no respondió.' : ' Sus ítems dejarán de aparecer en la comparativa.';
    this.confirm.confirm({
      header: 'Descartar cotización',
      message: `¿Descartar la cotización ${q.number}?${hint}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Descartar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => this.runAction(q, 'discard', 'Cotización descartada.'),
    });
  }

  remove(): void {
    const q = this.quotation();
    if (!q) return;
    this.confirm.confirm({
      header: 'Eliminar cotización',
      message: `¿Eliminar la cotización ${q.number}? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.acting.set(true);
        this.api
          .deleteQuotation(q.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.acting.set(false);
              this.toast.success('Cotización eliminada.', q.number);
              void this.router.navigate(['/compras/cotizaciones']);
            },
            error: (err: unknown) => {
              this.acting.set(false);
              this.toastDomainError('No se pudo eliminar', err);
            },
          });
      },
    });
  }

  private runAction(q: Quotation, action: 'receive' | 'discard', okMessage: string): void {
    this.acting.set(true);
    this.api
      .quotationAction(q.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.quotation.set(updated);
          this.toast.success(okMessage, updated.number);
        },
        error: (err: unknown) => {
          this.acting.set(false);
          this.toastDomainError('No se pudo cambiar el estado', err);
        },
      });
  }

  /** Errores de regla de negocio (422 con solo `message`): el interceptor no los muestra. */
  private toastDomainError(summary: string, err: unknown): void {
    const e = err as { status?: number; error?: { message?: string; errors?: unknown } };
    if (e?.status === 422 && !e.error?.errors) this.toast.error(summary, e.error?.message);
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private toIsoDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  statusTone = statusTone;
}
