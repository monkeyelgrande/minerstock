import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { LogisticsApi } from '../../../core/api/logistics-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Shipment, ShipmentItem, ShipmentStatus, shipmentTone } from '../../../core/models/logistics.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type ShipmentAction = 'dispatch' | 'cancel' | 'close';

interface Step {
  key: ShipmentStatus;
  label: string;
  /** skipped: paso de recepción que no ocurrió (p. ej. cerrada sin recibir todo). */
  state: 'done' | 'current' | 'todo' | 'skipped';
}

/** Flujo normal de una planilla (anulada se muestra como banner). */
const FLOW: { key: ShipmentStatus; label: string }[] = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'despachada', label: 'Despachada' },
  { key: 'recibida_parcial', label: 'Recibida parcial' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'cerrada', label: 'Cerrada' },
];

const CLOSE_STATUSES: ShipmentStatus[] = ['recibida', 'recibida_parcial'];
const CANCEL_STATUSES: ShipmentStatus[] = ['borrador', 'despachada'];

/** Detalle de planilla de viaje: estado, acciones de flujo, ítems con avance de recepción y trazabilidad. */
@Component({
  selector: 'app-shipment-detail',
  imports: [
    CurrencyPipe, DatePipe, RouterLink, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipment-detail.component.html',
})
export class ShipmentDetailComponent {
  private readonly api = inject(LogisticsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly shipment = signal<Shipment | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<ShipmentAction | null>(null);
  readonly pdfLoading = signal(false);

  // ---------- Permisos y acciones disponibles ----------
  readonly canUpdate = computed(() => this.auth.can('shipments.update'));
  readonly canDispatch = computed(() => this.auth.can('shipments.dispatch'));
  readonly canDelete = computed(() => this.auth.can('shipments.delete'));

  private readonly status = computed(() => this.shipment()?.status ?? null);

  readonly showEdit = computed(() => !!this.shipment()?.is_editable && this.canUpdate());
  readonly showDispatch = computed(() => this.status() === 'borrador' && this.canDispatch());
  readonly showReceive = computed(() => !!this.shipment()?.can_receive && this.auth.can('shipment_receipts.create'));
  readonly showClose = computed(() => !!this.status() && CLOSE_STATUSES.includes(this.status()!) && this.canUpdate());
  readonly showCancel = computed(() => !!this.status() && CANCEL_STATUSES.includes(this.status()!) && this.canDelete());

  readonly isCancelled = computed(() => this.status() === 'anulada');

  /** "BOD-MUN → BOD-MN · WLK482 · Jorge Ruiz" */
  readonly subtitle = computed(() => {
    const s = this.shipment();
    if (!s) return '';
    const parts = [`${s.origin?.code ?? '—'} → ${s.destination?.code ?? '—'}`];
    if (s.vehicle?.plate) parts.push(s.vehicle.plate);
    if (s.driver?.name) parts.push(s.driver.name);
    return parts.join(' · ');
  });

  /** Pasos del stepper con su estado (hecho / actual / pendiente / omitido). */
  readonly steps = computed<Step[]>(() => {
    const s = this.shipment();
    const status = s?.status ?? null;
    const idx = status ? FLOW.findIndex((f) => f.key === status) : -1;
    const pct = Number(s?.received_pct ?? 0);
    return FLOW.map<Step>((f, i) => {
      let state: Step['state'] = idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo';
      // Una planilla cerrada sin recepciones (o recibida completa de una vez) no pasó por esos pasos.
      if (state === 'done' && f.key === 'recibida_parcial' && pct <= 0) state = 'skipped';
      if (state === 'done' && f.key === 'recibida' && pct < 100) state = 'skipped';
      return { key: f.key, label: f.label, state };
    });
  });

  readonly items = computed<ShipmentItem[]>(() => this.shipment()?.items ?? []);
  readonly receipts = computed(() => this.shipment()?.receipts ?? []);

  readonly dispatched = computed(() => !!this.shipment()?.dispatched_at);

  /** Valor total de la planilla (definido tras el despacho). */
  readonly totalCost = computed(() => {
    const s = this.shipment();
    if (!s) return 0;
    if (s.total_cost !== undefined && s.total_cost !== null) return Number(s.total_cost);
    return this.items().reduce((sum, it) => sum + Number(it.line_cost ?? 0), 0);
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const s = this.shipment();
    if (!s) return [];
    const events: TimelineEvent[] = [{ title: 'Creada', at: s.created_at, by: s.creator?.name, tone: 'draft' }];
    if (s.dispatched_at) {
      events.push({ title: 'Despachada (mercancía en tránsito)', at: s.dispatched_at, by: s.dispatcher?.name, tone: 'partial' });
    }
    for (const r of this.receipts()) {
      if (r.status !== 'anulado') {
        events.push({ title: `Recepción ${r.number}`, at: r.received_at, tone: r.status === 'confirmado' ? 'success' : 'draft' });
      }
    }
    if (s.status === 'cerrada') events.push({ title: 'Cerrada', at: s.updated_at, tone: 'info' });
    if (s.status === 'anulada') events.push({ title: 'Anulada', at: s.updated_at, tone: 'danger' });
    return events.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  load(id: number | null = this.shipment()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .shipment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.shipment.set(s);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/logistica/planillas']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const s = this.shipment();
    if (s) void this.router.navigate(['/logistica/planillas', s.id, 'editar']);
  }

  goReceive(): void {
    const s = this.shipment();
    if (s) void this.router.navigate(['/logistica/recepcion/nueva'], { queryParams: { shipment: s.id } });
  }

  dispatch(): void {
    this.ask(
      'Despachar planilla',
      'Despachar descarga el stock del origen al costo promedio y deja la mercancía en tránsito. ¿Continuar?',
      'Despachar',
      () => this.run('dispatch', 'Planilla despachada.'),
    );
  }

  close(): void {
    this.ask(
      'Cerrar planilla',
      '¿Cerrar la planilla? Lo pendiente quedará como no recibido y no se podrán registrar más recepciones.',
      'Cerrar',
      () => this.run('close', 'Planilla cerrada.'),
    );
  }

  cancel(): void {
    const dispatched = this.status() === 'despachada';
    this.ask(
      'Anular planilla',
      dispatched
        ? 'Anular la planilla reversa el despacho y devuelve el stock a la bodega origen. ¿Continuar?'
        : '¿Anular esta planilla? Esta acción no se puede deshacer.',
      'Anular',
      () => this.run('cancel', 'Planilla anulada.'),
      true,
    );
  }

  /** Abre el PDF de la planilla (el papel que viaja con el chofer). */
  openPdf(): void {
    const s = this.shipment();
    if (!s || this.pdfLoading()) return;
    this.pdfLoading.set(true);
    this.api
      .shipmentPdf(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.pdfLoading.set(false);
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) {
            // Bloqueo de ventanas emergentes: se ofrece la descarga directa.
            const a = document.createElement('a');
            a.href = url;
            a.download = `${s.number}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => {
          this.pdfLoading.set(false);
          this.toast.warn('PDF no disponible', 'No se pudo generar el PDF de la planilla.');
        },
      });
  }

  private ask(header: string, message: string, acceptLabel: string, accept: () => void, danger = false): void {
    this.confirm.confirm({
      header,
      message,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel,
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: danger ? 'p-button-danger' : undefined,
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept,
    });
  }

  private run(action: ShipmentAction, successMsg: string): void {
    const s = this.shipment();
    if (!s || this.acting()) return;
    this.acting.set(action);
    this.api
      .shipmentAction(s.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.shipment.set(fresh);
          this.toast.success(successMsg, fresh.number);
        },
        error: (err: unknown) => {
          this.acting.set(null);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as { message?: string; errors?: Record<string, string[]> };
            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
            this.toast.warn('No se pudo completar la acción', first ?? body.message);
          }
        },
      });
  }

  // ---------- Presentación ----------

  receivedPct(it: ShipmentItem): number {
    const total = Number(it.qty_base) || 0;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(it.qty_received_base) / total) * 100)));
  }

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
  }

  shipmentTone = shipmentTone;

  /** Tono del chip de una recepción (borrador / confirmado / anulado). */
  receiptTone(status: string): 'draft' | 'success' | 'danger' {
    return status === 'confirmado' ? 'success' : status === 'anulado' ? 'danger' : 'draft';
  }
}
