import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ToastService } from '../services/toast.service';

/** Agrega el token Bearer y el header Accept a todas las llamadas a la API. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return next(req.clone({ setHeaders: headers }));
};

/**
 * Manejo global de errores:
 *  - 401 → cierra sesión local y manda al login.
 *  - 403 → aviso de permisos.
 *  - 422 → no se toca (lo maneja el formulario).
 *  - 409 / 5xx / red → toast con el mensaje del servidor.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const message = (err.error as { message?: string } | null)?.message;
        switch (err.status) {
          case 401:
            if (!req.url.includes('auth/login')) {
              auth.clearSession();
              void router.navigate(['/login'], { queryParams: { redirect: router.url } });
            }
            break;
          case 403:
            toast.warn('Sin permiso', message ?? 'No tienes permiso para realizar esta acción.');
            break;
          case 422:
            break;
          case 0:
            toast.error('Sin conexión', 'No se pudo contactar al servidor.');
            break;
          default:
            toast.error(`Error ${err.status}`, message ?? 'Ocurrió un error inesperado.');
        }
      }
      return throwError(() => err);
    }),
  );
};
