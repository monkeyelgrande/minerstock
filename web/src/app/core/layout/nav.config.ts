/** Definición del menú lateral. `permission` filtra por permisos del usuario. */
export interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string | string[];
  soon?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: 'Dashboard', icon: 'dashboard', route: '/dashboard' }],
  },
  {
    title: 'Compras',
    items: [
      { label: 'Solicitudes', icon: 'assignment', route: '/compras/solicitudes', soon: true },
      { label: 'Aprobaciones', icon: 'verified', route: '/compras/aprobaciones', soon: true },
      { label: 'Cotizaciones', icon: 'request_quote', route: '/compras/cotizaciones', soon: true },
      { label: 'Comparativa', icon: 'compare_arrows', route: '/compras/comparativa', soon: true },
      { label: 'Órdenes de compra', icon: 'shopping_cart_checkout', route: '/compras/ordenes', soon: true },
    ],
  },
  {
    title: 'Inventario',
    items: [
      { label: 'Recepciones', icon: 'inventory', route: '/inventario/recepciones', soon: true },
      { label: 'Stock', icon: 'layers', route: '/inventario/stock', soon: true },
      { label: 'Kardex', icon: 'receipt_long', route: '/inventario/kardex', soon: true },
      { label: 'Devoluciones', icon: 'keyboard_return', route: '/inventario/devoluciones', soon: true },
      { label: 'Ajustes', icon: 'tune', route: '/inventario/ajustes', soon: true },
      { label: 'Conteos', icon: 'checklist', route: '/inventario/conteos', soon: true },
    ],
  },
  {
    title: 'Cuentas por pagar',
    items: [
      { label: 'Facturas', icon: 'description', route: '/pagos/facturas', soon: true },
      { label: 'Pagos', icon: 'payments', route: '/pagos/pagos', soon: true },
      { label: 'Notas crédito', icon: 'credit_card', route: '/pagos/notas-credito', soon: true },
      { label: 'Estado de cuenta', icon: 'account_balance_wallet', route: '/pagos/estado-cuenta', soon: true },
    ],
  },
  {
    title: 'Logística',
    items: [
      { label: 'Planillas', icon: 'local_shipping', route: '/logistica/planillas', soon: true },
      { label: 'Recepción en mina', icon: 'domain', route: '/logistica/recepcion', soon: true },
      { label: 'Novedades', icon: 'report_problem', route: '/logistica/novedades', soon: true },
      { label: 'En tránsito', icon: 'route', route: '/logistica/en-transito', soon: true },
    ],
  },
  {
    title: 'Bodega',
    items: [
      { label: 'Vales de salida', icon: 'exit_to_app', route: '/bodega/vales', soon: true },
      { label: 'Préstamos', icon: 'handshake', route: '/bodega/prestamos', soon: true },
      { label: 'Herramientas por persona', icon: 'build_circle', route: '/bodega/herramientas', soon: true },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { label: 'Productos', icon: 'inventory_2', route: '/catalogo/productos', permission: 'products.view' },
      { label: 'Categorías', icon: 'category', route: '/catalogo/categorias', permission: 'product_categories.view' },
      { label: 'Unidades', icon: 'straighten', route: '/catalogo/unidades', permission: 'units.view' },
      { label: 'Proveedores', icon: 'storefront', route: '/catalogo/proveedores', permission: 'suppliers.view' },
      { label: 'Sedes', icon: 'location_on', route: '/catalogo/sedes', permission: 'sites.view' },
      { label: 'Bodegas', icon: 'warehouse', route: '/catalogo/bodegas', permission: 'warehouses.view' },
      { label: 'Vehículos', icon: 'directions_car', route: '/catalogo/vehiculos', permission: 'vehicles.view' },
      { label: 'Choferes', icon: 'badge', route: '/catalogo/choferes', permission: 'drivers.view' },
      { label: 'Centros de costo', icon: 'account_tree', route: '/catalogo/centros-costo', permission: 'cost_centers.view' },
      { label: 'Receptores', icon: 'groups', route: '/catalogo/receptores', permission: 'recipients.view' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Usuarios', icon: 'manage_accounts', route: '/admin/usuarios', permission: 'users.view' },
      { label: 'Roles y permisos', icon: 'admin_panel_settings', route: '/admin/roles', permission: 'roles.view' },
      { label: 'Configuración', icon: 'settings', route: '/admin/configuracion', permission: 'settings.view' },
    ],
  },
];
