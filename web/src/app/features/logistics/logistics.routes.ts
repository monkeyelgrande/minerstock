import { Routes } from '@angular/router';

/** Rutas del módulo Logística. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const LOGISTICS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'planillas' },

  // Planillas de viaje
  {
    path: 'planillas',
    data: { permission: 'shipments.view' },
    loadComponent: () => import('./shipments/shipments-page.component').then((m) => m.ShipmentsPageComponent),
  },
  {
    path: 'planillas/nueva',
    data: { permission: 'shipments.create' },
    loadComponent: () => import('./shipments/shipment-form.component').then((m) => m.ShipmentFormComponent),
  },
  {
    path: 'planillas/:id/editar',
    data: { permission: 'shipments.update' },
    loadComponent: () => import('./shipments/shipment-form.component').then((m) => m.ShipmentFormComponent),
  },
  {
    path: 'planillas/:id',
    data: { permission: 'shipments.view' },
    loadComponent: () => import('./shipments/shipment-detail.component').then((m) => m.ShipmentDetailComponent),
  },

  // Recepción en mina
  {
    path: 'recepcion',
    data: { permission: 'shipment_receipts.view' },
    loadComponent: () => import('./receipts/receiving-page.component').then((m) => m.ReceivingPageComponent),
  },
  {
    path: 'recepcion/nueva',
    data: { permission: 'shipment_receipts.create' },
    loadComponent: () => import('./receipts/receiving-form.component').then((m) => m.ReceivingFormComponent),
  },
  {
    path: 'recepcion/:id/editar',
    data: { permission: 'shipment_receipts.update' },
    loadComponent: () => import('./receipts/receiving-form.component').then((m) => m.ReceivingFormComponent),
  },
  {
    path: 'recepcion/:id',
    data: { permission: 'shipment_receipts.view' },
    loadComponent: () => import('./receipts/receiving-detail.component').then((m) => m.ReceivingDetailComponent),
  },

  // Novedades
  {
    path: 'novedades',
    data: { permission: 'novelties.view' },
    loadComponent: () => import('./novelties/novelties-page.component').then((m) => m.NoveltiesPageComponent),
  },

  // En tránsito
  {
    path: 'en-transito',
    data: { permission: 'shipments.view' },
    loadComponent: () => import('./transit/transit-page.component').then((m) => m.TransitPageComponent),
  },
];
