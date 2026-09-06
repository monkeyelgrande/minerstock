import { Routes } from '@angular/router';

/** Rutas del módulo Catálogo. `data.permission` lo verifica permissionGuard (canActivateChild). */
export const CATALOG_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'productos' },
  {
    path: 'productos',
    data: { permission: 'products.view' },
    loadComponent: () => import('./products/products-page.component').then((m) => m.ProductsPageComponent),
  },
  {
    path: 'productos/nuevo',
    data: { permission: 'products.create' },
    loadComponent: () => import('./products/product-form.component').then((m) => m.ProductFormComponent),
  },
  {
    path: 'productos/:id',
    data: { permission: 'products.view' },
    loadComponent: () => import('./products/product-form.component').then((m) => m.ProductFormComponent),
  },
  {
    path: 'categorias',
    data: { permission: 'product_categories.view' },
    loadComponent: () => import('./product-categories/product-categories-page.component').then((m) => m.ProductCategoriesPageComponent),
  },
  {
    path: 'unidades',
    data: { permission: 'units.view' },
    loadComponent: () => import('./units/units-page.component').then((m) => m.UnitsPageComponent),
  },
  {
    path: 'proveedores',
    data: { permission: 'suppliers.view' },
    loadComponent: () => import('./suppliers/suppliers-page.component').then((m) => m.SuppliersPageComponent),
  },
  {
    path: 'sedes',
    data: { permission: 'sites.view' },
    loadComponent: () => import('./sites/sites-page.component').then((m) => m.SitesPageComponent),
  },
  {
    path: 'bodegas',
    data: { permission: 'warehouses.view' },
    loadComponent: () => import('./warehouses/warehouses-page.component').then((m) => m.WarehousesPageComponent),
  },
  {
    path: 'vehiculos',
    data: { permission: 'vehicles.view' },
    loadComponent: () => import('./vehicles/vehicles-page.component').then((m) => m.VehiclesPageComponent),
  },
  {
    path: 'choferes',
    data: { permission: 'drivers.view' },
    loadComponent: () => import('./drivers/drivers-page.component').then((m) => m.DriversPageComponent),
  },
  {
    path: 'centros-costo',
    data: { permission: 'cost_centers.view' },
    loadComponent: () => import('./cost-centers/cost-centers-page.component').then((m) => m.CostCentersPageComponent),
  },
  {
    path: 'receptores',
    data: { permission: 'recipients.view' },
    loadComponent: () => import('./recipients/recipients-page.component').then((m) => m.RecipientsPageComponent),
  },
];
