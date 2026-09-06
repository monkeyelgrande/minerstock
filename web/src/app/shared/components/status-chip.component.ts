import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ChipTone = 'draft' | 'pending' | 'success' | 'partial' | 'danger' | 'info';

/** Chip de estado con los tonos del sistema de diseño. */
@Component({
  selector: 'app-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="'chip chip-' + tone()"><ng-content />{{ label() }}</span>`,
})
export class StatusChipComponent {
  readonly tone = input<ChipTone>('draft');
  readonly label = input<string>('');
}

/** Chip Activo / Inactivo. */
@Component({
  selector: 'app-active-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="cls()">{{ active() ? 'Activo' : 'Inactivo' }}</span>`,
})
export class ActiveChipComponent {
  readonly active = input<boolean>(true);
  readonly cls = computed(() => (this.active() ? 'chip chip-success' : 'chip chip-draft'));
}
