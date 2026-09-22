import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from './api.service';
import {
  Issue,
  IssuePayload,
  Loan,
  LoanPayload,
  LoanReturnPayload,
  RecipientHolding,
} from '../models/consumption.model';
import { Collection, ListParams, Paginated, Single } from '../models/common.model';

/** Endpoints del módulo Consumo en mina (/api/consumption). */
@Injectable({ providedIn: 'root' })
export class ConsumptionApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ---------- Vales de salida ----------
  issues(params: ListParams = {}): Observable<Paginated<Issue>> {
    return this.api.get('consumption/issues', params);
  }

  issueCounts(): Observable<Record<string, number>> {
    return this.api.get<Single<Record<string, number>>>('consumption/issues/counts').pipe(map((r) => r.data));
  }

  issue(id: number): Observable<Issue> {
    return this.api.get<Single<Issue>>(`consumption/issues/${id}`).pipe(map((r) => r.data));
  }

  createIssue(body: IssuePayload): Observable<Issue> {
    return this.api.post<Single<Issue>>('consumption/issues', body).pipe(map((r) => r.data));
  }

  updateIssue(id: number, body: IssuePayload): Observable<Issue> {
    return this.api.put<Single<Issue>>(`consumption/issues/${id}`, body).pipe(map((r) => r.data));
  }

  issueAction(id: number, action: 'confirm' | 'cancel'): Observable<Issue> {
    return this.api.post<Single<Issue>>(`consumption/issues/${id}/${action}`).pipe(map((r) => r.data));
  }

  issuePdf(id: number): Observable<Blob> {
    return this.http.get(this.api.url(`consumption/issues/${id}/pdf`), { responseType: 'blob' });
  }

  // ---------- Préstamos ----------
  loans(params: ListParams = {}): Observable<Paginated<Loan>> {
    return this.api.get('consumption/loans', params);
  }

  loanCounts(): Observable<{ counts: Record<string, number>; overdue: number }> {
    return this.api
      .get<Single<Record<string, number>> & { overdue: number }>('consumption/loans/counts')
      .pipe(map((r) => ({ counts: r.data, overdue: r.overdue ?? 0 })));
  }

  loan(id: number): Observable<Loan> {
    return this.api.get<Single<Loan>>(`consumption/loans/${id}`).pipe(map((r) => r.data));
  }

  createLoan(body: LoanPayload): Observable<Loan> {
    return this.api.post<Single<Loan>>('consumption/loans', body).pipe(map((r) => r.data));
  }

  updateLoan(id: number, body: LoanPayload): Observable<Loan> {
    return this.api.put<Single<Loan>>(`consumption/loans/${id}`, body).pipe(map((r) => r.data));
  }

  loanAction(id: number, action: 'confirm' | 'cancel'): Observable<Loan> {
    return this.api.post<Single<Loan>>(`consumption/loans/${id}/${action}`).pipe(map((r) => r.data));
  }

  /** Registra una devolución; devuelve el préstamo actualizado. */
  registerReturn(id: number, body: LoanReturnPayload): Observable<Loan> {
    return this.api.post<Single<Loan>>(`consumption/loans/${id}/returns`, body).pipe(map((r) => r.data));
  }

  loanPdf(id: number): Observable<Blob> {
    return this.http.get(this.api.url(`consumption/loans/${id}/pdf`), { responseType: 'blob' });
  }

  /** Herramientas por persona: saldo en préstamo agrupado por receptor. */
  holdings(warehouseId?: number | null): Observable<RecipientHolding[]> {
    return this.api
      .get<Collection<RecipientHolding>>('consumption/loans/holdings', { warehouse_id: warehouseId ?? undefined })
      .pipe(map((r) => r.data));
  }
}
