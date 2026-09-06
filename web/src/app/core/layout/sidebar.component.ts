import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../auth/auth.service';
import { ROLE_LABELS } from '../models/auth.model';
import { NAV_SECTIONS } from './nav.config';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="fixed left-0 top-0 h-screen bg-shell text-shell-muted z-50 flex flex-col transition-[width] duration-200"
      [class.w-sidebar]="!collapsed()"
      [class.w-[68px]]="collapsed()"
    >
      <!-- Logo -->
      <div class="h-topbar px-4 flex items-center gap-3 border-b border-white/10 shrink-0 overflow-hidden">
        <div class="w-10 h-10 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center text-brand shrink-0">
          <span class="material-symbols-outlined !text-[24px]">hardware</span>
        </div>
        @if (!collapsed()) {
          <div class="flex flex-col leading-none">
            <span class="text-base font-bold text-white tracking-tight">Miner<span class="text-brand">Stock</span></span>
            <span class="text-[10px] font-semibold uppercase tracking-widest text-brand mt-1">ERP Minero</span>
          </div>
        }
      </div>

      <!-- Navegación -->
      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 [scrollbar-width:thin]">
        @for (section of sections(); track section.title ?? 'root') {
          @if (section.title && !collapsed()) {
            <div class="pt-3 pb-1 px-3">
              <span class="th-label !text-shell-muted/70">{{ section.title }}</span>
            </div>
          } @else if (section.title && collapsed()) {
            <div class="my-2 mx-3 border-t border-white/10"></div>
          }
          @for (item of section.items; track item.route) {
            <a
              [routerLink]="item.soon ? null : item.route"
              routerLinkActive="bg-shell-2 text-white border-brand font-semibold"
              [routerLinkActiveOptions]="{ exact: false }"
              class="flex items-center gap-3 px-3 py-2 rounded-r-lg border-l-4 border-transparent text-[13px] transition-colors"
              [class.hover:bg-shell-2/60]="!item.soon"
              [class.hover:text-white]="!item.soon"
              [class.opacity-40]="item.soon"
              [class.cursor-not-allowed]="item.soon"
              [class.justify-center]="collapsed()"
              [pTooltip]="collapsed() ? item.label : (item.soon ? 'Disponible en una fase posterior' : '')"
              tooltipPosition="right"
            >
              <span class="material-symbols-outlined !text-[18px] shrink-0">{{ item.icon }}</span>
              @if (!collapsed()) {
                <span class="truncate">{{ item.label }}</span>
              }
            </a>
          }
        }
      </nav>

      <!-- Usuario -->
      <div class="p-2 border-t border-white/10 shrink-0">
        <div class="flex items-center gap-3 p-2 rounded-lg" [class.justify-center]="collapsed()">
          <div class="w-9 h-9 rounded-full bg-brand text-ink flex items-center justify-center text-sm font-bold shrink-0">
            {{ initials() }}
          </div>
          @if (!collapsed()) {
            <div class="flex flex-col min-w-0 flex-1 leading-tight">
              <span class="text-[13px] font-medium text-white truncate">{{ auth.user()?.name }}</span>
              <span class="text-[11px] text-shell-muted truncate">{{ roleLabel() }}</span>
            </div>
          }
        </div>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  readonly collapsed = input(false);

  readonly sections = computed(() => {
    // Recalcula cuando cambian los permisos del usuario.
    this.auth.user();
    return NAV_SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.permission || this.auth.can(i.permission)),
    })).filter((s) => s.items.length > 0);
  });

  readonly initials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  });

  readonly roleLabel = computed(() =>
    (this.auth.user()?.roles ?? []).map((r) => ROLE_LABELS[r] ?? r).join(' · '),
  );
}
