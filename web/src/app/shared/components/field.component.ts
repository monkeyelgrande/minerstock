import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/**
 * Envoltorio de campo: etiqueta, control proyectado, ayuda y error.
 * Muestra errores del cliente (Validators) y del servidor (422) en `serverError`.
 */
@Component({
  selector: 'app-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="field-label">
      {{ label() }}
      @if (required()) {
        <span class="text-red-500">*</span>
      }
    </label>
    <ng-content />
    @if (errorText(); as err) {
      <p class="field-error">{{ err }}</p>
    } @else if (hint()) {
      <p class="field-hint">{{ hint() }}</p>
    }
  `,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly required = input(false);
  readonly control = input<AbstractControl | null>(null);
  readonly serverError = input<string | string[] | undefined>();
  /** Fuerza mostrar errores aunque el control no esté "touched" (tras intentar guardar). */
  readonly submitted = input(false);

  readonly errorText = computed(() => {
    const server = this.serverError();
    if (server) return Array.isArray(server) ? server[0] : server;
    // Se lee `submitted` siempre (antes de cualquier corto-circuito) para que el computed
    // dependa de ella y se reevalúe al abrir de nuevo el formulario o al reintentar guardar.
    const submitted = this.submitted();
    const c = this.control();
    if (!c || !c.errors || !(c.touched || submitted)) return null;
    const e = c.errors;
    if (e['required']) return 'Este campo es obligatorio.';
    if (e['email']) return 'Ingresa un correo válido.';
    if (e['minlength']) return `Mínimo ${e['minlength'].requiredLength} caracteres.`;
    if (e['maxlength']) return `Máximo ${e['maxlength'].requiredLength} caracteres.`;
    if (e['min']) return `El valor mínimo es ${e['min'].min}.`;
    if (e['max']) return `El valor máximo es ${e['max'].max}.`;
    if (e['pattern']) return 'Formato no válido.';
    return 'Valor no válido.';
  });
}
