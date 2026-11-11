import { Routes } from '@angular/router';

/** Rutas del módulo Administración. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'usuarios' },
  {
    path: 'usuarios',
    data: { permission: 'users.view' },
    loadComponent: () => import('./users/users-page.component').then((m) => m.UsersPageComponent),
  },
  {
    path: 'roles',
    data: { permission: 'roles.view' },
    loadComponent: () => import('./roles/roles-page.component').then((m) => m.RolesPageComponent),
  },
  {
    path: 'configuracion',
    data: { permission: 'settings.view' },
    loadComponent: () => import('./settings/settings-page.component').then((m) => m.SettingsPageComponent),
  },
  {
    path: 'actividad',
    data: { permission: 'activity_log.view' },
    loadComponent: () => import('./activity/activity-page.component').then((m) => m.ActivityPageComponent),
  },
];
