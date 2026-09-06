import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ValidationErrors } from '../../core/models/common.model';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly year = new Date().getFullYear();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    login: ['', [Validators.required]],
    password: ['', [Validators.required]],
    remember: [true],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { login, password } = this.form.getRawValue();
    this.auth.login(login, password).subscribe({
      next: () => {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        void this.router.navigateByUrl(redirect && redirect !== '/login' ? redirect : '/dashboard');
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 422) {
          const body = err.error as ValidationErrors;
          this.error.set(body.errors?.['login']?.[0] ?? body.message);
        } else if (err instanceof HttpErrorResponse && err.status === 429) {
          this.error.set('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
        } else {
          this.error.set('No se pudo iniciar sesión. Intenta de nuevo.');
        }
      },
    });
  }
}
