import { Routes } from '@angular/router';

/** Rutas del módulo Bodega (consumo en mina). `data.permission` lo verifica permissionGuard (canActivateChild). */
export const CONSUMPTION_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'vales' },

  // Vales de salida
  {
    path: 'vales',
    data: { permission: 'issues.view' },
    loadComponent: () => import('./issues/issues-page.component').then((m) => m.IssuesPageComponent),
  },
  {
    path: 'vales/nuevo',
    data: { permission: 'issues.create' },
    loadComponent: () => import('./issues/issue-form.component').then((m) => m.IssueFormComponent),
  },
  {
    path: 'vales/:id/editar',
    data: { permission: 'issues.update' },
    loadComponent: () => import('./issues/issue-form.component').then((m) => m.IssueFormComponent),
  },
  {
    path: 'vales/:id',
    data: { permission: 'issues.view' },
    loadComponent: () => import('./issues/issue-detail.component').then((m) => m.IssueDetailComponent),
  },

  // Préstamos
  {
    path: 'prestamos',
    data: { permission: 'loans.view' },
    loadComponent: () => import('./loans/loans-page.component').then((m) => m.LoansPageComponent),
  },
  {
    path: 'prestamos/nuevo',
    data: { permission: 'loans.create' },
    loadComponent: () => import('./loans/loan-form.component').then((m) => m.LoanFormComponent),
  },
  {
    path: 'prestamos/:id/editar',
    data: { permission: 'loans.update' },
    loadComponent: () => import('./loans/loan-form.component').then((m) => m.LoanFormComponent),
  },
  {
    path: 'prestamos/:id',
    data: { permission: 'loans.view' },
    loadComponent: () => import('./loans/loan-detail.component').then((m) => m.LoanDetailComponent),
  },

  // Herramientas por persona
  {
    path: 'herramientas',
    data: { permission: 'loans.view' },
    loadComponent: () => import('./holdings/holdings-page.component').then((m) => m.HoldingsPageComponent),
  },
];
