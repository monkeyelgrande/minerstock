import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Directive, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { TableLazyLoadEvent } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CrudResource } from '../core/api/crud-resource';
import { ListParams, ValidationErrors } from '../core/models/common.model';
import { ToastService } from '../core/services/toast.service';

/**
 * Lógica común de una página de maestro: listado paginado con búsqueda y filtro de
 * activos, drawer de crear/editar con formulario reactivo, errores 422 y eliminación.
 *
 * La clase hija define `api`, `entityName`, `buildForm()` y opcionalmente `toPayload()`,
 * `patchForm()` y `extraParams()`.
 */
@Directive()
export abstract class MasterPageBase<T extends { id: number; is_active?: boolean }> {
  protected readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmationService);
  protected readonly destroyRef = inject(DestroyRef);

  /** Recurso CRUD del maestro. */
  protected abstract readonly api: CrudResource<T>;
  /** Nombre singular con artículo para mensajes, ej. "el proveedor". */
  protected abstract readonly entityName: string;
  /** Género para mensajes: 'm' → "creado", 'f' → "creada". */
  protected readonly gender: 'm' | 'f' = 'm';

  // Listado
  readonly rows = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly active = signal<'' | '1' | '0'>('1');
  readonly perPage = signal(20);
  readonly page = signal(1);
  readonly sort = signal<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  // Drawer / formulario
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly editing = signal<T | null>(null);
  readonly serverErrors = signal<Record<string, string[]>>({});

  /**
   * Formulario del drawer. Se construye de forma perezosa en el primer acceso para que
   * las dependencias inyectadas de la clase hija (FormBuilder, APIs) ya estén inicializadas.
   */
  private _form?: FormGroup;
  get form(): FormGroup {
    return (this._form ??= this.buildForm());
  }

  private readonly search$ = new Subject<string>();
  private lastSearch = '';

  constructor() {
    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });

    // Recarga cuando cambian búsqueda/activo (con debounce para la búsqueda).
    effect(() => {
      const s = this.search();
      if (s === this.lastSearch) return;
      this.lastSearch = s;
      untracked(() => this.search$.next(s));
    });
    // El primer load lo dispara p-table (onLazyLoad); aquí solo reaccionamos a cambios.
    let firstRun = true;
    effect(() => {
      this.active();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => {
        this.page.set(1);
        this.load();
      });
    });
  }

  /** Construye el FormGroup vacío. */
  protected abstract buildForm(): FormGroup;

  /** Rellena el formulario con un registro existente (por defecto patchValue). */
  protected patchForm(row: T): void {
    this.form.reset();
    this.form.patchValue(row as unknown as Record<string, unknown>);
  }

  /** Convierte el formulario en payload para la API (por defecto getRawValue). */
  protected toPayload(): Record<string, unknown> {
    return this.form.getRawValue() as Record<string, unknown>;
  }

  /** Filtros adicionales del listado. */
  protected extraParams(): ListParams {
    return {};
  }

  /** Valores por defecto al crear. */
  protected defaults(): Partial<T> | Record<string, unknown> {
    return { is_active: true };
  }

  load(): void {
    this.loading.set(true);
    const sort = this.sort();
    this.api
      .list({
        search: this.search() || undefined,
        active: this.active(),
        page: this.page(),
        per_page: this.perPage(),
        sort: sort?.field,
        dir: sort?.dir,
        ...this.extraParams(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  /** Handler de p-table [lazy]. */
  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.perPage();
    this.perPage.set(rows);
    this.page.set(Math.floor(first / rows) + 1);
    if (event.sortField && typeof event.sortField === 'string') {
      this.sort.set({ field: event.sortField, dir: event.sortOrder === -1 ? 'desc' : 'asc' });
    }
    this.load();
  }

  get first(): number {
    return (this.page() - 1) * this.perPage();
  }

  openCreate(): void {
    this.editing.set(null);
    this.serverErrors.set({});
    this.submitted.set(false);
    this.form.reset(this.defaults());
    this.drawerOpen.set(true);
  }

  openEdit(row: T): void {
    this.editing.set(row);
    this.serverErrors.set({});
    this.submitted.set(false);
    this.patchForm(row);
    this.drawerOpen.set(true);
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    const editing = this.editing();
    const payload = this.toPayload();
    const req = editing ? this.api.update(editing.id, payload) : this.api.create(payload);
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        const verb = editing ? 'actualizad' : 'cread';
        this.toast.success(`${this.cap(this.entityName)} ${verb}${this.gender === 'f' ? 'a' : 'o'}.`);
        this.afterSaved(saved, !editing);
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse && err.status === 422) {
          const body = err.error as ValidationErrors;
          this.serverErrors.set(body.errors ?? {});
          this.toast.warn('Revisa el formulario', body.message);
        }
      },
    });
  }

  /** Hook tras guardar con éxito. */
  protected afterSaved(_saved: T, _created: boolean): void {}

  confirmDelete(row: T, label?: string): void {
    this.confirm.confirm({
      header: 'Eliminar registro',
      message: `¿Eliminar ${this.entityName} "${label ?? this.rowLabel(row)}"? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.api
          .delete(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success(`${this.cap(this.entityName)} eliminad${this.gender === 'f' ? 'a' : 'o'}.`);
              this.load();
            },
            // 409 (en uso) y otros ya los muestra el interceptor.
            error: () => void 0,
          });
      },
    });
  }

  /** Activa/desactiva rápidamente un registro. */
  toggleActive(row: T): void {
    const next = !row.is_active;
    this.api
      .update(row.id, { is_active: next } as unknown as Partial<T>)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(next ? 'Registro activado.' : 'Registro desactivado.');
        this.load();
      });
  }

  /** Texto identificador de la fila para mensajes. */
  protected rowLabel(row: T): string {
    const r = row as unknown as Record<string, unknown>;
    return String(r['name'] ?? r['code'] ?? r['plate'] ?? r['id']);
  }

  /** Primer error del servidor para un campo. */
  err(field: string): string | undefined {
    return this.serverErrors()[field]?.[0];
  }

  /** "el proveedor" → "Proveedor" (para mensajes cortos). */
  private cap(s: string): string {
    const bare = s.replace(/^(el|la|los|las)\s+/i, '');
    return bare.charAt(0).toUpperCase() + bare.slice(1);
  }
}
