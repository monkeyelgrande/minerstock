import { Routes } from '@angular/router';

/** Rutas del módulo Compras. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const PURCHASING_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'solicitudes' },

  // Solicitudes de compra
  {
    path: 'solicitudes',
    data: { permission: 'purchase_requests.view' },
    loadComponent: () => import('./requests/requests-page.component').then((m) => m.RequestsPageComponent),
  },
  {
    path: 'solicitudes/nueva',
    data: { permission: 'purchase_requests.create' },
    loadComponent: () => import('./requests/request-form.component').then((m) => m.RequestFormComponent),
  },
  {
    path: 'solicitudes/:id/editar',
    data: { permission: 'purchase_requests.update' },
    loadComponent: () => import('./requests/request-form.component').then((m) => m.RequestFormComponent),
  },
  {
    path: 'solicitudes/:id',
    data: { permission: 'purchase_requests.view' },
    loadComponent: () => import('./requests/request-detail.component').then((m) => m.RequestDetailComponent),
  },

  // Bandeja de aprobaciones
  {
    path: 'aprobaciones',
    data: { permission: 'approvals.view' },
    loadComponent: () => import('./approvals/approvals-page.component').then((m) => m.ApprovalsPageComponent),
  },

  // Cotizaciones
  {
    path: 'cotizaciones',
    data: { permission: 'quotations.view' },
    loadComponent: () => import('./quotations/quotations-page.component').then((m) => m.QuotationsPageComponent),
  },
  {
    path: 'cotizaciones/nueva',
    data: { permission: 'quotations.create' },
    loadComponent: () => import('./quotations/quotation-form.component').then((m) => m.QuotationFormComponent),
  },
  {
    path: 'cotizaciones/:id/editar',
    data: { permission: 'quotations.update' },
    loadComponent: () => import('./quotations/quotation-form.component').then((m) => m.QuotationFormComponent),
  },
  {
    path: 'cotizaciones/:id',
    data: { permission: 'quotations.view' },
    loadComponent: () => import('./quotations/quotation-detail.component').then((m) => m.QuotationDetailComponent),
  },

  // Comparativa
  {
    path: 'comparativa',
    data: { permission: 'quotations.view' },
    loadComponent: () => import('./comparison/comparison-page.component').then((m) => m.ComparisonPageComponent),
  },

  // Órdenes de compra
  {
    path: 'ordenes',
    data: { permission: 'purchase_orders.view' },
    loadComponent: () => import('./orders/orders-page.component').then((m) => m.OrdersPageComponent),
  },
  {
    path: 'ordenes/nueva',
    data: { permission: 'purchase_orders.create' },
    loadComponent: () => import('./orders/order-form.component').then((m) => m.OrderFormComponent),
  },
  {
    path: 'ordenes/:id/editar',
    data: { permission: 'purchase_orders.update' },
    loadComponent: () => import('./orders/order-form.component').then((m) => m.OrderFormComponent),
  },
  {
    path: 'ordenes/:id',
    data: { permission: 'purchase_orders.view' },
    loadComponent: () => import('./orders/order-detail.component').then((m) => m.OrderDetailComponent),
  },
];
