<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Site;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $aprobador;

    private User $bodeguero;

    private Warehouse $municipio;

    private Warehouse $mina;

    private Product $cemento;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();

        $siteM = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $siteMina = Site::query()->create(['name' => 'Mina', 'type' => 'mina']);
        $this->municipio = Warehouse::query()->create(['site_id' => $siteM->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);
        $this->mina = Warehouse::query()->create(['site_id' => $siteMina->id, 'code' => 'MN', 'name' => 'Bodega Mina']);

        $this->aprobador = User::query()->create(['name' => 'Aprobador', 'username' => 'apro', 'email' => 'apro@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $this->aprobador->syncRoles(['aprobador']);
        $this->bodeguero = User::query()->create(['name' => 'Bodeguero Mina', 'username' => 'bode', 'email' => 'bode@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $this->bodeguero->syncRoles(['bodeguero']);
        $this->bodeguero->warehouses()->attach($this->mina->id);

        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $this->cemento = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);

        Sanctum::actingAs($this->admin);
        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->municipio->id, 'date' => '2026-11-10', 'reason' => 'inventario_inicial',
            'items' => [['product_id' => $this->cemento->id, 'qty_base' => 50, 'unit_cost' => 30000]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();
    }

    private function actAs(User $user): void
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);
    }

    public function test_submitting_a_request_notifies_approvers_and_decision_notifies_requester(): void
    {
        $id = $this->postJson('/api/purchasing/purchase-requests', [
            'warehouse_id' => $this->mina->id, 'priority' => 'normal',
            'items' => [['product_id' => $this->cemento->id, 'unit_id' => $this->cemento->base_unit_id, 'quantity' => 5]],
        ])->json('data.id');
        $this->postJson("/api/purchasing/purchase-requests/{$id}/submit")->assertOk();

        // El aprobador recibe la notificación; el autor no.
        $this->actAs($this->aprobador);
        $inbox = $this->getJson('/api/notifications')->assertOk()->json();
        $this->assertSame(1, $inbox['unread_count']);
        $this->assertSame('Solicitud pendiente de aprobación', $inbox['data'][0]['title']);
        $this->assertSame('/compras/aprobaciones', $inbox['data'][0]['route']);

        // Reenviar no duplica mientras siga sin leer (misma clave).
        $this->actAs($this->admin);
        $this->assertSame(0, $this->getJson('/api/notifications')->json('unread_count'));

        // Al aprobar, el solicitante (admin) es notificado.
        $this->actAs($this->aprobador);
        $this->postJson("/api/purchasing/purchase-requests/{$id}/approve")->assertOk();
        $this->actAs($this->admin);
        $inbox = $this->getJson('/api/notifications?unread=1')->assertOk()->json();
        $this->assertSame(1, $inbox['unread_count']);
        $this->assertStringContainsString('aprobada', $inbox['data'][0]['title']);

        // Marcar leída y leer todas.
        $this->postJson("/api/notifications/{$inbox['data'][0]['id']}/read")->assertOk()->assertJsonPath('unread_count', 0);
        $this->postJson('/api/notifications/read-all')->assertOk();
    }

    public function test_dispatch_notifies_only_destination_warehouse_keepers(): void
    {
        $otherKeeper = User::query()->create(['name' => 'Bodeguero Mun', 'username' => 'bodem', 'email' => 'bodem@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $otherKeeper->syncRoles(['bodeguero']);
        $otherKeeper->warehouses()->attach($this->municipio->id);

        $pl = $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'items' => [['product_id' => $this->cemento->id, 'unit_id' => $this->cemento->base_unit_id, 'quantity' => 10]],
        ])->json('data');
        $this->postJson("/api/logistics/shipments/{$pl['id']}/dispatch")->assertOk();

        $this->actAs($this->bodeguero);
        $inbox = $this->getJson('/api/notifications')->json();
        $this->assertSame(1, $inbox['unread_count']);
        $this->assertSame('Planilla despachada hacia tu bodega', $inbox['data'][0]['title']);

        $this->actAs($otherKeeper);
        $this->assertSame(0, $this->getJson('/api/notifications')->json('unread_count'));
    }

    public function test_daily_alerts_are_idempotent_while_unread(): void
    {
        // Mínimo de 100 con stock de 50 → bajo mínimo.
        $this->cemento->forceFill(['default_min_stock' => 100])->save();

        $this->artisan('minerstock:alerts')->assertSuccessful();
        $this->artisan('minerstock:alerts')->assertSuccessful();

        $this->actAs($this->admin);
        $stockAlerts = collect($this->getJson('/api/notifications')->json('data'))
            ->filter(fn ($n) => str_contains($n['title'], 'stock mínimo'));
        $this->assertCount(1, $stockAlerts);
    }
}
