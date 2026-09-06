import { Observable, map } from 'rxjs';

import type { ApiService } from './api.service';
import { Collection, ListParams, Paginated, Single } from '../models/common.model';

/** Operaciones estándar de un maestro contra CrudController. */
export class CrudResource<T> {
  constructor(
    private readonly api: ApiService,
    readonly path: string,
  ) {}

  list(params: ListParams = {}): Observable<Paginated<T>> {
    return this.api.get<Paginated<T>>(this.path, params);
  }

  /** Todos los registros sin paginar (para selectores). Por defecto solo activos. */
  all(params: ListParams = {}): Observable<T[]> {
    return this.api
      .get<Collection<T>>(this.path, { all: '1', active: '1', ...params })
      .pipe(map((r) => r.data));
  }

  get(id: number): Observable<T> {
    return this.api.get<Single<T>>(`${this.path}/${id}`).pipe(map((r) => r.data));
  }

  create(body: Partial<T> | Record<string, unknown>): Observable<T> {
    return this.api.post<Single<T>>(this.path, body).pipe(map((r) => r.data));
  }

  update(id: number, body: Partial<T> | Record<string, unknown>): Observable<T> {
    return this.api.put<Single<T>>(`${this.path}/${id}`, body).pipe(map((r) => r.data));
  }

  delete(id: number): Observable<void> {
    return this.api.delete<void>(`${this.path}/${id}`);
  }
}
