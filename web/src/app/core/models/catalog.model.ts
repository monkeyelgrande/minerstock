import { BaseEntity } from './common.model';

export type SiteType = 'municipio' | 'mina';

export interface Site extends BaseEntity {
  name: string;
  type: SiteType;
  address: string | null;
  warehouses_count?: number;
}

export interface Warehouse extends BaseEntity {
  site_id: number;
  site?: { id: number; name: string; type: SiteType };
  code: string;
  name: string;
}

export interface Unit extends BaseEntity {
  code: string;
  name: string;
  allows_decimals: boolean;
}

export interface ProductCategory extends BaseEntity {
  name: string;
  parent_id: number | null;
  parent?: { id: number; name: string } | null;
  products_count?: number;
}

export type ProductKind = 'consumible' | 'retornable';

export interface ProductUnit {
  id?: number;
  unit_id: number;
  unit?: { id: number; code: string; name: string } | null;
  factor: number;
  is_default_purchase: boolean;
}

export interface WarehouseProductSetting {
  id?: number;
  warehouse_id: number;
  warehouse?: { id: number; code: string; name: string } | null;
  min_stock: number;
  max_stock: number | null;
}

export interface Product extends BaseEntity {
  sku: string;
  name: string;
  description: string | null;
  category_id: number | null;
  category?: { id: number; name: string } | null;
  base_unit_id: number;
  base_unit?: { id: number; code: string; name: string; allows_decimals: boolean };
  kind: ProductKind;
  default_min_stock: number;
  barcode: string | null;
  image_path: string | null;
  units?: ProductUnit[];
  warehouse_settings?: WarehouseProductSetting[];
}

export interface Supplier extends BaseEntity {
  document_type: string;
  document_number: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  payment_terms_days: number;
  notes: string | null;
}

export type VehicleOwnership = 'propio' | 'tercero';

export interface Vehicle extends BaseEntity {
  plate: string;
  type: string;
  brand: string | null;
  capacity_kg: number | null;
  ownership: VehicleOwnership;
  owner_name: string | null;
}

export interface Driver extends BaseEntity {
  document_number: string;
  name: string;
  phone: string | null;
  license_number: string | null;
  license_category: string | null;
  license_expires_at: string | null;
}

export interface CostCenter extends BaseEntity {
  code: string;
  name: string;
  site_id: number | null;
  site?: { id: number; name: string } | null;
}

export type RecipientType = 'persona' | 'area';

export interface Recipient extends BaseEntity {
  type: RecipientType;
  name: string;
  document_number: string | null;
  phone: string | null;
  cost_center_id: number | null;
  cost_center?: { id: number; code: string; name: string } | null;
  site_id: number | null;
  site?: { id: number; name: string } | null;
}
