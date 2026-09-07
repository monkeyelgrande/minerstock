import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { PurchasingApi } from '../../../core/api/purchasing-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Paginated } from '../../../core/models/common.model';
import { ApprovalHistoryItem, Inbox, InboxItem, PRIORITY_LABELS, Priority, priorityTone, statusTone } from '../../../core/models/purchasing.model';
import { ToastService } from '../../../core/services/toast.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

type Tab = 'requests' | 'orders' | 'history';
type Decision = 'approve' | 'reject';

/** Bandeja de aprobaciones: solicitudes y órdenes pendientes de decisión, e historial. */
@Component({
  selector: 'app-approvals-page',
  imports: [
    CurrencyPipe, DatePipe, NgTemplateOutlet, FormsModule, RouterLink, ButtonModule, DialogModule, TableModule, TabsModule, TextareaModule,
    TooltipModule, PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './approvals-page.component.html',
})
export class ApprovalsPageComponent {
  private readonly api = inject(PurchasingApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly tab = signal<Tab>('requests');
  readonly inbox = signal<Inbox | null>(null);
  readonly loading = signal(false);
  readonly actingId = signal<string | null>(null);

  readonly requests = computed(() => this.inbox()?.purchase_requests ?? []);
  readonly orders = computed(() => this.inbox()?.purchase_orders ?? []);
  readonly pendingTotal = computed(() => {
    const c = this.inbox()?.counts;
    return (c?.purchase_requests ?? 0) + (c?.purchase_orders ?? 0);
  });
  readonly subtitle = computed(() => {
    const n = this.pendingTotal();
    if (this.loading() && !this.inbox()) return 'Cargando documentos pendientes…';
    return n === 1 ? '1 documento espera tu decisión' : `${n} documentos esperan tu decisión`;
  });

  readonly canApproveRequests = computed(() => this.auth.can('purchase_requests.approve'));
  readonly canApproveOrders = computed(() => this.auth.can('purchase_orders.approve'));

  // Historial
  readonly history = signal<ApprovalHistoryItem[]>([]);
  readonly historyTotal = signal(0);
  readonly historyLoading = signal(false);
  readonly historyPage = signal(1);
  readonly historyPerPage = signal(20);
  private historyLoaded = false;

  // Diálogo de decisión
  readonly decisionOpen = signal(false);
  readonly decisionMode = signal<Decision>('approve');
  readonly decisionItem = signal<InboxItem | null>(null);
  readonly decisionText = signal('');
  readonly decisionTried = signal(false);

  constructor() {
    this.loadInbox();
  }

  get historyFirst(): number {
    return (this.historyPage() - 1) * this.historyPerPage();
  }

  // ---------- Carga ----------

  loadInbox(): void {
    this.loading.set(true);
    this.api
      .inbox()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inbox) => {
          this.inbox.set(inbox);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onTabChange(value: string | number | undefined): void {
    const tab = (value as Tab) ?? 'requests';
    this.tab.set(tab);
    if (tab === 'history' && !this.historyLoaded) this.loadHistory();
  }

  onHistoryLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.historyPerPage();
    this.historyPerPage.set(rows);
    this.historyPage.set(Math.floor(first / rows) + 1);
    this.loadHistory();
  }

  loadHistory(): void {
    this.historyLoaded = true;
    this.historyLoading.set(true);
    this.api
      .approvalHistory({ page: this.historyPage(), per_page: this.historyPerPage() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // El endpoint devuelve el paginador nativo de Laravel (total en la raíz) — se aceptan ambas formas.
          const raw = res as Paginated<ApprovalHistoryItem> & { total?: number };
          this.history.set(res.data ?? []);
          this.historyTotal.set(raw.meta?.total ?? raw.total ?? this.history().length);
          this.historyLoading.set(false);
        },
        error: () => this.historyLoading.set(false),
      });
  }

  // ---------- Navegación ----------

  detailLink(item: { type: 'purchase_request' | 'purchase_order'; id?: number; document_id?: number }): string[] {
    const id = item.id ?? item.document_id ?? 0;
    return item.type === 'purchase_order' ? ['/compras/ordenes', String(id)] : ['/compras/solicitudes', String(id)];
  }

  goDetail(item: InboxItem): void {
    void this.router.navigate(this.detailLink(item));
  }

  // ---------- Decisiones ----------

  canDecide(item: InboxItem): boolean {
    return item.type === 'purchase_order' ? this.canApproveOrders() : this.canApproveRequests();
  }

  keyOf(item: InboxItem): string {
    return `${item.type}:${item.id}`;
  }

  openDecision(item: InboxItem, mode: Decision): void {
    this.decisionItem.set(item);
    this.decisionMode.set(mode);
    this.decisionText.set('');
    this.decisionTried.set(false);
    this.decisionOpen.set(true);
  }

  confirmDecision(): void {
    const item = this.decisionItem();
    if (!item) return;
    this.decisionTried.set(true);
    const text = this.decisionText().trim();
    const mode = this.decisionMode();
    if (mode === 'reject' && !text) return;
    const body = mode === 'reject' ? { reason: text } : { comment: text || null };
    this.act(item, mode, body);
  }

  private act(item: InboxItem, mode: Decision, body: Record<string, unknown>): void {
    if (this.actingId()) return;
    this.actingId.set(this.keyOf(item));
    const req: Observable<unknown> =
      item.type === 'purchase_order' ? this.api.orderAction(item.id, mode, body) : this.api.requestAction(item.id, mode, body);
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.actingId.set(null);
        this.decisionOpen.set(false);
        this.toast.success(mode === 'approve' ? `${item.number} aprobada.` : `${item.number} rechazada.`, item.title);
        this.historyLoaded = false;
        this.loadInbox();
        if (this.tab() === 'history') this.loadHistory();
      },
      error: (err: unknown) => {
        this.actingId.set(null);
        if (err instanceof HttpErrorResponse && err.status === 422) {
          const b = err.error as { message?: string; errors?: Record<string, string[]> };
          const first = b.errors ? Object.values(b.errors)[0]?.[0] : undefined;
          this.toast.error('No se pudo completar la acción', first ?? b.message);
        }
        // Puede que el documento ya no esté pendiente: refrescar la bandeja.
        this.loadInbox();
      },
    });
  }

  // ---------- Utilidades de vista ----------

  typeLabel(type: 'purchase_request' | 'purchase_order'): string {
    return type === 'purchase_order' ? 'Orden de compra' : 'Solicitud de compra';
  }

  priorityLabel(p: Priority): string {
    return PRIORITY_LABELS[p] ?? p;
  }

  statusTone = statusTone;
  priorityTone = priorityTone;
}
