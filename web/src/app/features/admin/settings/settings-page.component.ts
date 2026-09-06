import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin } from 'rxjs';

import { AdminApi } from '../../../core/api/admin-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { DocumentSequence, Settings } from '../../../core/models/auth.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { ToastService } from '../../../core/services/toast.service';
import { FieldComponent } from '../../../shared/components/field.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';

/** Configuración general: datos de la empresa, IVA por defecto y consecutivos de documentos. */
@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule, ButtonModule, InputNumberModule, InputTextModule, TextareaModule, TooltipModule,
    FieldComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.component.html',
})
export class SettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly canEdit = computed(() => this.auth.can('settings.update'));
  readonly loading = signal(true);

  // ---------- Empresa ----------
  readonly savingSettings = signal(false);
  readonly settingsSubmitted = signal(false);
  readonly settingsErrors = signal<Record<string, string[]>>({});

  readonly settingsForm = this.fb.group({
    company: this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(160)]],
      document_number: [''],
      address: [''],
      phone: [''],
      email: ['', Validators.email],
    }),
    default_tax_rate: [19 as number | null, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  // ---------- Consecutivos ----------
  /** Filas originales (para el mínimo de "próximo número" y detectar cambios). */
  readonly sequences = signal<DocumentSequence[]>([]);
  readonly savingSeq = signal<Set<string>>(new Set());
  readonly seqArray = this.fb.array<FormGroup>([]);
  private readonly seqValue = toSignal(this.seqArray.valueChanges, { initialValue: [] as unknown[] });

  /** Vista previa "OC-00001" por fila. */
  readonly previews = computed(() => {
    const rows = (this.seqValue() ?? []) as { prefix: string | null; next_number: number | null; padding: number | null }[];
    return rows.map((r) => this.preview(r?.prefix, r?.next_number, r?.padding));
  });

  /** True si la fila difiere de lo guardado. */
  readonly seqDirty = computed(() => {
    const rows = (this.seqValue() ?? []) as { prefix: string | null; next_number: number | null; padding: number | null }[];
    return this.sequences().map((s, i) => {
      const r = rows[i];
      if (!r) return false;
      return (r.prefix ?? '') !== (s.prefix ?? '') || Number(r.next_number) !== Number(s.next_number) || Number(r.padding) !== Number(s.padding);
    });
  });

  constructor() {
    forkJoin({ settings: this.admin.settings(), sequences: this.admin.sequences() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ settings, sequences }) => {
          this.patchSettings(settings);
          this.setSequences(sequences);
          this.loading.set(false);
          if (!this.canEdit()) {
            this.settingsForm.disable({ emitEvent: false });
            this.seqArray.disable({ emitEvent: false });
            this.seqArray.updateValueAndValidity();
          }
        },
        error: () => this.loading.set(false),
      });
  }

  private patchSettings(s: Settings): void {
    this.settingsForm.patchValue({
      company: {
        name: s.company?.name ?? '',
        document_number: s.company?.document_number ?? '',
        address: s.company?.address ?? '',
        phone: s.company?.phone ?? '',
        email: s.company?.email ?? '',
      },
      default_tax_rate: s.default_tax_rate ?? 0,
    });
    this.settingsForm.markAsPristine();
  }

  private setSequences(list: DocumentSequence[]): void {
    this.sequences.set(list);
    this.seqArray.clear({ emitEvent: false });
    for (const s of list) {
      this.seqArray.push(
        this.fb.group({
          prefix: [s.prefix ?? '', Validators.maxLength(10)],
          next_number: [s.next_number, [Validators.required, Validators.min(s.next_number)]],
          padding: [s.padding, [Validators.required, Validators.min(3), Validators.max(8)]],
        }),
        { emitEvent: false },
      );
    }
    this.seqArray.updateValueAndValidity();
  }

  get seqGroups(): FormGroup[] {
    return this.seqArray.controls;
  }

  seqErr(i: number, field: string): string | null {
    const c = this.seqArray.at(i)?.get(field);
    if (!c || !c.invalid || !c.touched) return null;
    if (c.errors?.['required']) return 'Obligatorio.';
    if (c.errors?.['min']) return `Mínimo ${c.errors['min'].min}.`;
    if (c.errors?.['max']) return `Máximo ${c.errors['max'].max}.`;
    if (c.errors?.['maxlength']) return `Máximo ${c.errors['maxlength'].requiredLength} caracteres.`;
    return 'Valor no válido.';
  }

  preview(prefix: string | null | undefined, next: number | null | undefined, padding: number | null | undefined): string {
    const n = Math.max(0, Math.trunc(Number(next ?? 0)));
    const pad = Math.min(8, Math.max(1, Math.trunc(Number(padding ?? 1))));
    return `${prefix ?? ''}${String(n).padStart(pad, '0')}`;
  }

  isSavingSeq(docType: string): boolean {
    return this.savingSeq().has(docType);
  }

  // ---------- Guardar ----------

  saveSettings(): void {
    this.settingsSubmitted.set(true);
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    this.savingSettings.set(true);
    this.settingsErrors.set({});
    const v = this.settingsForm.getRawValue();
    const body: Settings = {
      company: {
        name: v.company.name ?? '',
        document_number: v.company.document_number ?? '',
        address: v.company.address ?? '',
        phone: v.company.phone ?? '',
        email: v.company.email ?? '',
      },
      default_tax_rate: v.default_tax_rate ?? 0,
    };
    this.admin
      .updateSettings(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingSettings.set(false);
          this.patchSettings(saved);
          this.toast.success('Configuración guardada.');
        },
        error: (err: unknown) => {
          this.savingSettings.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body422 = err.error as ValidationErrors;
            this.settingsErrors.set(body422.errors ?? {});
            this.toast.warn('Revisa el formulario', body422.message);
          }
        },
      });
  }

  saveSequence(i: number): void {
    const seq = this.sequences()[i];
    const group = this.seqArray.at(i);
    if (!seq || !group) return;
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }
    const v = group.getRawValue() as { prefix: string; next_number: number; padding: number };
    this.savingSeq.update((s) => new Set(s).add(seq.doc_type));
    this.admin
      .updateSequence(seq.doc_type, { prefix: v.prefix ?? '', next_number: Number(v.next_number), padding: Number(v.padding) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingSeq.update((s) => {
            const n = new Set(s);
            n.delete(seq.doc_type);
            return n;
          });
          this.sequences.update((list) => list.map((s) => (s.doc_type === seq.doc_type ? { ...s, ...saved } : s)));
          group.controls['next_number'].setValidators([Validators.required, Validators.min(saved.next_number)]);
          group.patchValue({ prefix: saved.prefix, next_number: saved.next_number, padding: saved.padding });
          group.markAsPristine();
          this.toast.success('Consecutivo guardado.', `${saved.name}: próximo ${this.preview(saved.prefix, saved.next_number, saved.padding)}`);
        },
        error: (err: unknown) => {
          this.savingSeq.update((s) => {
            const n = new Set(s);
            n.delete(seq.doc_type);
            return n;
          });
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as ValidationErrors;
            const detail = Object.values(body.errors ?? {})[0]?.[0] ?? body.message;
            this.toast.warn(`No se pudo guardar ${seq.name}`, detail);
          }
        },
      });
  }

  resetSequence(i: number): void {
    const seq = this.sequences()[i];
    const group = this.seqArray.at(i);
    if (!seq || !group) return;
    group.reset({ prefix: seq.prefix, next_number: seq.next_number, padding: seq.padding });
  }
}
