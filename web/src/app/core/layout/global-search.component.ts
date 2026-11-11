import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { ReportsApi } from '../api/reports-api.service';
import { SearchGroup, SearchItem } from '../models/reports.model';

/** Buscador global del topbar: documentos por número y productos. */
@Component({
  selector: 'app-global-search',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative w-full max-w-md hidden md:flex items-center' },
  template: `
    <span class="material-symbols-outlined absolute left-3 text-ink-3 pointer-events-none">search</span>
    <input
      #inputEl
      type="text"
      class="w-full h-10 pl-10 pr-16 bg-canvas rounded-lg border border-line text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
      placeholder="Buscar documento o producto…"
      autocomplete="off"
      role="combobox"
      aria-label="Buscar documento o producto"
      [attr.aria-expanded]="open()"
      [ngModel]="query()"
      (ngModelChange)="onQuery($event)"
      (focus)="onFocus()"
      (keydown)="onKeydown($event)"
    />
    @if (loading()) {
      <span class="material-symbols-outlined absolute right-3 !text-[18px] text-ink-3 animate-spin">progress_activity</span>
    } @else {
      <kbd class="absolute right-3 px-1.5 py-0.5 text-[10px] font-semibold bg-line/60 text-ink-3 rounded border border-line-strong/50">Ctrl+K</kbd>
    }

    @if (open()) {
      <div
        class="absolute top-full left-0 right-0 mt-2 bg-surface border border-line rounded-lg shadow-lg z-50 max-h-[420px] overflow-y-auto py-1"
        role="listbox"
      >
        @if (groups(); as gs) {
          @if (gs.length > 0) {
            @for (g of gs; track g.type) {
              <div class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{{ g.label }}</div>
              @for (item of g.items; track item.id) {
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 hover:bg-canvas transition-colors"
                  [class.bg-canvas]="flatIndex(item) === active()"
                  role="option"
                  [attr.aria-selected]="flatIndex(item) === active()"
                  (click)="select(item)"
                >
                  <div class="text-sm font-semibold text-ink">{{ item.title }}</div>
                  <div class="text-xs text-ink-3">{{ item.subtitle }}</div>
                </button>
              }
            }
          } @else {
            <div class="px-3 py-4 text-sm text-ink-3 text-center">Sin resultados para «{{ query().trim() }}»</div>
          }
        }
      </div>
    }
  `,
})
export class GlobalSearchComponent {
  private readonly api = inject(ReportsApi);
  private readonly router = inject(Router);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');
  private readonly query$ = new Subject<string>();

  readonly query = signal('');
  readonly loading = signal(false);
  /** null = sin búsqueda vigente (menos de 2 caracteres). */
  readonly groups = signal<SearchGroup[] | null>(null);
  readonly open = signal(false);
  readonly active = signal(-1);

  private readonly flat = computed<SearchItem[]>(() => (this.groups() ?? []).flatMap((g) => g.items));

  constructor() {
    this.query$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          const term = q.trim();
          if (term.length < 2) {
            this.loading.set(false);
            return of(null);
          }
          this.loading.set(true);
          return this.api.search(term).pipe(catchError(() => of([] as SearchGroup[])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((groups) => {
        this.loading.set(false);
        this.groups.set(groups);
        this.active.set(-1);
        this.open.set(groups !== null);
      });
  }

  onQuery(value: string): void {
    this.query.set(value);
    if (value.trim().length < 2) {
      this.groups.set(null);
      this.open.set(false);
      this.loading.set(false);
    }
    this.query$.next(value);
  }

  onFocus(): void {
    if (this.groups() !== null) this.open.set(true);
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.open.set(false);
        this.input().nativeElement.blur();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        const items = this.flat();
        const item = this.active() >= 0 ? items[this.active()] : items.length === 1 ? items[0] : undefined;
        if (item) {
          event.preventDefault();
          this.select(item);
        }
        break;
      }
    }
  }

  select(item: SearchItem): void {
    this.clear();
    this.input().nativeElement.blur();
    void this.router.navigate([item.route], { queryParams: item.params ?? {} });
  }

  flatIndex(item: SearchItem): number {
    return this.flat().indexOf(item);
  }

  /** Ctrl+K / Cmd+K enfoca el buscador. */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.input().nativeElement.focus();
    }
  }

  /** Clic fuera del componente cierra el panel. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const host = this.el.nativeElement as HTMLElement;
    if (!host.contains(event.target as Node)) this.open.set(false);
  }

  private move(dir: 1 | -1): void {
    const count = this.flat().length;
    if (count === 0) return;
    if (!this.open()) this.open.set(true);
    const next = (this.active() + dir + count) % count;
    this.active.set(next);
  }

  private clear(): void {
    this.query.set('');
    this.query$.next('');
    this.groups.set(null);
    this.open.set(false);
    this.active.set(-1);
    this.loading.set(false);
  }
}
