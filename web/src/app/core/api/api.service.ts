import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CrudResource } from './crud-resource';

type ParamValue = string | number | boolean | null | undefined;

/** Cliente HTTP base contra la API de MinerStock. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl.replace(/\/$/, '');

  url(path: string): string {
    return `${this.base}/${path.replace(/^\//, '')}`;
  }

  get<T>(path: string, params?: Record<string, ParamValue>): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toParams(params) });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {});
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? {});
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  /** Crea un recurso CRUD tipado sobre una ruta (ej. `catalog/suppliers`). */
  resource<T>(path: string): CrudResource<T> {
    return new CrudResource<T>(this, path);
  }

  private toParams(params?: Record<string, ParamValue>): HttpParams {
    let hp = new HttpParams();
    if (!params) return hp;
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      hp = hp.set(key, String(value));
    }
    return hp;
  }
}
