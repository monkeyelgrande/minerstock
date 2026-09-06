import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home').then((m) => m.HomeComponent),
  },
  // TODO: detalle de review, listado de reviews por categoría, etc.
  { path: '**', redirectTo: '' },
];
