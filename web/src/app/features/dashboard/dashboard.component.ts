import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { WarehouseContext } from '../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

interface Kpi {
  label: string;
  value: string;
  icon: string;
  tone: string;
  note: string;
}

/**
 * Dashboard. En fase 0 muestra la estructura con indicadores en cero;
 * cada fase siguiente conecta sus KPIs reales.
 */
@Component({
  selector: 'app-dashboard',
  imports: [PageHeaderComponent, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="greeting()" [subtitle]="(today | date: 'EEEE, d \\'de\\' MMMM \\'de\\' y') + (ctx.active() ? ' — ' + ctx.active()!.name : '')" [crumbs]="[{ label: 'Dashboard' }]" />

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      @for (k of kpis; track k.label) {
        <div class="card p-5 flex flex-col justify-between">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="th-label block truncate">{{ k.label }}</span>
              <span class="text-[28px] leading-9 font-bold text-ink tabular mt-1 block">{{ k.value }}</span>
            </div>
            <div class="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" [class]="k.tone">
              <span class="material-symbols-outlined !text-[24px]">{{ k.icon }}</span>
            </div>
          </div>
          <div class="mt-4 -mx-5 -mb-5 px-5 py-2.5 bg-canvas/70 text-xs text-ink-3 truncate">{{ k.note }}</div>
        </div>
      }
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 card">
        <div class="card-header">
          <span class="card-title">Fase 0 · Base del sistema</span>
          <span class="chip chip-success">En construcción</span>
        </div>
        <div class="card-body">
          <p class="text-sm text-ink-2 mb-4">
            Ya puedes cargar los catálogos. Los módulos de compras, inventario, logística y bodega se habilitan en las siguientes fases.
          </p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            @for (link of quickLinks(); track link.route) {
              <a [routerLink]="link.route" class="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 hover:border-brand hover:bg-amber-50/40 transition-colors">
                <span class="material-symbols-outlined text-brand">{{ link.icon }}</span>
                <span class="text-sm font-medium">{{ link.label }}</span>
              </a>
            }
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Pendientes por hacer</span></div>
        <div class="card-body text-sm text-ink-3">
          Aquí aparecerán solicitudes por aprobar, planillas por recibir y alertas de stock.
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);
  readonly today = new Date();

  readonly greeting = computed(() => {
    const h = this.today.getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
    const first = (this.auth.user()?.name ?? '').split(' ')[0];
    return `${saludo}, ${first}`;
  });

  readonly kpis: Kpi[] = [
    { label: 'Solicitudes aprobadas sin OC', value: '0', icon: 'assignment_turned_in', tone: 'bg-amber-50 text-amber-700', note: 'Fase 1 · Compras' },
    { label: 'OC pendientes de recibir', value: '0', icon: 'local_shipping', tone: 'bg-blue-50 text-blue-700', note: 'Fase 2 · Inventario' },
    { label: 'Facturas por vencer', value: '$0', icon: 'pending_actions', tone: 'bg-orange-50 text-orange-700', note: 'Fase 3 · Cuentas por pagar' },
    { label: 'Planillas en tránsito', value: '0', icon: 'route', tone: 'bg-emerald-50 text-emerald-700', note: 'Fase 4 · Logística' },
  ];

  readonly quickLinks = computed(() => {
    this.auth.user();
    return [
      { label: 'Productos', icon: 'inventory_2', route: '/catalogo/productos', perm: 'products.view' },
      { label: 'Proveedores', icon: 'storefront', route: '/catalogo/proveedores', perm: 'suppliers.view' },
      { label: 'Bodegas', icon: 'warehouse', route: '/catalogo/bodegas', perm: 'warehouses.view' },
      { label: 'Vehículos', icon: 'directions_car', route: '/catalogo/vehiculos', perm: 'vehicles.view' },
      { label: 'Choferes', icon: 'badge', route: '/catalogo/choferes', perm: 'drivers.view' },
      { label: 'Usuarios', icon: 'manage_accounts', route: '/admin/usuarios', perm: 'users.view' },
    ].filter((l) => this.auth.can(l.perm));
  });
}
