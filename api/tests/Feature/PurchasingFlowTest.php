<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\PurchaseRequest;
use App\Models\Site;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PurchasingFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $comprador;

    private User $aprobador;

    private Warehouse $warehouse;

    private Product $cement;

    private Product $gloves;

    private Supplier $supplierA;

    private Supplier $supplierB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $site = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $this->warehouse = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);

        $und = Unit::query()->where('code', 'UND')->firstOrFail();
        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $caja = Unit::query()->where('code', 'CAJA')->firstOrFail();

        $this->cement = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);
        $this->gloves = Product::query()->create(['sku' => 'GUA', 'name' => 'Guantes', 'base_unit_id' => $und->id, 'kind' => 'consumible']);
        $this->gloves->units()->create(['unit_id' => $caja->id, 'factor' => 12]);

        $this->supplierA = Supplier::query()->create(['document_number' => 'A', 'name' => 'Proveedor A', 'payment_terms_days' => 30]);
        $this->supplierB = Supplier::query()->create(['document_number' => 'B', 'name' => 'Proveedor B']);

        $this->comprador = User::factory()->create();
        $this->comprador->assignRole('comprador');
        $this->comprador->warehouses()->sync([$this->warehouse->id]);

        $this->aprobador = User::factory()->create();
        $this->aprobador->assignRole('aprobador');
    }

    private function as(User $user): static
    {
        // Limpiar el guard cacheado antes de cambiar de usuario dentro de la misma prueba.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);

        return $this;
    }

    private function createApprovedRequest(): PurchaseRequest
    {
        $this->as($this->comprador);
        $id = $this->postJson('/api/purchasing/purchase-requests', [
            'warehouse_id' => $this->warehouse->id,
            'priority' => 'alta',
            'items' => [
                ['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 100],
                ['product_id' => $this->gloves->id, 'unit_id' => Unit::query()->where('code', 'CAJA')->value('id'), 'quantity' => 2],
            ],
        ])->assertCreated()->assertJsonPath('data.status', 'borrador')->json('data.id');

        $this->postJson("/api/purchasing/purchase-requests/{$id}/submit")->assertOk()->assertJsonPath('data.status', 'enviada');

        $this->as($this->aprobador);
        $this->postJson("/api/purchasing/purchase-requests/{$id}/approve", ['comment' => 'OK'])->assertOk()->assertJsonPath('data.status', 'aprobada');

        return PurchaseRequest::query()->with('items')->findOrFail($id);
    }

    public function test_request_number_and_unit_conversion(): void
    {
        $pr = $this->createApprovedRequest();

        $this->assertSame('SC-00001', $pr->number);
        $gloves = $pr->items->firstWhere('product_id', $this->gloves->id);
        $this->assertSame(2.0, (float) $gloves->quantity);
        $this->assertSame(24.0, (float) $gloves->qty_base, '2 cajas × 12 = 24 unidades base');
        $this->assertSame(1, $pr->approvals()->where('status', 'aprobada')->count());
    }

    public function test_request_cannot_be_approved_twice_nor_edited_after_submit(): void
    {
        $pr = $this->createApprovedRequest();

        $this->as($this->aprobador);
        $this->postJson("/api/purchasing/purchase-requests/{$pr->id}/approve")
            ->assertStatus(422)->assertJsonPath('message', 'No se puede aprobar una solicitud en estado "Aprobada".');

        $this->as($this->comprador);
        $this->putJson("/api/purchasing/purchase-requests/{$pr->id}", [
            'warehouse_id' => $this->warehouse->id, 'priority' => 'baja',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 1]],
        ])->assertStatus(422);
    }

    public function test_rejected_request_returns_to_editable_state(): void
    {
        $this->as($this->comprador);
        $id = $this->postJson('/api/purchasing/purchase-requests', [
            'warehouse_id' => $this->warehouse->id, 'priority' => 'normal',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 5]],
        ])->json('data.id');
        $this->postJson("/api/purchasing/purchase-requests/{$id}/submit")->assertOk();

        $this->as($this->aprobador);
        $this->postJson("/api/purchasing/purchase-requests/{$id}/reject", ['reason' => 'Falta justificación'])
            ->assertOk()->assertJsonPath('data.status', 'rechazada')->assertJsonPath('data.is_editable', true);

        $this->as($this->comprador);
        $this->putJson("/api/purchasing/purchase-requests/{$id}", [
            'warehouse_id' => $this->warehouse->id, 'priority' => 'normal', 'notes' => 'Justificación agregada',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 5]],
        ])->assertOk()->assertJsonPath('data.status', 'borrador')->assertJsonPath('data.rejection_reason', null);
    }

    public function test_aprobador_cannot_create_requests_and_comprador_cannot_approve(): void
    {
        $this->as($this->aprobador);
        $this->postJson('/api/purchasing/purchase-requests', [])->assertStatus(403);

        $pr = $this->createApprovedRequest();
        $this->as($this->comprador);
        $this->postJson("/api/purchasing/purchase-requests/{$pr->id}/approve")->assertStatus(403);
    }

    public function test_full_flow_quotations_comparison_orders_and_pdf(): void
    {
        $pr = $this->createApprovedRequest();
        $cementItem = $pr->items->firstWhere('product_id', $this->cement->id);
        $glovesItem = $pr->items->firstWhere('product_id', $this->gloves->id);
        $caja = Unit::query()->where('code', 'CAJA')->value('id');

        $this->as($this->comprador);

        // Ítems pendientes de ordenar aparecen para cotizar.
        $this->getJson('/api/purchasing/purchase-requests/pending-items')->assertOk()->assertJsonCount(2, 'data');

        // Dos cotizaciones: A cotiza ambos productos, B solo cemento más barato.
        $qa = $this->postJson('/api/purchasing/quotations', [
            'supplier_id' => $this->supplierA->id, 'date' => '2026-09-07', 'valid_until' => '2026-12-31',
            'items' => [
                ['product_id' => $this->cement->id, 'purchase_request_item_id' => $cementItem->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 100, 'unit_price' => 30000, 'tax_rate' => 19, 'delivery_days' => 3],
                ['product_id' => $this->gloves->id, 'purchase_request_item_id' => $glovesItem->id, 'unit_id' => $caja, 'quantity' => 2, 'unit_price' => 60000, 'tax_rate' => 19],
            ],
        ])->assertCreated()->assertJsonPath('data.number', 'CO-00001')->assertJsonPath('data.subtotal', 3120000)->assertJsonPath('data.tax', 592800)->json('data');

        $qb = $this->postJson('/api/purchasing/quotations', [
            'supplier_id' => $this->supplierB->id, 'date' => '2026-09-07',
            'items' => [
                ['product_id' => $this->cement->id, 'purchase_request_item_id' => $cementItem->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 100, 'unit_price' => 28500, 'tax_rate' => 19, 'delivery_days' => 5],
            ],
        ])->assertCreated()->json('data');

        // Sin recibir no entran a la comparativa.
        $this->getJson('/api/purchasing/comparison')->assertOk()->assertJsonCount(0, 'data.rows');

        $this->postJson("/api/purchasing/quotations/{$qa['id']}/receive")->assertOk()->assertJsonPath('data.status', 'recibida');
        $this->postJson("/api/purchasing/quotations/{$qb['id']}/receive")->assertOk();

        $matrix = $this->getJson('/api/purchasing/comparison?request_ids[]='.$pr->id)->assertOk()->json('data');
        $this->assertCount(2, $matrix['suppliers']);
        $this->assertCount(2, $matrix['rows']);
        $cementRow = collect($matrix['rows'])->firstWhere('product.sku', 'CEM');
        $this->assertCount(2, $cementRow['offers']);
        $best = collect($cementRow['offers'])->firstWhere('is_best', true);
        $this->assertSame($this->supplierB->id, $best['supplier_id'], 'B es el mejor precio en cemento');
        $glovesRow = collect($matrix['rows'])->firstWhere('product.sku', 'GUA');
        $this->assertEquals(5000, $glovesRow['offers'][0]['base_price'], '60000 / 12 por unidad base');

        // Seleccionar: cemento de B, guantes de A.
        $glovesOfferId = $glovesRow['offers'][0]['quotation_item_id'];
        $this->postJson('/api/purchasing/comparison/select', ['selections' => [
            ['quotation_item_id' => $best['quotation_item_id'], 'selected' => true],
            ['quotation_item_id' => $glovesOfferId, 'selected' => true],
        ]])->assertOk();

        // Generar OC: una por proveedor.
        $res = $this->postJson('/api/purchasing/comparison/generate-orders', [
            'quotation_item_ids' => [$best['quotation_item_id'], $glovesOfferId],
            'warehouse_id' => $this->warehouse->id,
        ])->assertCreated();
        $orders = $res->json('data');
        $this->assertCount(2, $orders);
        $orderB = collect($orders)->firstWhere('supplier_id', $this->supplierB->id);
        $orderA = collect($orders)->firstWhere('supplier_id', $this->supplierA->id);
        $this->assertSame('borrador', $orderB['status']);
        $this->assertEquals(2850000, $orderB['subtotal']);
        $this->assertSame('credito', $orderA['payment_terms']);
        $this->assertSame(30, $orderA['payment_days']);

        // Ya seleccionados no vuelven a la comparativa; la cotización queda seleccionada.
        $this->getJson('/api/purchasing/comparison')->assertOk()->assertJsonCount(0, 'data.rows');
        $this->getJson("/api/purchasing/quotations/{$qb['id']}")->assertJsonPath('data.status', 'seleccionada');

        // Aprobación de la OC B: compromete cantidades en la solicitud.
        $this->postJson("/api/purchasing/purchase-orders/{$orderB['id']}/submit")->assertOk()->assertJsonPath('data.status', 'pendiente_aprobacion');
        $this->getJson("/api/purchasing/purchase-orders/{$orderB['id']}/pdf")->assertStatus(422);
        $this->postJson("/api/purchasing/purchase-orders/{$orderB['id']}/approve")->assertStatus(403);

        $this->as($this->aprobador);
        $inbox = $this->getJson('/api/purchasing/approvals/inbox')->assertOk()->json('data');
        $this->assertSame(1, $inbox['counts']['purchase_orders']);
        $this->postJson("/api/purchasing/purchase-orders/{$orderB['id']}/approve", ['comment' => 'Aprobada'])->assertOk()->assertJsonPath('data.status', 'aprobada');

        $cementItem->refresh();
        $this->assertSame(100.0, (float) $cementItem->qty_ordered_base);
        $this->assertSame('en_proceso', $pr->fresh()->status->value);
        $this->assertSame(0.0, $glovesItem->fresh()->pendingToOrderBase() - 24.0, 'guantes aún sin OC aprobada');

        // Emitir y PDF.
        $this->as($this->comprador);
        $this->postJson("/api/purchasing/purchase-orders/{$orderB['id']}/issue")->assertOk()->assertJsonPath('data.status', 'emitida');
        $pdf = $this->get("/api/purchasing/purchase-orders/{$orderB['id']}/pdf");
        $pdf->assertOk();
        $this->assertStringStartsWith('%PDF', $pdf->getContent());

        // Anular la OC emitida libera cantidades y devuelve la solicitud a aprobada.
        $this->postJson("/api/purchasing/purchase-orders/{$orderB['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'anulada');
        $this->assertSame(0.0, (float) $cementItem->fresh()->qty_ordered_base);
        $this->assertSame('aprobada', $pr->fresh()->status->value);
        $this->getJson('/api/purchasing/comparison')->assertOk()->assertJsonCount(1, 'data.rows');
    }

    public function test_quotation_item_must_match_request_product(): void
    {
        $pr = $this->createApprovedRequest();
        $cementItem = $pr->items->firstWhere('product_id', $this->cement->id);

        $this->as($this->comprador);
        $this->postJson('/api/purchasing/quotations', [
            'supplier_id' => $this->supplierA->id, 'date' => '2026-09-07',
            'items' => [
                ['product_id' => $this->gloves->id, 'purchase_request_item_id' => $cementItem->id, 'unit_id' => $this->gloves->base_unit_id, 'quantity' => 1, 'unit_price' => 1],
            ],
        ])->assertStatus(422)->assertJsonPath('message', 'El ítem de solicitud no corresponde al producto GUA.');
    }

    public function test_manual_purchase_order_and_reopen(): void
    {
        $this->as($this->comprador);
        $id = $this->postJson('/api/purchasing/purchase-orders', [
            'supplier_id' => $this->supplierA->id, 'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-07',
            'payment_terms' => 'contado',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 10, 'unit_price' => 1000, 'tax_rate' => 19]],
        ])->assertCreated()->assertJsonPath('data.number', 'OC-00001')->assertJsonPath('data.total', 11900)->json('data.id');

        $this->postJson("/api/purchasing/purchase-orders/{$id}/submit")->assertOk();
        $this->as($this->aprobador);
        $this->postJson("/api/purchasing/purchase-orders/{$id}/approve")->assertOk();

        $this->as($this->comprador);
        $this->postJson("/api/purchasing/purchase-orders/{$id}/reopen")->assertOk()->assertJsonPath('data.status', 'borrador');
        $this->postJson("/api/purchasing/purchase-orders/{$id}/issue")->assertStatus(422);
    }
}
