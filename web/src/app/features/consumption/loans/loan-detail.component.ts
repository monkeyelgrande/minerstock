import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { ConsumptionApi } from '../../../core/api/consumption-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  Loan,
  LoanItem,
  LoanReturnPayload,
  RETURN_CONDITION_LABELS,
  ReturnCondition,
  conditionTone,
  loanTone,
} from '../../../core/models/consumption.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type LoanAction = 'confirm' | 'cancel';

/** Fila editable del diálogo de devolución (un ítem puede tener varias filas con distinta condición). */
interface ReturnRow {
  key: number;
  loanItemId: number;
  productName: string;
  productSku: string;
  unit: string;
  outstanding: number;
  qty: number | null;
  condition: ReturnCondition;
  notes: string;
}

/** Detalle de préstamo: ítems con saldo en poder, devoluciones, acciones de flujo y trazabilidad. */
@Component({
  selector: 'app-loan-detail',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, ButtonModule, DatePickerModule, DialogModule,
    InputNumberModule, InputTextModule, SelectModule, TextareaModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loan-detail.component.html',
})
export class LoanDetailComponent {
  private readonly api = inject(ConsumptionApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly loan = signal<Loan | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<LoanAction | null>(null);
  readonly pdfLoading = signal(false);

  /** Tipo de adjuntable del préstamo (el modelo compartido aún no lo incluye en la unión). */
  readonly attachType = 'loan' as AttachableType;

  readonly conditionOptions: { label: string; value: ReturnCondition }[] = (
    Object.entries(RETURN_CONDITION_LABELS) as [ReturnCondition, string][]
  ).map(([value, label]) => ({ value, label }));

  // ---------- Permisos y acciones disponibles ----------
  readonly canUpdate = computed(() => this.auth.can('loans.update'));
  readonly canDelete = computed(() => this.auth.can('loans.delete'));

  private readonly status = computed(() => this.loan()?.status ?? null);
  readonly returns = computed(() => this.loan()?.returns ?? []);
  readonly items = computed<LoanItem[]>(() => this.loan()?.items ?? []);

  readonly showEdit = computed(() => this.status() === 'borrador' && this.canUpdate());
  readonly showConfirm = computed(() => this.status() === 'borrador' && this.canUpdate());
  readonly showReturn = computed(() => !!this.loan()?.can_return && this.canUpdate());
  readonly showCancel = computed(() => {
    const s = this.status();
    return (s === 'borrador' || s === 'abierto') && !this.returns().length && this.canDelete();
  });

  readonly isCancelled = computed(() => this.status() === 'anulado');
  readonly confirmed = computed(() => !!this.loan()?.confirmed_at);

  /** "Jorge Ruiz · Bodega Mina Norte" */
  readonly subtitle = computed(() => {
    const l = this.loan();
    if (!l) return '';
    return [l.recipient?.name, l.warehouse?.name].filter(Boolean).join(' · ');
  });

  readonly totals = computed(() => {
    const items = this.items();
    return {
      loaned: items.reduce((s, i) => s + Number(i.qty_base), 0),
      returned: items.reduce((s, i) => s + Number(i.qty_returned_base), 0),
      damaged: items.reduce((s, i) => s + Number(i.qty_damaged_base), 0),
      lost: items.reduce((s, i) => s + Number(i.qty_lost_base), 0),
      outstanding: items.reduce((s, i) => s + Number(i.outstanding_base), 0),
      value: items.reduce((s, i) => s + Number(i.line_cost ?? 0), 0),
    };
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const l = this.loan();
    if (!l) return [];
    const events: TimelineEvent[] = [{ title: 'Creado', at: l.created_at, by: l.creator?.name, tone: 'draft' }];
    if (l.confirmed_at) {
      events.push({ title: 'Confirmado (herramientas descontadas del stock)', at: l.confirmed_at, tone: 'pending' });
    }
    for (const r of this.returns()) {
      const qty = (r.items ?? []).reduce((s, i) => s + Number(i.qty_base), 0);
      events.push({
        title: `Devolución de ${this.fmt(qty)} unidad(es)`,
        at: r.created_at,
        by: r.receiver?.name,
        note: r.notes,
        tone: 'partial',
      });
    }
    if (l.status === 'devuelto') events.push({ title: 'Devuelto por completo', at: l.updated_at, tone: 'success' });
    if (l.status === 'cerrado_con_perdida') events.push({ title: 'Cerrado con pérdida', at: l.updated_at, tone: 'info' });
    if (l.status === 'anulado') events.push({ title: 'Anulado', at: l.updated_at, tone: 'danger' });
    return events.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
  });

  // ---------- Diálogo de devolución ----------
  readonly returnOpen = signal(false);
  readonly returnDate = signal<Date>(new Date());
  readonly returnNotes = signal('');
  readonly returnRows = signal<ReturnRow[]>([]);
  readonly returnSubmitted = signal(false);
  readonly returnSaving = signal(false);
  private rowKey = 0;

  /** Suma devuelta por ítem vs. saldo en poder (para validar filas duplicadas). */
  readonly overReturned = computed(() => {
    const sums = new Map<number, { outstanding: number; qty: number }>();
    for (const r of this.returnRows()) {
      const cur = sums.get(r.loanItemId) ?? { outstanding: r.outstanding, qty: 0 };
      cur.qty += Number(r.qty ?? 0);
      sums.set(r.loanItemId, cur);
    }
    return [...sums.values()].some((s) => s.qty > s.outstanding);
  });

  readonly returnQty = computed(() => this.returnRows().reduce((s, r) => s + Number(r.qty ?? 0), 0));

  /** Si se llega con ?return=1, se abre el diálogo apenas cargue el préstamo. */
  private pendingReturn = false;

  constructor() {
    this.pendingReturn = this.router.parseUrl(this.router.url).queryParams['return'] === '1';
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  // ---------- Carga ----------

  load(id: number | null = this.loan()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .loan(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (l) => {
          this.loan.set(l);
          this.loading.set(false);
          if (this.pendingReturn) {
            this.pendingReturn = false;
            void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
            if (l.can_return && this.canUpdate()) this.openReturn();
          }
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/bodega/prestamos']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const l = this.loan();
    if (l) void this.router.navigate(['/bodega/prestamos', l.id, 'editar']);
  }

  confirmLoan(): void {
    this.ask(
      'Confirmar préstamo',
      'Confirmar descuenta las herramientas del stock al costo promedio. ¿Continuar?',
      'Confirmar',
      () => this.run('confirm', 'Préstamo confirmado: herramientas descontadas del stock.'),
    );
  }

  cancel(): void {
    const open = this.status() === 'abierto';
    this.ask(
      'Anular préstamo',
      open
        ? 'Anular el préstamo reversa la salida y devuelve las herramientas al stock. ¿Continuar?'
        : '¿Anular este préstamo? Esta acción no se puede deshacer.',
      'Anular',
      () => this.run('cancel', 'Préstamo anulado.'),
      true,
    );
  }

  /** Abre el PDF del préstamo (el vale que firma el receptor). */
  openPdf(): void {
    const l = this.loan();
    if (!l || this.pdfLoading()) return;
    this.pdfLoading.set(true);
    this.api
      .loanPdf(l.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.pdfLoading.set(false);
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${l.number}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => {
          this.pdfLoading.set(false);
          this.toast.warn('PDF no disponible', 'No se pudo generar el PDF del préstamo.');
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

  private run(action: LoanAction, successMsg: string): void {
    const l = this.loan();
    if (!l || this.acting()) return;
    this.acting.set(action);
    this.api
      .loanAction(l.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.loan.set(fresh);
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

  // ---------- Devolución ----------

  openReturn(): void {
    const l = this.loan();
    if (!l) return;
    this.returnDate.set(new Date());
    this.returnNotes.set('');
    this.returnSubmitted.set(false);
    this.returnRows.set(
      (l.items ?? [])
        .filter((i) => Number(i.outstanding_base) > 0)
        .map((i) => this.rowFor(i)),
    );
    this.returnOpen.set(true);
  }

  closeReturn(): void {
    if (this.returnSaving()) return;
    this.returnOpen.set(false);
  }

  private rowFor(i: LoanItem): ReturnRow {
    return {
      key: ++this.rowKey,
      loanItemId: i.id,
      productName: i.product?.name ?? '—',
      productSku: i.product?.sku ?? '',
      unit: i.product?.base_unit ?? '',
      outstanding: Number(i.outstanding_base),
      qty: 0,
      condition: 'bueno',
      notes: '',
    };
  }

  /** Duplica la fila para registrar otra condición del mismo ítem (p. ej. 2 buenos + 1 dañado). */
  duplicateRow(row: ReturnRow): void {
    this.returnRows.update((rows) => {
      const idx = rows.findIndex((r) => r.key === row.key);
      const copy: ReturnRow = { ...row, key: ++this.rowKey, qty: 0, condition: 'bueno', notes: '' };
      return [...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)];
    });
  }

  removeRow(row: ReturnRow): void {
    this.returnRows.update((rows) => rows.filter((r) => r.key !== row.key));
  }

  patchRow(row: ReturnRow, patch: Partial<ReturnRow>): void {
    this.returnRows.update((rows) => rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
  }

  /** true si la fila es un duplicado (mismo ítem repetido) y puede quitarse. */
  isDuplicate(row: ReturnRow): boolean {
    return this.returnRows().filter((r) => r.loanItemId === row.loanItemId).indexOf(row) > 0;
  }

  /** Suma devuelta de un ítem supera su saldo en poder. */
  itemOverReturned(loanItemId: number): boolean {
    const rows = this.returnRows().filter((r) => r.loanItemId === loanItemId);
    if (!rows.length) return false;
    return rows.reduce((s, r) => s + Number(r.qty ?? 0), 0) > rows[0].outstanding;
  }

  saveReturn(): void {
    const l = this.loan();
    if (!l || this.returnSaving()) return;
    this.returnSubmitted.set(true);
    const rows = this.returnRows().filter((r) => Number(r.qty ?? 0) > 0);
    if (!rows.length) {
      this.toast.warn('Sin cantidades', 'Ingresa la cantidad devuelta en al menos una fila.');
      return;
    }
    if (this.overReturned()) {
      this.toast.warn('Cantidad excedida', 'Alguna herramienta supera lo que el receptor tiene en su poder.');
      return;
    }
    const payload: LoanReturnPayload = {
      returned_at: this.toIso(this.returnDate()),
      notes: this.returnNotes().trim() || null,
      items: rows.map((r) => ({
        loan_item_id: r.loanItemId,
        qty_base: Number(r.qty),
        condition: r.condition,
        notes: r.notes.trim() || null,
      })),
    };
    this.returnSaving.set(true);
    this.api
      .registerReturn(l.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.returnSaving.set(false);
          this.returnOpen.set(false);
          this.loan.set(fresh);
          this.toast.success('Devolución registrada', fresh.number);
        },
        error: (err: unknown) => {
          this.returnSaving.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as { message?: string; errors?: Record<string, string[]> };
            const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
            this.toast.warn('No se pudo registrar la devolución', first ?? body.message);
          }
        },
      });
  }

  // ---------- Presentación ----------

  fmt(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
  }

  loanTone = loanTone;
  conditionTone = conditionTone;

  private toIso(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
