import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { ConsumptionApi } from '../../../core/api/consumption-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Issue, IssueItem, issueTone } from '../../../core/models/consumption.model';
import { AttachableType } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { AttachmentsComponent } from '../../../shared/components/attachments.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';
import { TimelineComponent, TimelineEvent } from '../../../shared/components/timeline.component';

type IssueAction = 'confirm' | 'cancel';

/** Detalle de un vale de salida: ítems valorados, datos del receptor y acciones de flujo. */
@Component({
  selector: 'app-issue-detail',
  imports: [
    CurrencyPipe, DatePipe, DecimalPipe, ButtonModule, TooltipModule,
    AttachmentsComponent, PageHeaderComponent, StatusChipComponent, TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './issue-detail.component.html',
})
export class IssueDetailComponent {
  private readonly api = inject(ConsumptionApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly id = input<string>();

  readonly issue = signal<Issue | null>(null);
  readonly loading = signal(false);
  readonly acting = signal<IssueAction | null>(null);
  readonly pdfLoading = signal(false);

  /** Tipo de adjuntable del vale (el modelo compartido aún no lo incluye en la unión). */
  readonly attachType = 'issue' as unknown as AttachableType;

  readonly canUpdate = computed(() => this.auth.can('issues.update'));
  readonly canDelete = computed(() => this.auth.can('issues.delete'));

  private readonly status = computed(() => this.issue()?.status ?? null);

  readonly showEdit = computed(() => !!this.issue()?.is_editable && this.canUpdate());
  readonly showConfirm = computed(() => this.status() === 'borrador' && this.canUpdate());
  readonly showCancel = computed(() => (this.status() === 'borrador' || this.status() === 'confirmado') && this.canDelete());

  readonly isDraft = computed(() => this.status() === 'borrador');
  readonly items = computed<IssueItem[]>(() => this.issue()?.items ?? []);

  readonly total = computed(() => {
    const v = this.issue();
    if (!v) return 0;
    if (v.total !== undefined && v.total !== null) return Number(v.total);
    return this.items().reduce((sum, it) => sum + Number(it.line_cost ?? 0), 0);
  });

  readonly timeline = computed<TimelineEvent[]>(() => {
    const v = this.issue();
    if (!v) return [];
    const events: TimelineEvent[] = [{ title: 'Creado', at: v.created_at, by: v.creator?.name, tone: 'draft' }];
    if (v.confirmed_at) events.push({ title: 'Confirmado · stock descontado', at: v.confirmed_at, tone: 'success' });
    if (v.status === 'anulado') events.push({ title: 'Anulado', at: v.updated_at, tone: 'danger' });
    return events;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id ? +id : null));
    });
  }

  load(id: number | null = this.issue()?.id ?? null): void {
    if (!id) return;
    this.loading.set(true);
    this.api
      .issue(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (v) => {
          this.issue.set(v);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.router.navigate(['/bodega/vales']);
        },
      });
  }

  // ---------- Acciones ----------

  goEdit(): void {
    const v = this.issue();
    if (v) void this.router.navigate(['/bodega/vales', v.id, 'editar']);
  }

  confirmIssue(): void {
    this.ask('Confirmar vale', 'Confirmar descuenta el stock de la bodega al costo promedio. ¿Continuar?', 'Confirmar', () =>
      this.run('confirm', 'Vale confirmado y stock descontado.'),
    );
  }

  cancelIssue(): void {
    const confirmed = this.status() === 'confirmado';
    this.ask(
      'Anular vale',
      confirmed
        ? 'El vale ya fue confirmado: al anularlo se registrarán los movimientos inversos en el kardex. ¿Continuar?'
        : '¿Anular este vale? Esta acción no se puede deshacer.',
      'Anular',
      () => this.run('cancel', 'Vale anulado.'),
      true,
    );
  }

  /** Abre el PDF del vale (comprobante con firmas) en una pestaña nueva. */
  downloadPdf(): void {
    const v = this.issue();
    if (!v || this.pdfLoading()) return;
    this.pdfLoading.set(true);
    this.api
      .issuePdf(v.id)
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
            a.download = `${v.number}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        },
        error: () => this.pdfLoading.set(false),
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

  private run(action: IssueAction, successMsg: string): void {
    const v = this.issue();
    if (!v || this.acting()) return;
    this.acting.set(action);
    this.api
      .issueAction(v.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.acting.set(null);
          this.issue.set(fresh);
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

  statusTone = issueTone;
}
