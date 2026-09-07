<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Site;
use App\Models\StockBalance;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Warehouse $warehouse;

    private Product $gloves;

    private Product $cement;

    private int $caja;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();
        Sanctum::actingAs($this->admin);

        $site = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $this->warehouse = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);
        $und = Unit::query()->where('code', 'UND')->firstOrFail();
        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $this->caja = Unit::query()->where('code', 'CAJA')->value('id');

        $this->gloves = Product::query()->create(['sku' => 'GUA', 'name' => 'Guantes', 'base_unit_id' => $und->id, 'kind' => 'consumible', 'default_min_stock' => 100]);
        $this->gloves->units()->create(['unit_id' => $this->caja, 'factor' => 12]);
        $this->cement = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);
        Supplier::query()->create(['document_number' => 'A', 'name' => 'Proveedor A']);
    }

    /** OC emitida: 10 cajas de guantes a $60.000/caja (= $5.000/UND) y 100 bultos de cemento a $30.000. */
    private function issuedOrder(): PurchaseOrder
    {
        $id = $this->postJson('/api/purchasing/purchase-orders', [
            'supplier_id' => Supplier::query()->value('id'), 'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08',
            'items' => [
                ['product_id' => $this->gloves->id, 'unit_id' => $this->caja, 'quantity' => 10, 'unit_price' => 60000, 'tax_rate' => 19],
                ['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 100, 'unit_price' => 30000, 'tax_rate' => 19],
            ],
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/purchasing/purchase-orders/{$id}/submit")->assertOk();
        $this->postJson("/api/purchasing/purchase-orders/{$id}/approve")->assertOk();
        $this->postJson("/api/purchasing/purchase-orders/{$id}/issue")->assertOk()->assertJsonPath('data.status', 'emitida');

        return PurchaseOrder::query()->with('items')->findOrFail($id);
    }

    private function balance(Product $p): ?StockBalance
    {
        return StockBalance::query()->where('warehouse_id', $this->warehouse->id)->where('product_id', $p->id)->first();
    }

    public function test_partial_receipts_feed_kardex_and_order_status(): void
    {
        $po = $this->issuedOrder();
        $glovesItem = $po->items->firstWhere('product_id', $this->gloves->id);
        $cementItem = $po->items->firstWhere('product_id', $this->cement->id);

        $this->getJson('/api/inventory/goods-receipts/receivable-orders')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.items.0.pending_base', 120);

        // Recepción 1: 4 cajas de guantes (48 UND) + 60 bultos de cemento.
        $rc1 = $this->postJson('/api/inventory/goods-receipts', [
            'purchase_order_id' => $po->id, 'received_at' => '2026-09-09', 'supplier_remission' => 'R-1',
            'items' => [
                ['purchase_order_item_id' => $glovesItem->id, 'unit_id' => $this->caja, 'quantity' => 4],
                ['purchase_order_item_id' => $cementItem->id, 'quantity' => 60],
            ],
        ])->assertCreated()->assertJsonPath('data.number', 'RC-00001')->assertJsonPath('data.status', 'borrador')->json('data');

        $this->assertNull($this->balance($this->gloves), 'un borrador no toca el stock');

        $this->postJson("/api/inventory/goods-receipts/{$rc1['id']}/confirm")->assertOk()->assertJsonPath('data.status', 'confirmado');

        $g = $this->balance($this->gloves);
        $this->assertEquals(48, (float) $g->qty);
        $this->assertEquals(5000, (float) $g->avg_cost, '60000 / 12');
        $this->assertEquals(60, (float) $this->balance($this->cement)->qty);
        $this->assertSame('recibida_parcial', $po->fresh()->status->value);
        $this->assertEquals(48, (float) $glovesItem->fresh()->qty_received_base);

        // Exceder lo pendiente falla.
        $this->postJson('/api/inventory/goods-receipts', [
            'purchase_order_id' => $po->id, 'received_at' => '2026-09-10',
            'items' => [['purchase_order_item_id' => $glovesItem->id, 'unit_id' => $this->caja, 'quantity' => 7]],
        ])->assertStatus(422);

        // Recepción 2: completa la orden.
        $rc2 = $this->postJson('/api/inventory/goods-receipts', [
            'purchase_order_id' => $po->id, 'received_at' => '2026-09-10',
            'items' => [
                ['purchase_order_item_id' => $glovesItem->id, 'unit_id' => $this->caja, 'quantity' => 6],
                ['purchase_order_item_id' => $cementItem->id, 'quantity' => 40],
            ],
        ])->assertCreated()->json('data');
        $this->postJson("/api/inventory/goods-receipts/{$rc2['id']}/confirm")->assertOk();

        $this->assertEquals(120, (float) $this->balance($this->gloves)->qty);
        $this->assertSame('recibida', $po->fresh()->status->value);
        $this->getJson('/api/inventory/goods-receipts/receivable-orders')->assertOk()->assertJsonCount(0, 'data');

        // Kardex con saldo corrido y stock matrix.
        $kardex = $this->getJson("/api/inventory/kardex?product_id={$this->gloves->id}&warehouse_id={$this->warehouse->id}")->assertOk()->json('data');
        $this->assertCount(2, $kardex);
        $this->assertEquals(120, $kardex[0]['balance_qty_after']);
        $this->assertSame('RC-00002', $kardex[0]['source']['number']);

        $matrix = $this->getJson('/api/inventory/stock')->assertOk()->json();
        $this->assertCount(2, $matrix['data']);
        $glovesRow = collect($matrix['data'])->firstWhere('product.sku', 'GUA');
        $this->assertEquals(120, $glovesRow['total_qty']);
        $this->assertEquals(600000, $glovesRow['total_value']);
        $this->assertFalse($glovesRow['below_min'], '120 >= mínimo 100');
        $this->assertEquals(600000 + 100 * 30000, $matrix['totals']['total_value']);

        // Anular la recepción 2 revierte kardex y estado de la OC.
        $this->postJson("/api/inventory/goods-receipts/{$rc2['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'anulado');
        $this->assertEquals(48, (float) $this->balance($this->gloves)->qty);
        $this->assertSame('recibida_parcial', $po->fresh()->status->value);
        $this->assertTrue(collect($this->getJson('/api/inventory/stock')->json('data'))->firstWhere('product.sku', 'GUA')['below_min'], '48 < mínimo 100');
    }

    public function test_supplier_return_reduces_stock_and_blocks_receipt_cancel(): void
    {
        $po = $this->issuedOrder();
        $glovesItem = $po->items->firstWhere('product_id', $this->gloves->id);
        $rc = $this->postJson('/api/inventory/goods-receipts', [
            'purchase_order_id' => $po->id, 'received_at' => '2026-09-09',
            'items' => [['purchase_order_item_id' => $glovesItem->id, 'unit_id' => $this->caja, 'quantity' => 10]],
        ])->json('data');
        $this->postJson("/api/inventory/goods-receipts/{$rc['id']}/confirm")->assertOk();
        $receiptItemId = $rc['items'][0]['id'];

        // Devolver más de lo recibido falla.
        $this->postJson('/api/inventory/supplier-returns', [
            'goods_receipt_id' => $rc['id'], 'date' => '2026-09-11', 'reason' => 'defectuoso',
            'items' => [['goods_receipt_item_id' => $receiptItemId, 'qty_base' => 121]],
        ])->assertStatus(422);

        $dv = $this->postJson('/api/inventory/supplier-returns', [
            'goods_receipt_id' => $rc['id'], 'date' => '2026-09-11', 'reason' => 'defectuoso',
            'items' => [['goods_receipt_item_id' => $receiptItemId, 'qty_base' => 24]],
        ])->assertCreated()->assertJsonPath('data.number', 'DV-00001')->assertJsonPath('data.total_cost', 120000)->json('data');

        $this->postJson("/api/inventory/supplier-returns/{$dv['id']}/confirm")->assertOk()->assertJsonPath('data.status', 'confirmado');
        $this->assertEquals(96, (float) $this->balance($this->gloves)->qty);
        $this->assertEquals(24, (float) $glovesItem->fresh()->qty_returned_base);

        // La recepción con devolución no se puede anular.
        $this->postJson("/api/inventory/goods-receipts/{$rc['id']}/cancel")->assertStatus(422);

        // Anular la devolución restaura el stock.
        $this->postJson("/api/inventory/supplier-returns/{$dv['id']}/cancel")->assertOk();
        $this->assertEquals(120, (float) $this->balance($this->gloves)->qty);
        $this->assertEquals(0, (float) $glovesItem->fresh()->qty_returned_base);
    }

    public function test_adjustments_weighted_average_and_insufficient_stock(): void
    {
        // Inventario inicial: 10 UND a $4.000.
        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08', 'reason' => 'inventario_inicial',
            'items' => [['product_id' => $this->gloves->id, 'qty_base' => 10, 'unit_cost' => 4000]],
        ])->assertCreated()->assertJsonPath('data.number', 'AJ-00001')->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();
        $this->assertEquals(4000, (float) $this->balance($this->gloves)->avg_cost);

        // Entrada de 10 más a $6.000 → promedio 5.000.
        $adj2 = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08', 'reason' => 'correccion',
            'items' => [['product_id' => $this->gloves->id, 'qty_base' => 10, 'unit_cost' => 6000]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj2['id']}/confirm")->assertOk();
        $b = $this->balance($this->gloves);
        $this->assertEquals(20, (float) $b->qty);
        $this->assertEquals(5000, (float) $b->avg_cost);

        // Salida de 5 al promedio (no cambia el promedio); salida mayor al stock falla.
        $adj3 = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08', 'reason' => 'daño',
            'items' => [['product_id' => $this->gloves->id, 'qty_base' => -5]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj3['id']}/confirm")->assertOk()->assertJsonPath('data.items.0.unit_cost', 5000);
        $this->assertEquals(15, (float) $this->balance($this->gloves)->qty);
        $this->assertEquals(5000, (float) $this->balance($this->gloves)->avg_cost);

        $adj4 = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08', 'reason' => 'perdida',
            'items' => [['product_id' => $this->gloves->id, 'qty_base' => -50]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj4['id']}/confirm")->assertStatus(422)
            ->assertJsonPath('message', 'Stock insuficiente de Guantes: disponible 15, requerido 50.');
        $this->assertEquals(15, (float) $this->balance($this->gloves)->qty, 'la transacción no dejó rastro');
    }

    public function test_stock_count_generates_adjustment_on_close(): void
    {
        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08', 'reason' => 'inventario_inicial',
            'items' => [
                ['product_id' => $this->gloves->id, 'qty_base' => 100, 'unit_cost' => 5000],
                ['product_id' => $this->cement->id, 'qty_base' => 50, 'unit_cost' => 30000],
            ],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();

        $count = $this->postJson('/api/inventory/stock-counts', [
            'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-12', 'scope' => 'all',
        ])->assertCreated()->assertJsonPath('data.number', 'CF-00001')->assertJsonCount(2, 'data.items')->json('data');

        // Cerrar sin contar todo falla.
        $this->postJson("/api/inventory/stock-counts/{$count['id']}/close")->assertStatus(422);

        $this->putJson("/api/inventory/stock-counts/{$count['id']}/record", ['items' => [
            ['product_id' => $this->gloves->id, 'counted_qty' => 97, 'notes' => 'Faltan 3'],
            ['product_id' => $this->cement->id, 'counted_qty' => 50],
        ]])->assertOk()->assertJsonPath('data.summary.counted', 2)->assertJsonPath('data.summary.with_difference', 1);

        $closed = $this->postJson("/api/inventory/stock-counts/{$count['id']}/close")->assertOk()
            ->assertJsonPath('data.status', 'cerrado')->json('data');
        $this->assertNotNull($closed['adjustment_id']);
        $this->assertEquals(97, (float) $this->balance($this->gloves)->qty);
        $this->assertEquals(50, (float) $this->balance($this->cement)->qty);

        $this->getJson("/api/inventory/adjustments/{$closed['adjustment_id']}")->assertOk()
            ->assertJsonPath('data.reason', 'conteo')->assertJsonPath('data.status', 'confirmado')
            ->assertJsonPath('data.items.0.qty_base', -3);

        // Un conteo cerrado no acepta más registros.
        $this->putJson("/api/inventory/stock-counts/{$count['id']}/record", ['items' => [['product_id' => $this->gloves->id, 'counted_qty' => 1]]])->assertStatus(422);
    }

    public function test_bodeguero_sees_only_assigned_warehouses(): void
    {
        $other = Warehouse::query()->create(['site_id' => Site::query()->value('id'), 'code' => 'B2', 'name' => 'Otra']);
        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $other->id, 'date' => '2026-09-08', 'reason' => 'inventario_inicial',
            'items' => [['product_id' => $this->cement->id, 'qty_base' => 5, 'unit_cost' => 1000]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();

        $bodeguero = User::factory()->create();
        $bodeguero->assignRole('bodeguero');
        $bodeguero->warehouses()->sync([$this->warehouse->id]);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($bodeguero);

        $this->getJson('/api/inventory/stock')->assertOk()->assertJsonCount(1, 'warehouses')->assertJsonCount(0, 'data');
        $this->getJson("/api/inventory/adjustments/{$adj['id']}")->assertStatus(404);
        $this->postJson('/api/inventory/supplier-returns', [])->assertStatus(403);
    }
}
