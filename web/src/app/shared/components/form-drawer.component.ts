import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';

/**
 * Panel lateral (drawer) para formularios de maestros.
 * Uso: <app-form-drawer [(visible)]="open" title="Nuevo proveedor" (save)="save()">...campos...</app-form-drawer>
 */
@Component({
  selector: 'app-form-drawer',
  imports: [DrawerModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-drawer
      [(visible)]="visible"
      position="right"
      [modal]="true"
      [dismissible]="!saving()"
      [closeOnEscape]="!saving()"
      [style]="{ width: width() }"
      (onHide)="closed.emit()"
    >
      <ng-template #header>
        <div class="flex flex-col">
          <span class="text-base font-semibold text-ink">{{ title() }}</span>
          @if (subtitle()) {
            <span class="text-xs text-ink-3 mt-0.5">{{ subtitle() }}</span>
          }
        </div>
      </ng-template>

      <form class="flex flex-col h-full" (submit)="onSubmit($event)" novalidate>
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <ng-content />
        </div>
        <div class="px-5 py-3 border-t border-line bg-canvas/60 flex items-center justify-end gap-2">
          <ng-content select="[footer-start]" />
          <p-button label="Cancelar" severity="secondary" [outlined]="true" type="button" [disabled]="saving()" (onClick)="visible.set(false)" />
          <p-button [label]="saveLabel()" type="submit" [loading]="saving()" />
        </div>
      </form>
    </p-drawer>
  `,
})
export class FormDrawerComponent {
  readonly visible = model(false);
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly saveLabel = input('Guardar');
  readonly saving = input(false);
  readonly width = input('480px');
  readonly save = output<void>();
  readonly closed = output<void>();

  /** Evita el submit nativo (recarga de página) y delega en el padre. */
  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.saving()) this.save.emit();
  }
}
