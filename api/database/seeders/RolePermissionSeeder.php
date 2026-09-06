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

        $matrix = [
            'admin' => $all,
            'solicitante' => ['products.view', 'product_categories.view', 'units.view', 'warehouses.view', 'sites.view'],
            'aprobador' => $catalogViews,
            'comprador' => array_merge($catalogViews, [
                'suppliers.create', 'suppliers.update', 'suppliers.delete',
                'products.create', 'products.update',
                'product_categories.create', 'product_categories.update',
                'vehicles.create', 'vehicles.update', 'drivers.create', 'drivers.update',
            ]),
            'tesoreria' => ['suppliers.view'],
            'bodeguero' => array_merge($catalogViews, ['recipients.create', 'recipients.update']),
            'consulta' => $catalogViews,
        ];

        foreach (config('minerstock.roles') as $name => $label) {
            $role = Role::findOrCreate($name, 'web');
            $role->syncPermissions($matrix[$name] ?? []);
        }
    }
}
