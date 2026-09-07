<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    /** Recursos con las 4 acciones estándar. */
    private array $crud = [
        'sites', 'warehouses', 'units', 'product_categories', 'products', 'suppliers',
        'vehicles', 'drivers', 'cost_centers', 'recipients', 'users',
    ];

    /** Permisos sueltos. */
    private array $extra = [
        'roles.view', 'roles.update',
        'settings.view', 'settings.update',
        'activity_log.view',
        // Compras (fase 1)
        'purchase_requests.view', 'purchase_requests.create', 'purchase_requests.update', 'purchase_requests.delete', 'purchase_requests.approve',
        'quotations.view', 'quotations.create', 'quotations.update', 'quotations.delete',
        'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.delete', 'purchase_orders.approve', 'purchase_orders.issue',
        'approvals.view',
    ];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $all = [];
        foreach ($this->crud as $resource) {
            foreach (['view', 'create', 'update', 'delete'] as $action) {
                $all[] = "{$resource}.{$action}";
            }
        }
        $all = array_merge($all, $this->extra);

        foreach ($all as $name) {
            Permission::findOrCreate($name, 'web');
        }

        $views = array_map(fn ($r) => "{$r}.view", $this->crud);
        $catalogViews = array_filter($views, fn ($v) => $v !== 'users.view');

        $requestsBasic = ['purchase_requests.view', 'purchase_requests.create', 'purchase_requests.update', 'purchase_requests.delete'];
        $purchasingViews = ['purchase_requests.view', 'quotations.view', 'purchase_orders.view', 'approvals.view'];

        $matrix = [
            'admin' => $all,
            'solicitante' => array_merge(['products.view', 'product_categories.view', 'units.view', 'warehouses.view', 'sites.view'], $requestsBasic),
            'aprobador' => array_merge($catalogViews, $purchasingViews, ['purchase_requests.approve', 'purchase_orders.approve']),
            'comprador' => array_merge($catalogViews, $requestsBasic, [
                'suppliers.create', 'suppliers.update', 'suppliers.delete',
                'products.create', 'products.update',
                'product_categories.create', 'product_categories.update',
                'vehicles.create', 'vehicles.update', 'drivers.create', 'drivers.update',
                'quotations.view', 'quotations.create', 'quotations.update', 'quotations.delete',
                'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.delete', 'purchase_orders.issue',
                'approvals.view',
            ]),
            'tesoreria' => ['suppliers.view', 'purchase_orders.view'],
            'bodeguero' => array_merge($catalogViews, ['recipients.create', 'recipients.update'], $requestsBasic),
            'consulta' => array_merge($catalogViews, $purchasingViews),
        ];

        foreach (config('minerstock.roles') as $name => $label) {
            $role = Role::findOrCreate($name, 'web');
            $role->syncPermissions($matrix[$name] ?? []);
        }
    }
}
