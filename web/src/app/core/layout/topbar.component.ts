import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { PopoverModule } from 'primeng/popover';

import { AuthService } from '../auth/auth.service';
import { WarehouseContext } from '../services/warehouse-context.service';

@Component({
  selector: 'app-topbar',
  imports: [MenuModule, PopoverModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="fixed top-0 right-0 h-topbar bg-surface/95 backdrop-blur border-b border-line z-40 px-6 flex items-center justify-between gap-4 transition-[left] duration-200"
      [style.left.px]="collapsed() ? 68 : 260"
    >
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          class="p-2 rounded-lg text-ink-2 hover:bg-canvas hover:text-ink transition-colors"
          (click)="toggle.emit()"
          aria-label="Contraer menú"
        >
          <span class="material-symbols-outlined">{{ collapsed() ? 'menu_open' : 'menu' }}</span>
        </button>
        <div class="relative w-full max-w-md hidden md:flex items-center">
          <span class="material-symbols-outlined absolute left-3 text-ink-3 pointer-events-none">search</span>
          <input
            type="text"
            class="w-full h-10 pl-10 pr-16 bg-canvas rounded-lg border border-line text-sm text-ink placeholder:text-placeholder focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            placeholder="Buscar documento o producto…"
            disabled
          />
          <kbd class="absolute right-3 px-1.5 py-0.5 text-[10px] font-semibold bg-line/60 text-ink-3 rounded border border-line-strong/50">Ctrl+K</kbd>
        </div>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <!-- Bodega activa -->
        @if (ctx.options().length > 0) {
          <button
            type="button"
            class="flex items-center gap-2 bg-canvas border border-line rounded-lg px-3 h-10 text-left hover:border-brand transition-colors"
            (click)="warehousePopover.toggle($event)"
          >
            <span class="material-symbols-outlined text-brand">warehouse</span>
            <span class="flex flex-col leading-none">
              <span class="text-[10px] uppercase text-ink-3 font-medium">Bodega activa</span>
              <span class="text-[13px] font-semibold text-ink mt-0.5">{{ ctx.active()?.name ?? 'Seleccionar' }}</span>
            </span>
            <span class="material-symbols-outlined !text-[18px] text-ink-3">expand_more</span>
          </button>
          <p-popover #warehousePopover>
            <div class="w-64 py-1">
              @for (w of ctx.options(); track w.id) {
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-canvas flex items-center gap-2"
                  [class.font-semibold]="w.id === ctx.activeId()"
                  (click)="ctx.select(w.id); warehousePopover.hide()"
                >
                  <span class="material-symbols-outlined !text-[18px]" [class.text-brand]="w.id === ctx.activeId()" [class.text-ink-3]="w.id !== ctx.activeId()">
                    {{ w.id === ctx.activeId() ? 'check_circle' : 'warehouse' }}
                  </span>
                  <span class="flex flex-col leading-tight">
                    <span>{{ w.name }}</span>
                    <span class="text-[11px] text-ink-3">{{ w.code }}</span>
                  </span>
                </button>
              }
            </div>
          </p-popover>
        }

        <div class="h-6 w-px bg-line"></div>

        <button type="button" class="relative p-2 rounded-lg hover:bg-canvas text-ink-2 transition-colors" aria-label="Notificaciones">
          <span class="material-symbols-outlined !text-[22px]">notifications</span>
        </button>

        <!-- Usuario -->
        <button type="button" class="flex items-center gap-2 pl-1 group" (click)="userMenu.toggle($event)">
          <div class="w-8 h-8 rounded-full bg-shell text-white flex items-center justify-center">
            <span class="material-symbols-outlined !text-[18px]">person</span>
          </div>
          <span class="material-symbols-outlined !text-[18px] text-ink-3 group-hover:text-ink">arrow_drop_down</span>
        </button>
        <p-menu #userMenu [model]="userItems" [popup]="true" appendTo="body" />
      </div>
    </header>
  `,
})
export class TopbarComponent {
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);
  private readonly router = inject(Router);

  readonly collapsed = input(false);
  readonly toggle = output<void>();

  readonly userItems: MenuItem[] = [
    { label: 'Mi perfil', icon: 'pi pi-user', command: () => void this.router.navigate(['/perfil']) },
    { separator: true },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.auth.logout() },
  ];
}
