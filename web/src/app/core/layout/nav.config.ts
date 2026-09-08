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
      { label: 'Solicitudes', icon: 'assignment', route: '/compras/solicitudes', permission: 'purchase_requests.view' },
      { label: 'Aprobaciones', icon: 'verified', route: '/compras/aprobaciones', permission: 'approvals.view' },
      { label: 'Cotizaciones', icon: 'request_quote', route: '/compras/cotizaciones', permission: 'quotations.view' },
      { label: 'Comparativa', icon: 'compare_arrows', route: '/compras/comparativa', permission: 'quotations.view' },
      { label: 'Órdenes de compra', icon: 'shopping_cart_checkout', route: '/compras/ordenes', permission: 'purchase_orders.view' },
    ],
  },
  {
    title: 'Inventario',
    items: [
      { label: 'Stock', icon: 'layers', route: '/inventario/stock', permission: 'stock.view' },
      { label: 'Kardex', icon: 'receipt_long', route: '/inventario/kardex', permission: 'stock.view' },
      { label: 'Recepciones', icon: 'inventory', route: '/inventario/recepciones', permission: 'goods_receipts.view' },
      { label: 'Devoluciones', icon: 'keyboard_return', route: '/inventario/devoluciones', permission: 'supplier_returns.view' },
      { label: 'Ajustes', icon: 'tune', route: '/inventario/ajustes', permission: 'adjustments.view' },
      { label: 'Conteos', icon: 'checklist', route: '/inventario/conteos', permission: 'stock_counts.view' },
    ],
  },
  {
    title: 'Cuentas por pagar',
    items: [
      { label: 'Facturas', icon: 'description', route: '/pagos/facturas', permission: 'supplier_invoices.view' },
      { label: 'Pagos', icon: 'payments', route: '/pagos/pagos', permission: 'supplier_payments.view' },
      { label: 'Notas crédito', icon: 'credit_card', route: '/pagos/notas-credito', permission: 'supplier_credit_notes.view' },
      { label: 'Estado de cuenta', icon: 'account_balance_wallet', route: '/pagos/estado-cuenta', permission: 'supplier_invoices.view' },
    ],
  },
  {
    title: 'Logística',
    items: [
      { label: 'Planillas', icon: 'local_shipping', route: '/logistica/planillas', permission: 'shipments.view' },
      { label: 'Recepción en mina', icon: 'domain', route: '/logistica/recepcion', permission: 'shipment_receipts.view' },
      { label: 'Novedades', icon: 'report_problem', route: '/logistica/novedades', permission: 'novelties.view' },
      { label: 'En tránsito', icon: 'route', route: '/logistica/en-transito', permission: 'shipments.view' },
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
