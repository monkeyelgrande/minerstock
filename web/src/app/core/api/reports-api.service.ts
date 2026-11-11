import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import { Single } from '../models/common.model';
import {
  ActivityPage,
  NotificationPage,
  ReportCatalog,
  ReportResult,
  SearchGroup,
} from '../models/reports.model';

/** Endpoints de la fase 6: reportes, notificaciones, búsqueda global y actividad. */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ---------- Reportes ----------
  catalog(): Observable<ReportCatalog> {
    return this.api.get<Single<ReportCatalog>>('reports').pipe(map((r) => r.data));
  }

  run(key: string, filters: Record<string, string | number | null | undefined>): Observable<ReportResult> {
    return this.api.get<Single<ReportResult>>(`reports/${key}`, this.clean(filters)).pipe(map((r) => r.data));
  }

  /** Descarga el reporte exportado (xlsx o pdf). */
  export(key: string, filters: Record<string, string | number | null | undefined>, format: 'xlsx' | 'pdf'): Observable<Blob> {
    const params = this.clean({ ...filters, export: format });
    const query = new URLSearchParams(params as Record<string, string>).toString();

    return this.http.get(this.api.url(`reports/${key}`) + (query ? `?${query}` : ''), { responseType: 'blob' });
  }

  private clean(filters: Record<string, string | number | null | undefined>): Record<string, string | number> {
    return Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    ) as Record<string, string | number>;
  }

  // ---------- Notificaciones ----------
  notifications(params: { unread?: 1; page?: number; per_page?: number } = {}): Observable<NotificationPage> {
    return this.api.get('notifications', params);
  }

  markRead(id: string): Observable<{ message: string; unread_count: number }> {
    return this.api.post(`notifications/${id}/read`);
  }

  markAllRead(): Observable<{ message: string; unread_count: number }> {
    return this.api.post('notifications/read-all');
  }

  // ---------- Búsqueda global ----------
  search(q: string): Observable<SearchGroup[]> {
    return this.api.get<{ data: SearchGroup[] }>('search', { q }).pipe(map((r) => r.data));
  }

  // ---------- Log de actividad ----------
  activity(params: Record<string, string | number> = {}): Observable<ActivityPage> {
    return this.api.get('admin/activity', params);
  }
}
