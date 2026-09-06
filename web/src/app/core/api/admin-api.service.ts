import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import { DocumentSequence, Role, Settings, User } from '../models/auth.model';
import { Collection, Single } from '../models/common.model';

/** Recursos del módulo Administración. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiService);

  readonly users = this.api.resource<User>('admin/users');

  resetPassword(userId: number, password: string): Observable<{ message: string }> {
    return this.api.post(`admin/users/${userId}/reset-password`, { password });
  }

  roles(): Observable<Role[]> {
    return this.api.get<Collection<Role>>('admin/roles').pipe(map((r) => r.data));
  }

  /** Permisos agrupados por recurso: { products: ['products.view', ...] } */
  permissions(): Observable<Record<string, string[]>> {
    return this.api.get<Single<Record<string, string[]>>>('admin/permissions').pipe(map((r) => r.data));
  }

  updateRole(id: number, permissions: string[]): Observable<{ message: string }> {
    return this.api.put(`admin/roles/${id}`, { permissions });
  }

  settings(): Observable<Settings> {
    return this.api.get<Single<Settings>>('admin/settings').pipe(map((r) => r.data));
  }

  updateSettings(body: Settings): Observable<Settings> {
    return this.api.put<Single<Settings>>('admin/settings', body).pipe(map((r) => r.data));
  }

  sequences(): Observable<DocumentSequence[]> {
    return this.api.get<Collection<DocumentSequence>>('admin/document-sequences').pipe(map((r) => r.data));
  }

  updateSequence(docType: string, body: Pick<DocumentSequence, 'prefix' | 'next_number' | 'padding'>): Observable<DocumentSequence> {
    return this.api.put<Single<DocumentSequence>>(`admin/document-sequences/${docType}`, body).pipe(map((r) => r.data));
  }
}
