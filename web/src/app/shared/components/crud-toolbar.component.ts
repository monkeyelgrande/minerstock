import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

/** Barra de filtros de listado: búsqueda, estado activo, filtros extra proyectados y botón "Nuevo". */
@Component({
  selector: 'app-crud-toolbar',
  imports: [FormsModule, InputTextModule, SelectModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
      <div class="relative flex-1 min-w-[220px] max-w-md">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none !text-[18px]">search</span>
        <input
          pInputText
          type="text"
          class="w-full !pl-9"
          [placeholder]="searchPlaceholder()"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
        />
      </div>
      <ng-content />
      @if (showActiveFilter()) {
        <p-select
          [options]="activeOptions"
          optionLabel="label"
          optionValue="value"
          [ngModel]="active()"
          (ngModelChange)="active.set($event)"
          styleClass="w-40"
        />
      }
      <div class="flex-1"></div>
      <ng-content select="[actions]" />
      @if (createLabel(); as lbl) {
        <p-button [label]="lbl" icon="pi pi-plus" (onClick)="create.emit()" />
      }
    </div>
  `,
})
export class CrudToolbarComponent {
  readonly search = model('');
  readonly active = model<'' | '1' | '0'>('1');
  readonly searchPlaceholder = input('Buscar…');
  readonly createLabel = input<string | null>('Nuevo');
  readonly showActiveFilter = input(true);
  readonly create = output<void>();

  readonly activeOptions = [
    { label: 'Solo activos', value: '1' },
    { label: 'Solo inactivos', value: '0' },
    { label: 'Todos', value: '' },
  ];
}
