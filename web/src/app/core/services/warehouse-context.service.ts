import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { CatalogApi } from '../api/catalog-api.service';
import { Warehouse } from '../models/catalog.model';

const KEY = 'minerstock.activeWarehouse';

/**
 * Bodega activa del usuario (selector de la topbar).
 * Para admin/consulta lista todas las bodegas; para el resto, las asignadas.
 */
@Injectable({ providedIn: 'root' })
export class WarehouseContext {
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogApi);

  private readonly _options = signal<Pick<Warehouse, 'id' | 'code' | 'name' | 'site_id'>[]>([]);
  private readonly _activeId = signal<number | null>(this.readStored());

  readonly options = this._options.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly active = computed(() => this._options().find((w) => w.id === this._activeId()) ?? null);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this._options.set([]);
        return;
      }
      if (user.sees_all_warehouses) {
        this.catalog.warehouses.all().subscribe((list) => this.setOptions(list, user.default_warehouse_id));
      } else {
        this.setOptions(user.warehouses, user.default_warehouse_id);
      }
    });
  }

  select(id: number): void {
    this._activeId.set(id);
    try {
      localStorage.setItem(KEY, String(id));
    } catch {
      /* noop */
    }
  }

  private setOptions(list: Pick<Warehouse, 'id' | 'code' | 'name' | 'site_id'>[], defaultId: number | null): void {
    this._options.set(list);
    const current = this._activeId();
    const valid = current !== null && list.some((w) => w.id === current);
    if (!valid) {
      const fallback = list.find((w) => w.id === defaultId) ?? list[0] ?? null;
      if (fallback) this.select(fallback.id);
      else this._activeId.set(null);
    }
  }

  private readStored(): number | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  }
}
