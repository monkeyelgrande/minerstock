import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Single } from '../../core/models/common.model';
import { statusTone } from '../../core/models/purchasing.model';
import { WarehouseContext } from '../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

interface DashboardData {
  purchase_requests?: { enviada: number; aprobada: number; en_proceso: number; rechazada: number };
  purchase_orders?: { pendiente_aprobacion: number; aprobada: number; emitida: number; recibida_parcial: number; month_total: number };
  recent_orders?: { id: number; number: string; supplier: string; date: string; total: number; status: string; status_label: string; received_pct: number }[];
  quotations?: { expiring: number; received: number };
  approvals_pending?: { purchase_requests: number; purchase_orders: number };
  payables?: { open_count: number; open_balance: number; overdue_count: number; overdue_balance: number; due_soon_balance: number; available_credit: number };
  stock?: { total_value: number; products_with_stock: number; below_min: number; in_transit_value: number; on_loan_count: number; receipts_draft: number; counts_open: number };
}

interface Kpi {
  label: string;
  value: string;
  icon: string;
  tone: string;
  note: string;
  route?: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [PageHeaderComponent, RouterLink, DatePipe, CurrencyPipe, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);
  private readonly api = inject(ApiService);

  readonly today = new Date();
  readonly data = signal<DashboardData | null>(null);
  readonly statusTone = statusTone;

  constructor() {
    this.api
      .get<Single<DashboardData>>('dashboard')
      .pipe(map((r) => r.data))
      .subscribe((d) => this.data.set(d));
  }

  readonly greeting = computed(() => {
    const h = this.today.getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
    const first = (this.auth.user()?.name ?? '').split(' ')[0];
    return `${saludo}, ${first}`;
  });

  readonly subtitle = computed(() => {
    const d = new DatePipe('es-CO').transform(this.today, "EEEE, d 'de' MMMM 'de' y") ?? '';
    const w = this.ctx.active();
    return d.charAt(0).toUpperCase() + d.slice(1) + (w ? ` — ${w.name}` : '');
  });

  readonly kpis = computed<Kpi[]>(() => {
    const d = this.data();
    const list: Kpi[] = [];
    if (d?.purchase_requests) {
      list.push({
        label: 'Solicitudes aprobadas sin OC',
        value: String(d.purchase_requests.aprobada),
        icon: 'assignment_turned_in',
        tone: 'bg-amber-50 text-amber-700',
        note: `${d.purchase_requests.enviada} pendientes de aprobación · ${d.purchase_requests.en_proceso} en proceso`,
        route: '/compras/solicitudes',
      });
    }
    if (d?.purchase_orders) {
      list.push({
        label: 'OC pendientes de recibir',
        value: String(d.purchase_orders.emitida + d.purchase_orders.recibida_parcial),
        icon: 'local_shipping',
        tone: 'bg-blue-50 text-blue-700',
        note: `${d.purchase_orders.aprobada} aprobadas sin emitir · ${d.purchase_orders.pendiente_aprobacion} por aprobar`,
        route: '/compras/ordenes',
      });
      list.push({
        label: 'Compras del mes',
        value: new CurrencyPipe('es-CO').transform(d.purchase_orders.month_total, 'COP', 'symbol-narrow', '1.0-0') ?? '$0',
        icon: 'payments',
        tone: 'bg-emerald-50 text-emerald-700',
        note: 'Órdenes aprobadas o emitidas este mes',
        route: '/compras/ordenes',
      });
    }
    if (d?.quotations) {
      list.push({
        label: 'Cotizaciones por vencer',
        value: String(d.quotations.expiring),
        icon: 'request_quote',
        tone: 'bg-orange-50 text-orange-700',
        note: `${d.quotations.received} recibidas listas para comparar`,
        route: '/compras/comparativa',
      });
    }
    if (d?.payables) {
      list.push({
        label: 'Cartera con proveedores',
        value: new CurrencyPipe('es-CO').transform(d.payables.open_balance, 'COP', 'symbol-narrow', '1.0-0') ?? '$0',
        icon: 'account_balance_wallet',
        tone: d.payables.overdue_count > 0 ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700',
        note: d.payables.overdue_count > 0
          ? `${d.payables.overdue_count} ${d.payables.overdue_count === 1 ? 'factura vencida' : 'facturas vencidas'} · ${new CurrencyPipe('es-CO').transform(d.payables.overdue_balance, 'COP', 'symbol-narrow', '1.0-0')}`
          : `${d.payables.open_count} ${d.payables.open_count === 1 ? 'factura abierta' : 'facturas abiertas'}`,
        route: '/pagos/estado-cuenta',
      });
    }
    if (d?.stock) {
      list.push({
        label: 'Valor del inventario',
        value: new CurrencyPipe('es-CO').transform(d.stock.total_value, 'COP', 'symbol-narrow', '1.0-0') ?? '$0',
        icon: 'layers',
        tone: d.stock.below_min > 0 ? 'bg-red-50 text-red-700' : 'bg-teal-50 text-teal-700',
        note: d.stock.below_min > 0 ? `${d.stock.below_min} ${d.stock.below_min === 1 ? 'producto' : 'productos'} bajo mínimo` : `${d.stock.products_with_stock} productos con existencias`,
        route: '/inventario/stock',
      });
    }
    if (d?.approvals_pending && this.auth.can(['purchase_requests.approve', 'purchase_orders.approve'])) {
      list.push({
        label: 'Aprobaciones pendientes',
        value: String(d.approvals_pending.purchase_requests + d.approvals_pending.purchase_orders),
        icon: 'verified',
        tone: 'bg-violet-50 text-violet-700',
        note: `${d.approvals_pending.purchase_requests} solicitudes · ${d.approvals_pending.purchase_orders} órdenes`,
        route: '/compras/aprobaciones',
      });
    }
    return list;
  });

  readonly quickLinks = computed(() => {
    this.auth.user();
    return [
      { label: 'Nueva solicitud', icon: 'assignment_add', route: '/compras/solicitudes/nueva', perm: 'purchase_requests.create' },
      { label: 'Cotizaciones', icon: 'request_quote', route: '/compras/cotizaciones', perm: 'quotations.view' },
      { label: 'Comparativa', icon: 'compare_arrows', route: '/compras/comparativa', perm: 'quotations.view' },
      { label: 'Stock', icon: 'layers', route: '/inventario/stock', perm: 'stock.view' },
      { label: 'Nueva recepción', icon: 'inventory', route: '/inventario/recepciones/nueva', perm: 'goods_receipts.create' },
      { label: 'Productos', icon: 'inventory_2', route: '/catalogo/productos', perm: 'products.view' },
      { label: 'Proveedores', icon: 'storefront', route: '/catalogo/proveedores', perm: 'suppliers.view' },
      { label: 'Usuarios', icon: 'manage_accounts', route: '/admin/usuarios', perm: 'users.view' },
    ].filter((l) => this.auth.can(l.perm));
  });
}
