import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { ToastService } from '../services/toast.service';

/** Exige sesión iniciada; si no, va al login guardando la URL destino. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

/** Solo para invitados (login): si ya hay sesión, va al dashboard. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};

/**
 * Verifica `data.permission` (string | string[]) de la ruta.
 * Si el usuario no lo tiene, muestra aviso y regresa al dashboard.
 */
export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const required = route.data['permission'] as string | string[] | undefined;
  if (!required || auth.can(required)) return true;
  toast.warn('Sin acceso', 'No tienes permiso para abrir esta sección.');
  return router.createUrlTree(['/']);
};
