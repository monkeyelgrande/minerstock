import { Routes } from '@angular/router';

/** Rutas del módulo Cuentas por pagar. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const PAYABLES_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'facturas' },

  // Facturas de proveedor
  {
    path: 'facturas',
    data: { permission: 'supplier_invoices.view' },
    loadComponent: () => import('./invoices/invoices-page.component').then((m) => m.InvoicesPageComponent),
  },
  {
    path: 'facturas/nueva',
    data: { permission: 'supplier_invoices.create' },
    loadComponent: () => import('./invoices/invoice-form.component').then((m) => m.InvoiceFormComponent),
  },
  {
    path: 'facturas/:id/editar',
    data: { permission: 'supplier_invoices.update' },
    loadComponent: () => import('./invoices/invoice-form.component').then((m) => m.InvoiceFormComponent),
  },
  {
    path: 'facturas/:id',
    data: { permission: 'supplier_invoices.view' },
    loadComponent: () => import('./invoices/invoice-detail.component').then((m) => m.InvoiceDetailComponent),
  },

  // Pagos
  {
    path: 'pagos',
    data: { permission: 'supplier_payments.view' },
    loadComponent: () => import('./payments/payments-page.component').then((m) => m.PaymentsPageComponent),
  },
  {
    path: 'pagos/nuevo',
    data: { permission: 'supplier_payments.create' },
    loadComponent: () => import('./payments/payment-form.component').then((m) => m.PaymentFormComponent),
  },
  {
    path: 'pagos/:id',
    data: { permission: 'supplier_payments.view' },
    loadComponent: () => import('./payments/payment-detail.component').then((m) => m.PaymentDetailComponent),
  },

  // Notas crédito
  {
    path: 'notas-credito',
    data: { permission: 'supplier_credit_notes.view' },
    loadComponent: () => import('./credit-notes/credit-notes-page.component').then((m) => m.CreditNotesPageComponent),
  },
  {
    path: 'notas-credito/:id',
    data: { permission: 'supplier_credit_notes.view' },
    loadComponent: () => import('./credit-notes/credit-note-detail.component').then((m) => m.CreditNoteDetailComponent),
  },

  // Estado de cuenta
  {
    path: 'estado-cuenta',
    data: { permission: 'supplier_invoices.view' },
    loadComponent: () => import('./statement/statement-page.component').then((m) => m.StatementPageComponent),
  },
  {
    path: 'estado-cuenta/:supplierId',
    data: { permission: 'supplier_invoices.view' },
    loadComponent: () => import('./statement/statement-detail.component').then((m) => m.StatementDetailComponent),
  },
];
