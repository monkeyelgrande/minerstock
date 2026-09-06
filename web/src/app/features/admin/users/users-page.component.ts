import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { AdminApi } from '../../../core/api/admin-api.service';
import { CatalogApi } from '../../../core/api/catalog-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_LABELS, RoleName, User } from '../../../core/models/auth.model';
import { Warehouse } from '../../../core/models/catalog.model';
import { ListParams, ValidationErrors } from '../../../core/models/common.model';
import { CrudToolbarComponent } from '../../../shared/components/crud-toolbar.component';
import { FieldComponent } from '../../../shared/components/field.component';
import { FormDrawerComponent } from '../../../shared/components/form-drawer.component';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';
import { ActiveChipComponent } from '../../../shared/components/status-chip.component';
import { MasterPageBase } from '../../../shared/master-page.base';

@Component({
  selector: 'app-users-page',
  imports: [
    DatePipe, FormsModule, ReactiveFormsModule, TableModule, ButtonModule, DialogModule, InputTextModule,
    MultiSelectModule, PasswordModule, SelectModule, ToggleSwitchModule, TooltipModule,
    PageHeaderComponent, CrudToolbarComponent, FormDrawerComponent, FieldComponent, ActiveChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-page.component.html',
})
export class UsersPageComponent extends MasterPageBase<User> {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminApi);
  private readonly catalog = inject(CatalogApi);
  readonly auth = inject(AuthService);
  protected readonly api = this.admin.users;
  protected readonly entityName = 'el usuario';

  readonly roleOptions = (Object.entries(ROLE_LABELS) as [RoleName, string][]).map(([value, label]) => ({ value, label }));
  readonly roleFilter = signal<RoleName | null>(null);
  readonly warehouses = signal<Warehouse[]>([]);

  /**
   * Contraseña obligatoria solo al crear. Se define como validador condicional desde el inicio
   * (en vez de agregarlo al abrir el drawer) para que el control ya tenga estado de error cuando
   * app-field evalúa por primera vez sus errores.
   */
  private readonly passwordRequired: ValidatorFn = (c) => (this.editing() ? null : Validators.required(c));

  /** Bodegas seleccionadas en el formulario → opciones para "Bodega por defecto". */
  private readonly warehouseIds = toSignal(this.form.controls['warehouse_ids'].valueChanges, {
    initialValue: [] as number[],
  });
  /** Si no hay bodegas asignadas (admin/consulta ven todas), se puede elegir cualquiera. */
  readonly defaultWarehouseOptions = computed(() => {
    const ids: number[] = this.warehouseIds() ?? [];
    const all = this.warehouses();
    return ids.length ? all.filter((w) => ids.includes(w.id)) : all;
  });

  // Diálogo de restablecer contraseña
  readonly pwDialogOpen = signal(false);
  readonly pwUser = signal<User | null>(null);
  readonly pwSaving = signal(false);
  readonly pwSubmitted = signal(false);
  readonly pwErrors = signal<Record<string, string[]>>({});
  readonly pwForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', Validators.required],
  });

  constructor() {
    super();
    this.catalog.warehouses.all().subscribe((list) => this.warehouses.set(list));

    // Si se quita una bodega de las asignadas y era la de por defecto, se limpia.
    this.form.controls['warehouse_ids'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((ids: number[] | null) => {
      const ctrl = this.form.controls['default_warehouse_id'];
      if (ids?.length && ctrl.value !== null && !ids.includes(ctrl.value)) ctrl.setValue(null);
    });
  }

  protected buildForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      username: ['', [Validators.maxLength(40), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
      phone: [''],
      password: ['', [this.passwordRequired, Validators.minLength(8)]],
      roles: [[] as RoleName[], [Validators.required, Validators.minLength(1)]],
      warehouse_ids: [[] as number[]],
      default_warehouse_id: [null as number | null],
      is_active: [true],
    });
  }

  protected override defaults() {
    return { roles: [], warehouse_ids: [], default_warehouse_id: null, is_active: true, password: '' };
  }

  protected override extraParams(): ListParams {
    return { role: this.roleFilter() ?? undefined };
  }

  protected override patchForm(row: User): void {
    this.form.reset();
    this.form.patchValue({
      name: row.name,
      username: row.username ?? '',
      email: row.email,
      phone: row.phone ?? '',
      password: '',
      roles: [...row.roles],
      warehouse_ids: row.warehouses.map((w) => w.id),
      default_warehouse_id: row.default_warehouse_id,
      is_active: row.is_active,
    });
  }

  protected override toPayload(): Record<string, unknown> {
    const v = this.form.getRawValue() as {
      name: string; username: string; email: string; phone: string; password: string; roles: RoleName[];
      warehouse_ids: number[]; default_warehouse_id: number | null; is_active: boolean;
    };
    const payload: Record<string, unknown> = {
      name: v.name,
      username: v.username?.trim() || null,
      email: v.email,
      phone: v.phone || null,
      is_active: v.is_active,
      roles: v.roles ?? [],
      warehouse_ids: v.warehouse_ids ?? [],
      default_warehouse_id: v.default_warehouse_id,
    };
    if (v.password) payload['password'] = v.password;
    return payload;
  }

  setRoleFilter(role: RoleName | null): void {
    this.roleFilter.set(role);
    this.page.set(1);
    this.load();
  }

  isSelf(row: User): boolean {
    return row.id === this.auth.user()?.id;
  }

  roleLabel(r: string): string {
    return (ROLE_LABELS as Record<string, string>)[r] ?? r;
  }

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  // ---------- Restablecer contraseña ----------

  openResetPassword(row: User): void {
    this.pwUser.set(row);
    this.pwErrors.set({});
    this.pwSubmitted.set(false);
    this.pwForm.reset({ password: '', password_confirmation: '' });
    this.pwDialogOpen.set(true);
  }

  pwMismatch(): boolean {
    const v = this.pwForm.getRawValue();
    return !!v.password_confirmation && v.password !== v.password_confirmation;
  }

  resetPassword(): void {
    this.pwSubmitted.set(true);
    const user = this.pwUser();
    if (!user || this.pwForm.invalid || this.pwMismatch()) {
      this.pwForm.markAllAsTouched();
      return;
    }
    this.pwSaving.set(true);
    this.pwErrors.set({});
    this.admin
      .resetPassword(user.id, this.pwForm.getRawValue().password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pwSaving.set(false);
          this.pwDialogOpen.set(false);
          this.toast.success('Contraseña restablecida.', `Se actualizó la contraseña de ${user.name}.`);
        },
        error: (err: unknown) => {
          this.pwSaving.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as ValidationErrors;
            this.pwErrors.set(body.errors ?? {});
            this.toast.warn('Revisa la contraseña', body.message);
          }
        },
      });
  }
}
