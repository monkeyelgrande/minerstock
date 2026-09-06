import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin } from 'rxjs';

import { AdminApi } from '../../../core/api/admin-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models/auth.model';
import { ValidationErrors } from '../../../core/models/common.model';
import { ToastService } from '../../../core/services/toast.service';
import { PageHeaderComponent } from '../../../shared/components/page-header.component';

const RESOURCE_LABELS: Record<string, string> = {
  sites: 'Sedes',
  warehouses: 'Bodegas',
  units: 'Unidades',
  product_categories: 'Categorías',
  products: 'Productos',
  suppliers: 'Proveedores',
  vehicles: 'Vehículos',
  drivers: 'Choferes',
  cost_centers: 'Centros de costo',
  recipients: 'Receptores',
  users: 'Usuarios',
  roles: 'Roles',
  settings: 'Configuración',
  activity_log: 'Log de actividad',
};

/** Orden de presentación de los recursos (los no listados van al final, alfabéticamente). */
const RESOURCE_ORDER = Object.keys(RESOURCE_LABELS);

const ACTIONS = [
  { key: 'view', label: 'Ver' },
  { key: 'create', label: 'Crear' },
  { key: 'update', label: 'Editar' },
  { key: 'delete', label: 'Eliminar' },
] as const;

interface ResourceRow {
  key: string;
  label: string;
  /** Permiso por acción (undefined si el recurso no tiene esa acción). */
  perms: Record<string, string | undefined>;
  all: string[];
}

/** Matriz de permisos por rol. */
@Component({
  selector: 'app-roles-page',
  imports: [FormsModule, ButtonModule, CheckboxModule, TooltipModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roles-page.component.html',
})
export class RolesPageComponent {
  private readonly admin = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly actions = ACTIONS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly roles = signal<Role[]>([]);
  readonly permissionMap = signal<Record<string, string[]>>({});
  readonly selectedId = signal<number | null>(null);
  /** Permisos en edición del rol seleccionado. */
  readonly draft = signal<Set<string>>(new Set());

  readonly selected = computed(() => this.roles().find((r) => r.id === this.selectedId()) ?? null);
  readonly isAdmin = computed(() => this.selected()?.name === 'admin');
  readonly canEdit = computed(() => this.auth.can('roles.update') && !this.isAdmin());

  readonly resources = computed<ResourceRow[]>(() => {
    const map = this.permissionMap();
    const keys = Object.keys(map).sort((a, b) => {
      const ia = RESOURCE_ORDER.indexOf(a);
      const ib = RESOURCE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys.map((key) => {
      const all = map[key];
      const perms: Record<string, string | undefined> = {};
      for (const a of ACTIONS) {
        const p = `${key}.${a.key}`;
        perms[a.key] = all.includes(p) ? p : undefined;
      }
      return { key, label: RESOURCE_LABELS[key] ?? key, perms, all };
    });
  });

  readonly dirty = computed(() => {
    const role = this.selected();
    if (!role) return false;
    const draft = this.draft();
    if (draft.size !== role.permissions.length) return true;
    return role.permissions.some((p) => !draft.has(p));
  });

  readonly draftCount = computed(() => this.draft().size);
  readonly totalCount = computed(() => Object.values(this.permissionMap()).reduce((n, l) => n + l.length, 0));

  constructor() {
    forkJoin({ roles: this.admin.roles(), perms: this.admin.permissions() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ roles, perms }) => {
          this.roles.set(roles);
          this.permissionMap.set(perms);
          this.loading.set(false);
          if (roles.length) this.select(roles[0]);
        },
        error: () => this.loading.set(false),
      });
  }

  select(role: Role): void {
    if (this.selectedId() === role.id) return;
    this.selectedId.set(role.id);
    this.draft.set(new Set(role.permissions));
  }

  has(perm: string): boolean {
    return this.isAdmin() || this.draft().has(perm);
  }

  toggle(perm: string, checked: boolean): void {
    if (!this.canEdit()) return;
    const next = new Set(this.draft());
    if (checked) next.add(perm);
    else next.delete(perm);
    this.draft.set(next);
  }

  rowAll(row: ResourceRow): boolean {
    return this.isAdmin() || row.all.every((p) => this.draft().has(p));
  }

  rowSome(row: ResourceRow): boolean {
    return !this.rowAll(row) && row.all.some((p) => this.draft().has(p));
  }

  toggleRow(row: ResourceRow, checked: boolean): void {
    if (!this.canEdit()) return;
    const next = new Set(this.draft());
    for (const p of row.all) {
      if (checked) next.add(p);
      else next.delete(p);
    }
    this.draft.set(next);
  }

  discard(): void {
    const role = this.selected();
    if (role) this.draft.set(new Set(role.permissions));
  }

  save(): void {
    const role = this.selected();
    if (!role || !this.dirty() || !this.canEdit()) return;
    this.saving.set(true);
    const permissions = [...this.draft()];
    this.admin
      .updateRole(role.id, permissions)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.roles.update((list) => list.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
          this.toast.success('Permisos guardados.', `Se actualizaron los permisos de ${role.label}.`);
          if (this.auth.user()?.roles.includes(role.name)) {
            this.auth.refreshUser().subscribe({ error: () => void 0 });
          }
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse && err.status === 422) {
            const body = err.error as ValidationErrors;
            const detail = Object.values(body.errors ?? {})[0]?.[0] ?? body.message;
            this.toast.warn('No se pudo guardar', detail);
          }
        },
      });
  }
}
