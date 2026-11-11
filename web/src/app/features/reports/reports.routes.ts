import { Routes } from '@angular/router';

/** Rutas del módulo Reportes. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { permission: 'reports.view' },
    loadComponent: () => import('./reports-home.component').then((m) => m.ReportsHomeComponent),
  },
  {
    path: ':key',
    data: { permission: 'reports.view' },
    loadComponent: () => import('./report-viewer.component').then((m) => m.ReportViewerComponent),
  },
];
