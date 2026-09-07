import { Routes } from '@angular/router';

/** Rutas del módulo Inventario. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const INVENTORY_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'stock' },

  // Stock y kardex
  {
    path: 'stock',
    data: { permission: 'stock.view' },
    loadComponent: () => import('./stock/stock-page.component').then((m) => m.StockPageComponent),
  },
  {
    path: 'kardex',
    data: { permission: 'stock.view' },
    loadComponent: () => import('./kardex/kardex-page.component').then((m) => m.KardexPageComponent),
  },

  // Recepciones de compra
  {
    path: 'recepciones',
    data: { permission: 'goods_receipts.view' },
    loadComponent: () => import('./receipts/receipts-page.component').then((m) => m.ReceiptsPageComponent),
  },
  {
    path: 'recepciones/nueva',
    data: { permission: 'goods_receipts.create' },
    loadComponent: () => import('./receipts/receipt-form.component').then((m) => m.ReceiptFormComponent),
  },
  {
    path: 'recepciones/:id/editar',
    data: { permission: 'goods_receipts.update' },
    loadComponent: () => import('./receipts/receipt-form.component').then((m) => m.ReceiptFormComponent),
  },
  {
    path: 'recepciones/:id',
    data: { permission: 'goods_receipts.view' },
    loadComponent: () => import('./receipts/receipt-detail.component').then((m) => m.ReceiptDetailComponent),
  },

  // Devoluciones a proveedor
  {
    path: 'devoluciones',
    data: { permission: 'supplier_returns.view' },
    loadComponent: () => import('./returns/returns-page.component').then((m) => m.ReturnsPageComponent),
  },
  {
    path: 'devoluciones/nueva',
    data: { permission: 'supplier_returns.create' },
    loadComponent: () => import('./returns/return-form.component').then((m) => m.ReturnFormComponent),
  },
  {
    path: 'devoluciones/:id/editar',
    data: { permission: 'supplier_returns.update' },
    loadComponent: () => import('./returns/return-form.component').then((m) => m.ReturnFormComponent),
  },
  {
    path: 'devoluciones/:id',
    data: { permission: 'supplier_returns.view' },
    loadComponent: () => import('./returns/return-detail.component').then((m) => m.ReturnDetailComponent),
  },

  // Ajustes
  {
    path: 'ajustes',
    data: { permission: 'adjustments.view' },
    loadComponent: () => import('./adjustments/adjustments-page.component').then((m) => m.AdjustmentsPageComponent),
  },
  {
    path: 'ajustes/nuevo',
    data: { permission: 'adjustments.create' },
    loadComponent: () => import('./adjustments/adjustment-form.component').then((m) => m.AdjustmentFormComponent),
  },
  {
    path: 'ajustes/:id/editar',
    data: { permission: 'adjustments.update' },
    loadComponent: () => import('./adjustments/adjustment-form.component').then((m) => m.AdjustmentFormComponent),
  },
  {
    path: 'ajustes/:id',
    data: { permission: 'adjustments.view' },
    loadComponent: () => import('./adjustments/adjustment-detail.component').then((m) => m.AdjustmentDetailComponent),
  },

  // Conteos físicos
  {
    path: 'conteos',
    data: { permission: 'stock_counts.view' },
    loadComponent: () => import('./counts/counts-page.component').then((m) => m.CountsPageComponent),
  },
  {
    path: 'conteos/:id',
    data: { permission: 'stock_counts.view' },
    loadComponent: () => import('./counts/count-detail.component').then((m) => m.CountDetailComponent),
  },
];
