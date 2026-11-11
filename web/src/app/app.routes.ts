import { Routes } from '@angular/router';

import { authGuard, guestGuard, permissionGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./features/auth/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'compras',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/purchasing/purchasing.routes').then((m) => m.PURCHASING_ROUTES),
      },
      {
        path: 'inventario',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/inventory/inventory.routes').then((m) => m.INVENTORY_ROUTES),
      },
      {
        path: 'logistica',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/logistics/logistics.routes').then((m) => m.LOGISTICS_ROUTES),
      },
      {
        path: 'bodega',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/consumption/consumption.routes').then((m) => m.CONSUMPTION_ROUTES),
      },
      {
        path: 'pagos',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/payables/payables.routes').then((m) => m.PAYABLES_ROUTES),
      },
      {
        path: 'reportes',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES),
      },
      {
        path: 'catalogo',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
      },
      {
        path: 'admin',
        canActivateChild: [permissionGuard],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
