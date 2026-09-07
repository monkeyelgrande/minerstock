import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CatalogApi } from '../../../core/api/catalog-api.service';
import { PayablesApi } from '../../../core/api/payables-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Supplier } from '../../../core/models/catalog.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { CreditNoteStatus, SupplierCreditNote, payableTone } from '../../../core/models/payables.model';
import { ToastService } from '../../../core/services/toast.service';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip.component';

interface StatusTab {
  key: string;
  label: string;
  /** Estado que filtra la pestaña; null = todas. */
  status: CreditNoteStatus | null;
}

/** Listado de notas crédito de proveedor con pestañas por estado y diálogo de nota manual. */
@Component({
  selector: 'app-credit-notes-page',
  imports: [
    CurrencyPipe, DatePipe, FormsModule, ReactiveFormsModule, RouterLink, TableModule, ButtonModule, SelectModule,
    DatePickerModule, DialogModule, InputNumberModule, InputTextModule, TextareaModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, StatusChipComponent, FieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './credit-notes-page.component.html',
})
export class CreditNotesPageComponent {
  private readonly api = inject(PayablesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly tabs: StatusTab[] = [
    { key: 'all', label: 'Todas', status: null },
    { key: 'disponible', label: 'Disponibles', status: 'disponible' },
    { key: 'aplicada', label: 'Aplicadas', status: 'aplicada' },
    { key: 'anulada', label: 'Anuladas', status: 'anulada' },
  ];

  readonly rows = signal<SupplierCreditNote[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly suppliers = signal<Supplier[]>([]);
  readonly search = signal('');
  readonly tab = signal('all');
  readonly supplierId = signal<number | null>(null);
  readonly page = signal(1);
  readonly perPage = signal(20);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' }>({ field: 'date', dir: 'desc' });

  // Diálogo "Nueva nota manual"
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});

  readonly dialogForm = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    supplier_note_number: ['', Validators.maxLength(100)],
    date: [new Date() as Date | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    notes: ['', Validators.maxLength(2000)],
  });

  readonly canCreate = computed(() => this.auth.can('supplier_credit_notes.create'));

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    // Pestaña inicial desde ?status= (p. ej. desde el estado de cuenta).
    const initial = this.router.parseUrl(this.router.url).queryParams['status'] as string | undefined;
    if (initial && this.tabs.some((t) => t.key === initial)) this.tab.set(initial);

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
    effect(() => {
      const s = this.search();
      if (s === this.lastSearch) return;
      this.lastSearch = s;
      untracked(() => this.search$.next(s));
    });

    this.catalog.suppliers
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.suppliers.set(list));
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  selectTab(key: string): void {
    if (this.tab() === key) return;
    this.tab.set(key);
    this.reload();
  }

  setSupplier(id: number | null): void {
    this.supplierId.set(id);
    this.reload();
  }

  private reload(): void {
    this.page.set(1);
    this.load();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.perPage();
    this.perPage.set(rows);
    this.page.set(Math.floor(first / rows) + 1);
    if (event.sortField && typeof event.sortField === 'string') {
      this.sort.set({ field: event.sortField, dir: event.sortOrder === 1 ? 'asc' : 'desc' });
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const tab = this.tabs.find((t) => t.key === this.tab());
    const sort = this.sort();
    this.api
      .creditNotes({
        search: this.search() || undefined,
        status: tab?.status ?? undefined,
        supplier_id: this.supplierId() ?? undefined,
        page: this.page(),
        per_page: this.perPage(),
        sort: sort.field,
        dir: sort.dir,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  /** Devolución de origen (el nombre `return` no se puede usar en plantillas). */
  originOf(row: SupplierCreditNote): { id: number; number: string } | null {
    return row.return ?? null;
  }

  goDetail(row: SupplierCreditNote): void {
    void this.router.navigate(['/pagos/notas-credito', row.id]);
  }

  // ---------- Diálogo nota manual ----------

  openDialog(): void {
    this.submitted.set(false);
    this.serverErrors.set({});
    this.dialogForm.reset({ supplier_id: null, supplier_note_number: '', date: new Date(), amount: null, notes: '' });
    this.dialogOpen.set(true);
  }

  createNote(): void {
    this.submitted.set(true);
    if (this.dialogForm.invalid) {
      this.dialogForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    const v = this.dialogForm.getRawValue();
    this.api
      .createCreditNote({
        supplier_id: v.supplier_id as number,
        supplier_note_number: v.supplier_note_number?.trim() || null,
        date: this.toIso(v.date) ?? '',
        amount: Number(v.amount),
        notes: v.notes?.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.dialogOpen.set(false);
          this.toast.success('Nota crédito registrada.', saved.number);
          void this.router.navigate(['/pagos/notas-credito', saved.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as Partial<ValidationErrors>;
            if (body.errors) this.serverErrors.set(body.errors);
            this.toast.warn('No se pudo registrar la nota', body.message);
          }
        },
      });
  }

  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  payableTone = payableTone;

  private toIso(d: Date | null | undefined): string | undefined {
    if (!(d instanceof Date)) return undefined;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
