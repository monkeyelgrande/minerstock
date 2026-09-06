import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb {
  label: string;
  route?: string;
}

/** Encabezado de página: breadcrumb, título, subtítulo y slot de acciones a la derecha. */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 text-xs text-ink-3 mb-1">
          <a routerLink="/dashboard" class="hover:text-ink transition-colors">MinerStock</a>
          @for (c of crumbs(); track c.label) {
            <span>/</span>
            @if (c.route) {
              <a [routerLink]="c.route" class="hover:text-ink transition-colors">{{ c.label }}</a>
            } @else {
              <span class="text-ink font-semibold">{{ c.label }}</span>
            }
          }
        </div>
        <h1 class="page-title flex items-center gap-3">
          {{ title() }}
          <ng-content select="[chip]" />
        </h1>
        @if (subtitle()) {
          <p class="page-subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly crumbs = input<Crumb[]>([]);
}
