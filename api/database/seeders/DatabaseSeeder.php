<?php

namespace Database\Seeders;

use App\Models\DocumentSequence;
use App\Models\Setting;
use App\Models\Unit;
use Illuminate\Database\Seeder;

/**
 * Datos base obligatorios para que el sistema funcione:
 * roles/permisos, unidades, consecutivos y configuración.
 * Los datos de ejemplo (sedes, productos, proveedores...) están en DemoSeeder.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RolePermissionSeeder::class);

        foreach (config('minerstock.document_types') as $type => $def) {
            DocumentSequence::query()->firstOrCreate(
                ['doc_type' => $type],
                ['name' => $def['name'], 'prefix' => $def['prefix'], 'next_number' => 1, 'padding' => 5]
            );
        }

        $units = [
            ['UND', 'Unidad', false], ['KG', 'Kilogramo', true], ['LT', 'Litro', true],
            ['M', 'Metro', true], ['GAL', 'Galón', true], ['CAJA', 'Caja', false],
            ['BULTO', 'Bulto', false], ['PAR', 'Par', false], ['JGO', 'Juego', false],
            ['ROLLO', 'Rollo', false], ['PAQ', 'Paquete', false],
        ];
        foreach ($units as [$code, $name, $dec]) {
            Unit::query()->firstOrCreate(['code' => $code], ['name' => $name, 'allows_decimals' => $dec]);
        }

        if (Setting::get('company') === null) {
            Setting::set('company', [
                'name' => 'Mi Empresa Minera S.A.S.',
                'document_number' => '',
                'address' => '',
                'phone' => '',
                'email' => '',
            ]);
        }
        if (Setting::get('default_tax_rate') === null) {
            Setting::set('default_tax_rate', 19);
        }

        $this->call(UserSeeder::class);

        if (app()->environment('local')) {
            $this->call(DemoSeeder::class);
        }
    }
}
