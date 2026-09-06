<?php

namespace Database\Seeders;

use App\Models\CostCenter;
use App\Models\Driver;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Recipient;
use App\Models\Site;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

/** Datos de ejemplo para desarrollo local. */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // Sedes y bodegas
        $mun = Site::query()->firstOrCreate(['name' => 'Municipio'], ['type' => 'municipio', 'address' => 'Casco urbano']);
        $minaN = Site::query()->firstOrCreate(['name' => 'Mina Norte'], ['type' => 'mina']);
        $minaS = Site::query()->firstOrCreate(['name' => 'Mina Sur'], ['type' => 'mina']);

        $bodMun = Warehouse::query()->firstOrCreate(['code' => 'BOD-MUN'], ['site_id' => $mun->id, 'name' => 'Bodega Municipio']);
        $bodMN = Warehouse::query()->firstOrCreate(['code' => 'BOD-MN'], ['site_id' => $minaN->id, 'name' => 'Bodega Mina Norte']);
        $bodMS = Warehouse::query()->firstOrCreate(['code' => 'BOD-MS'], ['site_id' => $minaS->id, 'name' => 'Bodega Mina Sur']);

        // Categorías
        $cats = [];
        foreach (['Construcción', 'Herramientas', 'Combustibles y lubricantes', 'Seguridad industrial', 'Ferretería', 'Alimentos'] as $name) {
            $cats[$name] = ProductCategory::query()->firstOrCreate(['name' => $name]);
        }

        $u = Unit::query()->pluck('id', 'code');

        // Productos con unidades alternas
        $products = [
            ['CEM-050', 'Cemento gris 50 kg', 'Construcción', 'BULTO', 'consumible', 50, [['KG', 0.02]]],
            ['PAL-CUA', 'Pala punta cuadrada', 'Herramientas', 'UND', 'retornable', 5, []],
            ['BRO-078', 'Broca 7/8 x 6 ft', 'Herramientas', 'UND', 'consumible', 10, [['CAJA', 6]]],
            ['GUA-CAR', 'Guantes de carnaza', 'Seguridad industrial', 'PAR', 'consumible', 24, [['CAJA', 12]]],
            ['ACPM', 'ACPM', 'Combustibles y lubricantes', 'GAL', 'consumible', 100, []],
            ['CAB-012', 'Cable acerado 1/2"', 'Ferretería', 'M', 'consumible', 50, [['ROLLO', 100]]],
            ['RAD-POR', 'Radio portátil', 'Herramientas', 'UND', 'retornable', 2, []],
            ['CAS-SEG', 'Casco de seguridad', 'Seguridad industrial', 'UND', 'consumible', 10, [['CAJA', 20]]],
            ['ARR-050', 'Arroz 50 kg', 'Alimentos', 'BULTO', 'consumible', 4, [['KG', 0.02]]],
            ['PUN-034', 'Puntilla 3/4"', 'Ferretería', 'KG', 'consumible', 20, [['CAJA', 25]]],
        ];
        foreach ($products as [$sku, $name, $cat, $base, $kind, $min, $alts]) {
            $p = Product::query()->firstOrCreate(['sku' => $sku], [
                'name' => $name,
                'category_id' => $cats[$cat]->id,
                'base_unit_id' => $u[$base],
                'kind' => $kind,
                'default_min_stock' => $min,
            ]);
            foreach ($alts as [$code, $factor]) {
                $p->units()->firstOrCreate(['unit_id' => $u[$code]], ['factor' => $factor, 'is_default_purchase' => true]);
            }
        }

        // Proveedores
        $suppliers = [
            ['900123456-1', 'Ferretería El Minero', 'Jorge Castaño', 'Segovia', 30],
            ['800987654-2', 'Distribuciones Andina S.A.S.', 'Marta Ríos', 'Medellín', 0],
            ['901555222-3', 'Cementos del Valle', 'Andrés Pérez', 'Medellín', 45],
            ['700111333-4', 'Combustibles Nordeste', 'Luis Mejía', 'Remedios', 15],
        ];
        foreach ($suppliers as [$nit, $name, $contact, $city, $days]) {
            Supplier::query()->firstOrCreate(['document_number' => $nit], [
                'name' => $name, 'contact_name' => $contact, 'city' => $city, 'payment_terms_days' => $days,
            ]);
        }

        // Vehículos y choferes
        Vehicle::query()->firstOrCreate(['plate' => 'WLK482'], ['type' => 'Camión', 'brand' => 'Chevrolet NPR', 'capacity_kg' => 4500, 'ownership' => 'propio']);
        Vehicle::query()->firstOrCreate(['plate' => 'TKM913'], ['type' => 'Camioneta', 'brand' => 'Toyota Hilux', 'capacity_kg' => 1000, 'ownership' => 'propio']);
        Vehicle::query()->firstOrCreate(['plate' => 'SRD207'], ['type' => 'Turbo', 'brand' => 'Hino', 'capacity_kg' => 3500, 'ownership' => 'tercero', 'owner_name' => 'Transportes Nordeste']);

        Driver::query()->firstOrCreate(['document_number' => '71234567'], ['name' => 'Jorge Ruiz', 'phone' => '3104567890', 'license_number' => 'C2-71234567', 'license_category' => 'C2', 'license_expires_at' => now()->addYear()]);
        Driver::query()->firstOrCreate(['document_number' => '98765432'], ['name' => 'Pedro Salazar', 'phone' => '3201234567', 'license_number' => 'C1-98765432', 'license_category' => 'C1', 'license_expires_at' => now()->addMonths(2)]);

        // Centros de costo y receptores
        $ccs = [];
        foreach ([['FR1', 'Frente 1', $minaN], ['FR2', 'Frente 2', $minaN], ['PLA', 'Planta', $minaN], ['MTO', 'Mantenimiento', $minaN], ['CAM', 'Campamento', $minaS]] as [$code, $name, $site]) {
            $ccs[$code] = CostCenter::query()->firstOrCreate(['code' => $code], ['name' => $name, 'site_id' => $site->id]);
        }
        foreach ([['persona', 'Pedro Salazar', '98765432', 'FR2', $minaN], ['persona', 'Ana Gómez', '43111222', 'PLA', $minaN], ['area', 'Mantenimiento', null, 'MTO', $minaN], ['area', 'Cocina campamento', null, 'CAM', $minaS]] as [$type, $name, $doc, $cc, $site]) {
            Recipient::query()->firstOrCreate(['name' => $name, 'type' => $type], ['document_number' => $doc, 'cost_center_id' => $ccs[$cc]->id, 'site_id' => $site->id]);
        }

        // Usuarios de prueba por rol
        $users = [
            ['comprador@minerstock.local', 'Carlos Mendoza', ['comprador'], [$bodMun->id], $bodMun->id],
            ['aprobador@minerstock.local', 'Luis Pérez', ['aprobador'], [], null],
            ['bodeguero@minerstock.local', 'Ana Gómez', ['bodeguero', 'solicitante'], [$bodMN->id], $bodMN->id],
            ['tesoreria@minerstock.local', 'Sandra Vélez', ['tesoreria'], [], null],
            ['consulta@minerstock.local', 'Gerencia', ['consulta'], [], null],
        ];
        foreach ($users as [$email, $name, $roles, $warehouses, $default]) {
            $user = User::query()->firstOrCreate(['email' => $email], ['name' => $name, 'username' => explode('@', $email)[0], 'password' => 'password', 'default_warehouse_id' => $default]);
            $user->syncRoles($roles);
            $user->warehouses()->sync($warehouses);
        }
    }
}
