import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { ApiService } from '../api/api.service';
import { LoginResponse, RoleName, User } from '../models/auth.model';
import { Single } from '../models/common.model';

const TOKEN_KEY = 'minerstock.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  private readonly _ready = signal(false);

  /** Usuario autenticado (null si no hay sesión). */
  readonly user = this._user.asReadonly();
  /** True cuando ya se intentó restaurar la sesión al arrancar. */
  readonly ready = this._ready.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly permissions = computed(() => new Set(this._user()?.permissions ?? []));
  readonly roles = computed(() => new Set(this._user()?.roles ?? []));

  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /** Restaura la sesión con el token guardado. Se llama al iniciar la app. */
  restore(): Observable<User | null> {
    if (!this.token) {
      this._ready.set(true);
      return of(null);
    }
    return this.api.get<Single<User>>('auth/me').pipe(
      map((r) => r.data),
      tap((user) => {
        this._user.set(user);
        this._ready.set(true);
      }),
      catchError(() => {
        this.clearSession();
        this._ready.set(true);
        return of(null);
      }),
    );
  }

  /** `login` acepta nombre de usuario o correo. */
  login(login: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', { login, password, device_name: 'web' }).pipe(
      tap((r) => {
        this.setToken(r.token);
        this._user.set(r.user);
      }),
    );
  }

  logout(): void {
    this.api.post('auth/logout').subscribe({ error: () => void 0 });
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /** Limpia la sesión local sin llamar al servidor (usado por el interceptor en 401). */
  clearSession(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
    this._user.set(null);
  }

  refreshUser(): Observable<User> {
    return this.api.get<Single<User>>('auth/me').pipe(
      map((r) => r.data),
      tap((user) => this._user.set(user)),
    );
  }

  setUser(user: User): void {
    this._user.set(user);
  }

  can(permission: string | string[]): boolean {
    if (this.roles().has('admin')) return true;
    const perms = this.permissions();
    const list = Array.isArray(permission) ? permission : [permission];
    return list.some((p) => perms.has(p));
  }

  hasRole(role: RoleName | RoleName[]): boolean {
    const roles = this.roles();
    const list = Array.isArray(role) ? role : [role];
    return list.some((r) => roles.has(r));
  }

  private setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* noop */
    }
  }
}
