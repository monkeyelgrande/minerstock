<?php

namespace Tests\Feature;

use App\Models\Site;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CatalogPermissionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->create();
        $user->assignRole($role);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_role_without_permission_gets_403(): void
    {
        $this->actingAsRole('tesoreria');

        $this->getJson('/api/admin/users')->assertStatus(403)
            ->assertJsonPath('message', 'No tienes permiso para realizar esta acción.');
        $this->postJson('/api/catalog/suppliers', [])->assertStatus(403);
    }

    public function test_comprador_can_manage_suppliers_but_not_users(): void
    {
        $this->actingAsRole('comprador');

        $this->postJson('/api/catalog/suppliers', [
            'document_type' => 'NIT',
            'document_number' => '900111222-3',
            'name' => 'Proveedor Test',
            'payment_terms_days' => 30,
        ])->assertCreated()->assertJsonPath('data.name', 'Proveedor Test');

        $this->getJson('/api/admin/users')->assertStatus(403);
    }

    public function test_supplier_validation_is_in_spanish_and_unique(): void
    {
        $this->actingAsRole('admin');
        Supplier::query()->create(['document_number' => '1-1', 'name' => 'Existente']);

        $this->postJson('/api/catalog/suppliers', ['document_number' => '1-1'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'document_number'])
            ->assertJsonPath('errors.name.0', 'El campo nombre es obligatorio.');
    }

    public function test_list_supports_search_active_filter_and_pagination(): void
    {
        $this->actingAsRole('admin');
        Supplier::query()->create(['document_number' => '1', 'name' => 'Alfa Minera']);
        Supplier::query()->create(['document_number' => '2', 'name' => 'Beta Minera', 'is_active' => false]);
        Supplier::query()->create(['document_number' => '3', 'name' => 'Gamma Cementos']);

        $this->getJson('/api/catalog/suppliers?search=minera&active=1')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Alfa Minera');

        $this->getJson('/api/catalog/suppliers?active=&per_page=2')
            ->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 3);

        $res = $this->getJson('/api/catalog/suppliers?all=1&active=');
        $res->assertOk()->assertJsonCount(3, 'data');
        $this->assertArrayNotHasKey('meta', $res->json());
    }

    public function test_deleting_record_in_use_returns_409(): void
    {
        $this->actingAsRole('admin');
        $site = Site::query()->create(['name' => 'Mina X', 'type' => 'mina']);
        Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BX', 'name' => 'Bodega X']);

        $this->deleteJson("/api/catalog/sites/{$site->id}")->assertStatus(409);
        $this->assertDatabaseHas('sites', ['id' => $site->id]);
    }

    public function test_admin_cannot_delete_self(): void
    {
        $admin = $this->actingAsRole('admin');

        $this->deleteJson("/api/admin/users/{$admin->id}")->assertStatus(422);
    }

    public function test_user_can_be_created_with_roles_and_warehouses(): void
    {
        $this->actingAsRole('admin');
        $site = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $wh = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BM', 'name' => 'Bodega M']);

        $res = $this->postJson('/api/admin/users', [
            'name' => 'Nuevo',
            'email' => 'nuevo@test.local',
            'password' => 'secret123',
            'roles' => ['bodeguero', 'solicitante'],
            'warehouse_ids' => [$wh->id],
            'default_warehouse_id' => $wh->id,
        ]);

        $res->assertCreated()
            ->assertJsonPath('data.roles', ['bodeguero', 'solicitante'])
            ->assertJsonPath('data.warehouses.0.code', 'BM');
    }
}
