import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SidebarComponent } from './sidebar.component';
import { TopbarComponent } from './topbar.component';

const KEY = 'minerstock.sidebarCollapsed';

/** Layout principal: sidebar + topbar + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar [collapsed]="collapsed()" />
    <app-topbar [collapsed]="collapsed()" (toggle)="toggleSidebar()" />
    <main
      class="min-h-screen pt-topbar transition-[padding] duration-200"
      [style.padding-left.px]="collapsed() ? 68 : 260"
    >
      <div class="p-6">
        <router-outlet />
      </div>
    </main>
  `,
})
export class ShellComponent {
  readonly collapsed = signal(this.readStored());

  toggleSidebar(): void {
    this.collapsed.update((v) => !v);
    try {
      localStorage.setItem(KEY, this.collapsed() ? '1' : '0');
    } catch {
      /* noop */
    }
  }

  private readStored(): boolean {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }
}
