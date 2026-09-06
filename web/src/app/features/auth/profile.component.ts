import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';

import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS, User } from '../../core/models/auth.model';
import { Single, ValidationErrors } from '../../core/models/common.model';
import { ToastService } from '../../core/services/toast.service';
import { WarehouseContext } from '../../core/services/warehouse-context.service';
import { FieldComponent } from '../../shared/components/field.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule, SelectModule, FieldComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Mi perfil" subtitle="Datos personales y contraseña" [crumbs]="[{ label: 'Mi perfil' }]" />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form class="card" [formGroup]="profile" (ngSubmit)="saveProfile()" novalidate>
        <div class="card-header"><span class="card-title">Datos personales</span></div>
        <div class="card-body space-y-4">
          <app-field label="Nombre" [required]="true" [control]="profile.controls.name" [serverError]="pErr()['name']" [submitted]="true">
            <input pInputText formControlName="name" class="w-full" />
          </app-field>
          <app-field label="Correo electrónico">
            <input pInputText [value]="auth.user()?.email" class="w-full" disabled />
          </app-field>
          <app-field label="Teléfono" [serverError]="pErr()['phone']">
            <input pInputText formControlName="phone" class="w-full" />
          </app-field>
          <app-field label="Bodega por defecto" hint="Se abre al iniciar sesión.">
            <p-select formControlName="default_warehouse_id" [options]="ctx.options()" optionLabel="name" optionValue="id" placeholder="Sin bodega" [showClear]="true" class="w-full" styleClass="w-full" />
          </app-field>
          <app-field label="Roles">
            <div class="flex flex-wrap gap-1.5">
              @for (r of auth.user()?.roles ?? []; track r) {
                <span class="chip chip-info">{{ roleLabel(r) }}</span>
              }
            </div>
          </app-field>
        </div>
        <div class="px-5 py-3 border-t border-line flex justify-end">
          <p-button label="Guardar" type="submit" [loading]="savingProfile()" />
        </div>
      </form>

      <form class="card" [formGroup]="password" (ngSubmit)="savePassword()" novalidate>
        <div class="card-header"><span class="card-title">Cambiar contraseña</span></div>
        <div class="card-body space-y-4">
          <app-field label="Contraseña actual" [required]="true" [control]="password.controls.current_password" [serverError]="wErr()['current_password']" [submitted]="pwSubmitted()">
            <p-password formControlName="current_password" [feedback]="false" [toggleMask]="true" styleClass="w-full" inputStyleClass="w-full" />
          </app-field>
          <app-field label="Nueva contraseña" [required]="true" hint="Mínimo 8 caracteres." [control]="password.controls.password" [serverError]="wErr()['password']" [submitted]="pwSubmitted()">
            <p-password formControlName="password" [toggleMask]="true" styleClass="w-full" inputStyleClass="w-full" promptLabel="Ingresa una contraseña" weakLabel="Débil" mediumLabel="Media" strongLabel="Fuerte" />
          </app-field>
          <app-field label="Confirmar nueva contraseña" [required]="true" [control]="password.controls.password_confirmation" [submitted]="pwSubmitted()">
            <p-password formControlName="password_confirmation" [feedback]="false" [toggleMask]="true" styleClass="w-full" inputStyleClass="w-full" />
          </app-field>
        </div>
        <div class="px-5 py-3 border-t border-line flex justify-end">
          <p-button label="Cambiar contraseña" type="submit" severity="secondary" [loading]="savingPassword()" />
        </div>
      </form>
    </div>
  `,
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  readonly ctx = inject(WarehouseContext);

  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  readonly pwSubmitted = signal(false);
  readonly pErr = signal<Record<string, string[]>>({});
  readonly wErr = signal<Record<string, string[]>>({});

  readonly profile = this.fb.group({
    name: [this.auth.user()?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    phone: [this.auth.user()?.phone ?? ''],
    default_warehouse_id: [this.auth.user()?.default_warehouse_id ?? null],
  });

  readonly password = this.fb.nonNullable.group({
    current_password: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', Validators.required],
  });

  roleLabel(r: string): string {
    return (ROLE_LABELS as Record<string, string>)[r] ?? r;
  }

  saveProfile(): void {
    if (this.profile.invalid) return;
    this.savingProfile.set(true);
    this.pErr.set({});
    this.api.put<Single<User>>('auth/profile', this.profile.getRawValue()).subscribe({
      next: (r) => {
        this.auth.setUser(r.data);
        this.savingProfile.set(false);
        this.toast.success('Perfil actualizado.');
      },
      error: (err: unknown) => {
        this.savingProfile.set(false);
        if (err instanceof HttpErrorResponse && err.status === 422) this.pErr.set((err.error as ValidationErrors).errors);
      },
    });
  }

  savePassword(): void {
    this.pwSubmitted.set(true);
    const v = this.password.getRawValue();
    if (this.password.invalid) return;
    if (v.password !== v.password_confirmation) {
      this.wErr.set({ password: ['Las contraseñas no coinciden.'] });
      return;
    }
    this.savingPassword.set(true);
    this.wErr.set({});
    this.api.put('auth/password', v).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.password.reset();
        this.pwSubmitted.set(false);
        this.toast.success('Contraseña actualizada.');
      },
      error: (err: unknown) => {
        this.savingPassword.set(false);
        if (err instanceof HttpErrorResponse && err.status === 422) this.wErr.set((err.error as ValidationErrors).errors);
      },
    });
  }
}
