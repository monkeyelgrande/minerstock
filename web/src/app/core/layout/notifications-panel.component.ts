import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Popover, PopoverModule } from 'primeng/popover';
import { catchError, filter, interval, of, startWith, switchMap } from 'rxjs';

import { ReportsApi } from '../api/reports-api.service';
import { AuthService } from '../auth/auth.service';
import { AppNotification, NotificationPage } from '../models/reports.model';

const PAGE_SIZE = 10;
const POLL_MS = 60_000;

/** Campana de notificaciones del topbar: badge de no leídas + panel con las últimas. */
@Component({
  selector: 'app-notifications-panel',
  imports: [PopoverModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="relative p-2 rounded-lg hover:bg-canvas text-ink-2 transition-colors"
      aria-label="Notificaciones"
      (click)="toggle($event, pop)"
    >
      <span class="material-symbols-outlined !text-[22px]">notifications</span>
      @if (unread() > 0) {
        <span
          class="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center tabular"
        >
          {{ badge() }}
        </span>
      }
    </button>

    <p-popover #pop (onHide)="open.set(false)">
      <div class="w-[380px] max-w-[85vw]">
        <!-- Encabezado -->
        <div class="flex items-center justify-between px-3 pt-1 pb-2 border-b border-line">
          <span class="text-sm font-semibold text-ink">Notificaciones</span>
          @if (unread() > 0) {
            <button
              type="button"
              class="text-xs font-medium text-brand hover:underline disabled:opacity-50"
              [disabled]="markingAll()"
              (click)="markAllRead()"
            >
              Marcar todas leídas
            </button>
          }
        </div>

        <!-- Lista -->
        <div class="max-h-[400px] overflow-y-auto">
          @for (n of items(); track n.id) {
            <button
              type="button"
              class="w-full text-left flex items-start gap-3 px-3 py-2.5 border-b border-line/60 last:border-b-0 hover:bg-canvas transition-colors"
              [class.bg-amber-50]="!n.read_at"
              (click)="select(n, pop)"
            >
              <span class="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined !text-[20px]">{{ n.icon || 'notifications' }}</span>
              </span>
              <span class="flex flex-col min-w-0 flex-1">
                <span class="text-sm text-ink" [class.font-semibold]="!n.read_at" [class.font-medium]="!!n.read_at">
                  {{ n.title }}
                </span>
                <span class="text-xs text-ink-2 line-clamp-2">{{ n.body }}</span>
                <span class="text-[11px] text-ink-3 mt-0.5">{{ relative(n.created_at) }}</span>
              </span>
              @if (!n.read_at) {
                <span class="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" aria-label="No leída"></span>
              }
            </button>
          } @empty {
            @if (!loading()) {
              <div class="flex flex-col items-center gap-2 py-8 text-ink-3">
                <span class="material-symbols-outlined !text-[32px]">notifications_off</span>
                <span class="text-sm">Sin notificaciones.</span>
              </div>
            }
          }
          @if (loading()) {
            <div class="py-3 text-center text-xs text-ink-3">Cargando…</div>
          }
        </div>

        <!-- Pie -->
        @if (hasMore()) {
          <div class="border-t border-line pt-1">
            <button
              type="button"
              class="w-full py-2 text-xs font-medium text-brand hover:bg-canvas rounded-md transition-colors disabled:opacity-50"
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Cargando…' : 'Ver más' }}
            </button>
          </div>
        }
      </div>
    </p-popover>
  `,
})
export class NotificationsPanelComponent {
  private readonly api = inject(ReportsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly markingAll = signal(false);
  readonly open = signal(false);
  readonly page = signal(1);
  readonly lastPage = signal(1);

  readonly badge = computed(() => (this.unread() > 9 ? '9+' : String(this.unread())));
  readonly hasMore = computed(() => this.page() < this.lastPage());

  constructor() {
    // Sondeo cada 60 s (solo con sesión activa); la primera emisión carga el estado inicial.
    interval(POLL_MS)
      .pipe(
        startWith(0),
        filter(() => this.auth.isLoggedIn()),
        switchMap(() =>
          this.api.notifications({ page: 1, per_page: PAGE_SIZE }).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        if (!res) return;
        this.unread.set(res.unread_count);
        // No pisar la lista mientras el panel está abierto (p. ej. tras "Ver más").
        if (!this.open()) this.applyFirstPage(res);
      });
  }

  toggle(event: Event, pop: Popover): void {
    const wasOpen = this.open();
    pop.toggle(event);
    // onHide (al cerrar) ya deja open=false; aquí solo se registra la apertura.
    if (!wasOpen) {
      this.open.set(true);
      this.refresh();
    }
  }

  refresh(): void {
    this.loading.set(true);
    this.api
      .notifications({ page: 1, per_page: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.applyFirstPage(res);
          this.unread.set(res.unread_count);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    const next = this.page() + 1;
    this.loadingMore.set(true);
    this.api
      .notifications({ page: next, per_page: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.items.update((list) => [...list, ...res.data]);
          this.page.set(res.meta.current_page);
          this.lastPage.set(res.meta.last_page);
          this.unread.set(res.unread_count);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false),
      });
  }

  select(n: AppNotification, pop: Popover): void {
    pop.hide();
    if (!n.read_at) {
      const now = new Date().toISOString();
      this.items.update((list) => list.map((i) => (i.id === n.id ? { ...i, read_at: now } : i)));
      this.unread.update((c) => Math.max(0, c - 1));
      this.api
        .markRead(n.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (r) => this.unread.set(r.unread_count),
          error: () => void 0,
        });
    }
    void this.router.navigate([n.route], { queryParams: n.params ?? {} });
  }

  markAllRead(): void {
    if (this.markingAll()) return;
    this.markingAll.set(true);
    this.api
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          this.items.update((list) => list.map((i) => (i.read_at ? i : { ...i, read_at: now })));
          this.unread.set(0);
          this.markingAll.set(false);
        },
        error: () => this.markingAll.set(false),
      });
  }

  /** Tiempo relativo en español: "hace 5 min", "hace 2 h", "hace 3 días" o fecha. */
  relative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? 'hace 1 día' : `hace ${d} días`;
    const date = new Date(iso);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${date.getFullYear()}`;
  }

  private applyFirstPage(res: NotificationPage): void {
    this.items.set(res.data);
    this.page.set(res.meta.current_page);
    this.lastPage.set(res.meta.last_page);
  }
}
