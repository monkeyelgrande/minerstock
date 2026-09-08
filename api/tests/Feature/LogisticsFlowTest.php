<?php

namespace Tests\Feature;

use App\Models\Driver;
use App\Models\Product;
use App\Models\PurchaseRequest;
use App\Models\Site;
use App\Models\StockBalance;
use App\Models\Unit;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LogisticsFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Warehouse $municipio;

    private Warehouse $mina;

    private Product $cement;

    private Vehicle $truck;

    private Driver $driver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Storage::fake('public');
        $this->admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();
        Sanctum::actingAs($this->admin);

        $siteM = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $siteMina = Site::query()->create(['name' => 'Mina Norte', 'type' => 'mina']);
        $this->municipio = Warehouse::query()->create(['site_id' => $siteM->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);
        $this->mina = Warehouse::query()->create(['site_id' => $siteMina->id, 'code' => 'MN', 'name' => 'Bodega Mina Norte']);

        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $this->cement = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);
        $this->truck = Vehicle::query()->create(['plate' => 'WLK482', 'type' => 'Camión', 'ownership' => 'propio']);
        $this->driver = Driver::query()->create(['document_number' => '71234567', 'name' => 'Jorge Ruiz']);

        // Stock inicial en municipio: 100 bultos a $30.000.
        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->municipio->id, 'date' => '2026-09-08', 'reason' => 'inventario_inicial',
            'items' => [['product_id' => $this->cement->id, 'qty_base' => 100, 'unit_cost' => 30000]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();
    }

    private function balance(Warehouse $wh): float
    {
        return (float) (StockBalance::query()->where('warehouse_id', $wh->id)->where('product_id', $this->cement->id)->value('qty') ?? 0);
    }

    /** Solicitud aprobada de la mina por 60 bultos. Devuelve [requestId, requestItemId]. */
    private function approvedRequest(): array
    {
        $id = $this->postJson('/api/purchasing/purchase-requests', [
            'warehouse_id' => $this->mina->id, 'priority' => 'alta',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 60]],
        ])->json('data.id');
        $this->postJson("/api/purchasing/purchase-requests/{$id}/submit")->assertOk();
        $this->postJson("/api/purchasing/purchase-requests/{$id}/approve")->assertOk();

        return [$id, $this->getJson("/api/purchasing/purchase-requests/{$id}")->json('data.items.0.id')];
    }

    private function attachSignedSheet(int $receiptId): void
    {
        $this->post('/api/attachments', [
            'attachable_type' => 'shipment_receipt',
            'attachable_id' => $receiptId,
            'purpose' => 'planilla_firmada',
            'file' => UploadedFile::fake()->image('planilla.jpg'),
        ])->assertCreated();
    }

    public function test_dispatch_moves_stock_to_transit_and_updates_request(): void
    {
        [$requestId, $requestItemId] = $this->approvedRequest();

        // Pendientes por despachar hacia la mina, con stock del origen.
        $this->getJson("/api/logistics/shipments/pending-request-items?destination_warehouse_id={$this->mina->id}&origin_warehouse_id={$this->municipio->id}")
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.pending_base', 60)
            ->assertJsonPath('data.0.origin_stock', 100);

        // Origen y destino iguales falla.
        $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->municipio->id,
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 1]],
        ])->assertStatus(422);

        $pl = $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'vehicle_id' => $this->truck->id, 'driver_id' => $this->driver->id,
            'items' => [[
                'product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id,
                'quantity' => 60, 'purchase_request_item_id' => $requestItemId,
            ]],
        ])->assertCreated()->assertJsonPath('data.number', 'PL-00001')->assertJsonPath('data.status', 'borrador')->json('data');

        $this->assertSame(100.0, $this->balance($this->municipio), 'un borrador no toca stock');

        // PDF de planilla en borrador funciona (para revisarla antes de despachar).
        $pdf = $this->get("/api/logistics/shipments/{$pl['id']}/pdf");
        $pdf->assertOk();
        $this->assertStringStartsWith('%PDF', $pdf->getContent());

        $this->postJson("/api/logistics/shipments/{$pl['id']}/dispatch")->assertOk()
            ->assertJsonPath('data.status', 'despachada')
            ->assertJsonPath('data.items.0.unit_cost', 30000);

        $this->assertSame(40.0, $this->balance($this->municipio));
        $this->assertSame(0.0, $this->balance($this->mina));

        // La solicitud queda atendida (todo despachado) y la matriz muestra el tránsito.
        $this->assertSame('atendida', PurchaseRequest::query()->find($requestId)->status->value);
        $row = collect($this->getJson('/api/inventory/stock')->json('data'))->firstWhere('product.sku', 'CEM');
        $this->assertEquals(60, $row['in_transit']);
        $this->assertEquals(60 * 30000, $this->getJson('/api/inventory/stock/summary')->json('data.in_transit_value'));

        // Vista en tránsito.
        $this->getJson('/api/logistics/shipments/in-transit')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.items.0.pending_base', 60);

        // Despachada no se edita; anularla revierte todo.
        $this->putJson("/api/logistics/shipments/{$pl['id']}", [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 1]],
        ])->assertStatus(422);
        $this->postJson("/api/logistics/shipments/{$pl['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'anulada');
        $this->assertSame(100.0, $this->balance($this->municipio));
        $this->assertSame('aprobada', PurchaseRequest::query()->find($requestId)->status->value);
    }

    public function test_dispatch_fails_without_stock(): void
    {
        $pl = $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 500]],
        ])->json('data');

        $this->postJson("/api/logistics/shipments/{$pl['id']}/dispatch")->assertStatus(422)
            ->assertJsonPath('message', 'Stock insuficiente de Cemento: disponible 100, requerido 500.');
        $this->assertSame(100.0, $this->balance($this->municipio));
    }

    public function test_receipt_requires_signed_sheet_and_creates_novelties(): void
    {
        $pl = $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 60]],
        ])->json('data');
        $this->postJson("/api/logistics/shipments/{$pl['id']}/dispatch")->assertOk();
        $itemId = $this->getJson("/api/logistics/shipments/{$pl['id']}")->json('data.items.0.id');

        // Recibido + dañado no puede superar lo pendiente.
        $this->postJson('/api/logistics/shipment-receipts', [
            'shipment_id' => $pl['id'], 'received_at' => '2026-09-11',
            'items' => [['shipment_item_id' => $itemId, 'qty_received_base' => 60, 'qty_damaged_base' => 5]],
        ])->assertStatus(422);

        // 55 buenos, 2 dañados → 3 faltantes.
        $rm = $this->postJson('/api/logistics/shipment-receipts', [
            'shipment_id' => $pl['id'], 'received_at' => '2026-09-11',
            'items' => [['shipment_item_id' => $itemId, 'qty_received_base' => 55, 'qty_damaged_base' => 2, 'notes' => 'Bultos rotos']],
        ])->assertCreated()
            ->assertJsonPath('data.number', 'RM-00001')
            ->assertJsonPath('data.items.0.qty_missing_base', 3)
            ->assertJsonPath('data.has_signed_sheet', false)
            ->json('data');

        // Sin la foto de la planilla firmada no se confirma.
        $this->postJson("/api/logistics/shipment-receipts/{$rm['id']}/confirm")->assertStatus(422)
            ->assertJsonPath('message', 'Adjunta la foto de la planilla firmada por el chofer antes de confirmar.');

        $this->attachSignedSheet($rm['id']);
        $this->postJson("/api/logistics/shipment-receipts/{$rm['id']}/confirm")->assertOk()
            ->assertJsonPath('data.status', 'confirmado');

        // Solo lo bueno entra al stock de la mina, al costo de despacho.
        $this->assertSame(55.0, $this->balance($this->mina));
        $mina = StockBalance::query()->where('warehouse_id', $this->mina->id)->where('product_id', $this->cement->id)->first();
        $this->assertEquals(30000, (float) $mina->avg_cost);

        // La planilla queda recibida (todo liquidado) y sin tránsito.
        $this->getJson("/api/logistics/shipments/{$pl['id']}")->assertJsonPath('data.status', 'recibida');
        $this->assertEquals(0, $this->getJson('/api/inventory/stock/summary')->json('data.in_transit_value'));

        // Novedades: faltante 3 y dañado 2, abiertas; resolver una.
        $novelties = $this->getJson('/api/logistics/novelties?status=abierta')->assertOk()->json('data');
        $this->assertCount(2, $novelties);
        $faltante = collect($novelties)->firstWhere('type', 'faltante');
        $this->assertEquals(3, $faltante['qty_base']);
        $this->postJson("/api/logistics/novelties/{$faltante['id']}/resolve", ['resolution' => 'Descontado al chofer'])->assertOk();
        $this->getJson('/api/logistics/novelties/counts')->assertJsonPath('data.abierta', 1)->assertJsonPath('data.resuelta', 1);

        // Con una novedad resuelta la recepción no se puede anular.
        $this->postJson("/api/logistics/shipment-receipts/{$rm['id']}/cancel")->assertStatus(422);

        // Cerrar la planilla.
        $this->postJson("/api/logistics/shipments/{$pl['id']}/close")->assertOk()->assertJsonPath('data.status', 'cerrada');
    }

    public function test_cancel_confirmed_receipt_restores_transit(): void
    {
        $pl = $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 20]],
        ])->json('data');
        $this->postJson("/api/logistics/shipments/{$pl['id']}/dispatch")->assertOk();
        $itemId = $this->getJson("/api/logistics/shipments/{$pl['id']}")->json('data.items.0.id');

        $rm = $this->postJson('/api/logistics/shipment-receipts', [
            'shipment_id' => $pl['id'], 'received_at' => '2026-09-11',
            'items' => [['shipment_item_id' => $itemId, 'qty_received_base' => 20]],
        ])->json('data');
        $this->attachSignedSheet($rm['id']);
        $this->postJson("/api/logistics/shipment-receipts/{$rm['id']}/confirm")->assertOk();
        $this->assertSame(20.0, $this->balance($this->mina));

        $this->postJson("/api/logistics/shipment-receipts/{$rm['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'anulado');
        $this->assertSame(0.0, $this->balance($this->mina));
        $this->getJson("/api/logistics/shipments/{$pl['id']}")->assertJsonPath('data.status', 'despachada')
            ->assertJsonPath('data.items.0.pending_base', 20);
    }

    public function test_destination_bodeguero_receives_but_other_warehouse_cannot(): void
    {
        $pl = $this->postJson('/api/logistics/shipments', [
            'origin_warehouse_id' => $this->municipio->id, 'destination_warehouse_id' => $this->mina->id,
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 10]],
        ])->json('data');
        $this->postJson("/api/logistics/shipments/{$pl['id']}/dispatch")->assertOk();
        $itemId = $this->getJson("/api/logistics/shipments/{$pl['id']}")->json('data.items.0.id');

        // Bodeguero de OTRA bodega no puede registrar la recepción.
        $otro = User::factory()->create();
        $otro->assignRole('bodeguero');
        $otro->warehouses()->sync([$this->municipio->id]);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($otro);
        $this->postJson('/api/logistics/shipment-receipts', [
            'shipment_id' => $pl['id'], 'received_at' => '2026-09-11',
            'items' => [['shipment_item_id' => $itemId, 'qty_received_base' => 10]],
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Solo el bodeguero de la bodega destino puede registrar esta recepción.');

        // El de la mina sí.
        $bodeguero = User::factory()->create();
        $bodeguero->assignRole('bodeguero');
        $bodeguero->warehouses()->sync([$this->mina->id]);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($bodeguero);
        $this->postJson('/api/logistics/shipment-receipts', [
            'shipment_id' => $pl['id'], 'received_at' => '2026-09-11',
            'items' => [['shipment_item_id' => $itemId, 'qty_received_base' => 10]],
        ])->assertCreated();
    }
}
