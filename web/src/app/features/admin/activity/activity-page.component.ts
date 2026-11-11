import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { AdminApi } from '../../../core/api/admin-api.service';
import { ReportsApi } from '../../../core/api/reports-api.service';
import { User } from '../../../core/models/auth.model';
import { ActivityEntry } from '../../../core/models/reports.model';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ChipTone, StatusChipComponent } from '../../../shared/components/status-chip.component';

const MAX_CHANGE_LINES = 4;

/** Fila lista para pintar: entrada + acción y cambios ya resueltos. */
interface ActivityRow {
  entry: ActivityEntry;
  actionLabel: string | null;
  actionTone: ChipTone;
  doc: string | null;
  lines: string[];
  more: number;
}

const EVENT_META: Record<string, { label: string; tone: ChipTone }> = {
  created: { label: 'Creó', tone: 'success' },
  updated: { label: 'Actualizó', tone: 'info' },
  deleted: { label: 'Eliminó', tone: 'danger' },
};

/** Log de actividad: auditoría de quién hizo qué y cuándo (solo admin). */
@Component({
  selector: 'app-activity-page',
  imports: [
    DatePipe, FormsModule, TableModule, SelectModule, DatePickerModule, InputTextModule,
    PageHeaderComponent, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activity-page.component.html',
})
export class ActivityPageComponent {
  private readonly api = inject(ReportsApi);
  private readonly admin = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly search$ = new Subject<string>();

  // ---------- Filtros ----------
  readonly search = signal('');
  readonly userId = signal<number | null>(null);
  readonly subjectType = signal<string | null>(null);
  readonly event = signal<string | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);

  readonly users = signal<User[]>([]);
  readonly subjectTypes = signal<string[]>([]);

  readonly eventOptions = [
    { label: 'Creación', value: 'created' },
    { label: 'Actualización', value: 'updated' },
    { label: 'Eliminación', value: 'deleted' },
  ];

  // ---------- Listado ----------
  readonly rows = signal<ActivityRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly page = signal(1);
  readonly perPage = signal(20);

  constructor() {
    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.search.set(term);
        this.page.set(1);
        this.load();
      });

    // Usuarios para el filtro (incluye inactivos: también dejaron rastro).
    this.admin.users
      .all({ active: '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => this.users.set(users));
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  onSearch(term: string): void {
    this.search$.next(term);
  }

  setFilter<T>(sig: { set(value: T): void }, value: T): void {
    sig.set(value);
    this.page.set(1);
    this.load();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.perPage();
    this.perPage.set(rows);
    this.page.set(Math.floor(first / rows) + 1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string | number> = {
      page: this.page(),
      per_page: this.perPage(),
    };
    const search = this.search().trim();
    if (search) params['search'] = search;
    if (this.userId() !== null) params['user_id'] = this.userId()!;
    if (this.subjectType()) params['subject_type'] = this.subjectType()!;
    if (this.event()) params['event'] = this.event()!;
    const from = this.toIso(this.dateFrom());
    const to = this.toIso(this.dateTo());
    if (from) params['date_from'] = from;
    if (to) params['date_to'] = to;

    this.api
      .activity(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data.map((e) => this.toRow(e)));
          this.total.set(res.meta.total);
          if (res.subject_types?.length) this.subjectTypes.set(res.subject_types);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  // ---------- Presentación ----------

  private toRow(e: ActivityEntry): ActivityRow {
    const meta = e.event ? EVENT_META[e.event] : undefined;
    const doc = e.subject_type
      ? `${e.subject_type} · ${e.subject_number ?? (e.subject_id !== null ? `#${e.subject_id}` : '—')}`
      : null;
    const { lines, more } = this.changeLines(e);
    return {
      entry: e,
      actionLabel: meta?.label ?? null,
      actionTone: meta?.tone ?? 'draft',
      doc,
      lines,
      more,
    };
  }

  /** Resumen compacto de cambios: "campo: antes → después" (updated) o "campo: valor" (created). */
  private changeLines(e: ActivityEntry): { lines: string[]; more: number } {
    const attrs = e.changes?.attributes;
    if (!attrs) return { lines: [], more: 0 };

    let all: string[];
    if (e.event === 'updated' && e.changes.old) {
      const old = e.changes.old;
      all = Object.keys(attrs).map((k) => `${k}: ${this.fmt(old[k])} → ${this.fmt(attrs[k])}`);
    } else if (e.event === 'deleted') {
      return { lines: [], more: 0 };
    } else {
      all = Object.entries(attrs)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${this.fmt(v)}`);
    }
    return {
      lines: all.slice(0, MAX_CHANGE_LINES),
      more: Math.max(0, all.length - MAX_CHANGE_LINES),
    };
  }

  private fmt(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    let text: string;
    if (typeof value === 'object') {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    } else {
      text = String(value);
    }
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  private toIso(d: Date | null): string | null {
    if (!d) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
