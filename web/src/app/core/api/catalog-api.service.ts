import { Injectable, inject } from '@angular/core';

import { ApiService } from './api.service';
import {
  CostCenter,
  Driver,
  Product,
  ProductCategory,
  Recipient,
  Site,
  Supplier,
  Unit,
  Vehicle,
  Warehouse,
} from '../models/catalog.model';

/** Recursos CRUD del módulo Catálogo. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly api = inject(ApiService);

  readonly sites = this.api.resource<Site>('catalog/sites');
  readonly warehouses = this.api.resource<Warehouse>('catalog/warehouses');
  readonly units = this.api.resource<Unit>('catalog/units');
  readonly productCategories = this.api.resource<ProductCategory>('catalog/product-categories');
  readonly products = this.api.resource<Product>('catalog/products');
  readonly suppliers = this.api.resource<Supplier>('catalog/suppliers');
  readonly vehicles = this.api.resource<Vehicle>('catalog/vehicles');
  readonly drivers = this.api.resource<Driver>('catalog/drivers');
  readonly costCenters = this.api.resource<CostCenter>('catalog/cost-centers');
  readonly recipients = this.api.resource<Recipient>('catalog/recipients');
}
