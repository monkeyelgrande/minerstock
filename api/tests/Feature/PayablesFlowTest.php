<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Site;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayablesFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Warehouse $warehouse;

    private Supplier $supplier;

    private Product $cement;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();
        Sanctum::actingAs($this->admin);

        $site = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $this->warehouse = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);
        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $this->cement = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);
        $this->supplier = Supplier::query()->create(['document_number' => 'A', 'name' => 'Proveedor A', 'payment_terms_days' => 30]);
    }

    /** OC emitida y recibida: 100 bultos a $30.000 + IVA 19%. Devuelve [orderId, receiptId]. */
    private function receivedOrder(): array
    {
        $orderId = $this->postJson('/api/purchasing/purchase-orders', [
            'supplier_id' => $this->supplier->id, 'warehouse_id' => $this->warehouse->id, 'date' => '2026-09-08',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 100, 'unit_price' => 30000, 'tax_rate' => 19]],
        ])->json('data.id');
        $this->postJson("/api/purchasing/purchase-orders/{$orderId}/submit")->assertOk();
        $this->postJson("/api/purchasing/purchase-orders/{$orderId}/approve")->assertOk();
        $this->postJson("/api/purchasing/purchase-orders/{$orderId}/issue")->assertOk();

        $itemId = $this->getJson("/api/purchasing/purchase-orders/{$orderId}")->json('data.items.0.id');
        $receipt = $this->postJson('/api/inventory/goods-receipts', [
            'purchase_order_id' => $orderId, 'received_at' => '2026-09-09',
            'items' => [['purchase_order_item_id' => $itemId, 'quantity' => 100]],
        ])->json('data');
        $this->postJson("/api/inventory/goods-receipts/{$receipt['id']}/confirm")->assertOk();

        return [$orderId, $receipt['id'], $receipt['items'][0]['id']];
    }

    public function test_invoice_from_receipts_with_withholding_and_prefill(): void
    {
        [$orderId, $receiptId] = $this->receivedOrder();

        // Prefill: subtotal 3.000.000, IVA 570.000.
        $pre = $this->getJson('/api/payables/invoices/invoiceable-receipts?supplier_id='.$this->supplier->id)
            ->assertOk()->assertJsonCount(1, 'data')->json('data.0');
        $this->assertEquals(3000000, $pre['subtotal']);
        $this->assertEquals(570000, $pre['tax']);

        $invoice = $this->postJson('/api/payables/invoices', [
            'supplier_invoice_number' => 'FE-1001',
            'goods_receipt_ids' => [$receiptId],
            'issue_date' => '2026-09-09', 'due_date' => '2026-10-09',
            'subtotal' => 3000000, 'tax' => 570000, 'withholding' => 75000,
        ])->assertCreated()
            ->assertJsonPath('data.number', 'FP-00001')
            ->assertJsonPath('data.supplier_id', $this->supplier->id)
            ->assertJsonPath('data.purchase_order_id', $orderId)
            ->assertJsonPath('data.total', 3495000)
            ->assertJsonPath('data.status', 'pendiente')
            ->json('data');

        // La recepción ya no aparece como facturable, y no puede facturarse dos veces.
        $this->getJson('/api/payables/invoices/invoiceable-receipts')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/payables/invoices', [
            'supplier_invoice_number' => 'FE-1002', 'goods_receipt_ids' => [$receiptId],
            'issue_date' => '2026-09-09', 'due_date' => '2026-10-09', 'subtotal' => 1,
        ])->assertStatus(422);

        // Número duplicado por proveedor.
        $this->postJson('/api/payables/invoices', [
            'supplier_invoice_number' => 'FE-1001', 'supplier_id' => $this->supplier->id,
            'issue_date' => '2026-09-09', 'due_date' => '2026-10-09', 'subtotal' => 100,
        ])->assertStatus(422)->assertJsonPath('message', 'Ya existe una factura de este proveedor con ese número.');

    }

    public function test_payments_apply_to_invoices_and_cancel_reverses(): void
    {
        [, $receiptId] = $this->receivedOrder();
        $invoice = $this->postJson('/api/payables/invoices', [
            'supplier_invoice_number' => 'FE-1001', 'goods_receipt_ids' => [$receiptId],
            'issue_date' => '2026-09-09', 'due_date' => '2026-10-09',
            'subtotal' => 3000000, 'tax' => 570000, 'withholding' => 0,
        ])->json('data');

        // La suma de aplicaciones debe cuadrar con el valor.
        $this->postJson('/api/payables/payments', [
            'supplier_id' => $this->supplier->id, 'date' => '2026-09-10', 'method' => 'transferencia', 'amount' => 1000000,
            'allocations' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 900000]],
        ])->assertStatus(422);

        // Abono parcial.
        $p1 = $this->postJson('/api/payables/payments', [
            'supplier_id' => $this->supplier->id, 'date' => '2026-09-10', 'method' => 'transferencia', 'reference' => 'TRX-1', 'amount' => 1570000,
            'allocations' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 1570000]],
        ])->assertCreated()->assertJsonPath('data.number', 'PG-00001')->json('data');

        $this->getJson("/api/payables/invoices/{$invoice['id']}")->assertOk()
            ->assertJsonPath('data.status', 'parcial')->assertJsonPath('data.balance', 2000000)
            ->assertJsonPath('data.is_editable', false);

        // Editar o anular con pagos falla.
        $this->putJson("/api/payables/invoices/{$invoice['id']}", [
            'supplier_invoice_number' => 'FE-1001', 'issue_date' => '2026-09-09', 'due_date' => '2026-10-09', 'subtotal' => 1,
        ])->assertStatus(422);
        $this->postJson("/api/payables/invoices/{$invoice['id']}/cancel")->assertStatus(422);

        // Pago excede el saldo.
        $this->postJson('/api/payables/payments', [
            'supplier_id' => $this->supplier->id, 'date' => '2026-09-11', 'method' => 'efectivo', 'amount' => 2500000,
            'allocations' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 2500000]],
        ])->assertStatus(422);

        // Pago del saldo exacto → pagada.
        $this->postJson('/api/payables/payments', [
            'supplier_id' => $this->supplier->id, 'date' => '2026-09-11', 'method' => 'efectivo', 'amount' => 2000000,
            'allocations' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 2000000]],
        ])->assertCreated();
        $this->getJson("/api/payables/invoices/{$invoice['id']}")->assertJsonPath('data.status', 'pagada')->assertJsonPath('data.balance', 0);

        // Anular el primer pago revierte a parcial.
        $this->postJson("/api/payables/payments/{$p1['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'anulado');
        $this->getJson("/api/payables/invoices/{$invoice['id']}")->assertJsonPath('data.status', 'parcial')->assertJsonPath('data.balance', 1570000);
    }

    public function test_supplier_return_creates_credit_note_and_applies_to_invoice(): void
    {
        [, $receiptId, $receiptItemId] = $this->receivedOrder();
        $invoice = $this->postJson('/api/payables/invoices', [
            'supplier_invoice_number' => 'FE-1001', 'goods_receipt_ids' => [$receiptId],
            'issue_date' => '2026-09-09', 'due_date' => '2026-10-09',
            'subtotal' => 3000000, 'tax' => 570000,
        ])->json('data');

        // Devolución de 10 bultos → nota crédito automática de $300.000.
        $dv = $this->postJson('/api/inventory/supplier-returns', [
            'goods_receipt_id' => $receiptId, 'date' => '2026-09-12', 'reason' => 'defectuoso',
            'items' => [['goods_receipt_item_id' => $receiptItemId, 'qty_base' => 10]],
        ])->json('data');
        $this->postJson("/api/inventory/supplier-returns/{$dv['id']}/confirm")->assertOk();

        $note = $this->getJson('/api/payables/credit-notes')->assertOk()->assertJsonCount(1, 'data')->json('data.0');
        $this->assertSame('NC-00001', $note['number']);
        $this->assertEquals(300000, $note['amount']);
        $this->assertSame('disponible', $note['status']);
        $this->assertSame($dv['number'], $note['return']['number']);

        // Aplicar más del disponible falla; aplicar 300.000 la deja aplicada.
        $this->postJson("/api/payables/credit-notes/{$note['id']}/apply", [
            'applications' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 400000]],
        ])->assertStatus(422);
        $this->postJson("/api/payables/credit-notes/{$note['id']}/apply", [
            'applications' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 300000]],
        ])->assertOk()->assertJsonPath('data.status', 'aplicada')->assertJsonPath('data.available', 0);

        $this->getJson("/api/payables/invoices/{$invoice['id']}")->assertOk()
            ->assertJsonPath('data.credited_amount', 300000)
            ->assertJsonPath('data.balance', 3270000)
            ->assertJsonPath('data.status', 'parcial');

        // La devolución con nota aplicada no se puede anular.
        $this->postJson("/api/inventory/supplier-returns/{$dv['id']}/cancel")->assertStatus(422);

        // Retirar la aplicación libera la nota y permite anular la devolución (y su nota).
        $app = $this->getJson("/api/payables/credit-notes/{$note['id']}")->json('data.applications.0');
        $this->deleteJson("/api/payables/credit-notes/{$note['id']}/applications/{$app['id']}")->assertOk()
            ->assertJsonPath('data.status', 'disponible');
        $this->getJson("/api/payables/invoices/{$invoice['id']}")->assertJsonPath('data.status', 'pendiente');
        $this->postJson("/api/inventory/supplier-returns/{$dv['id']}/cancel")->assertOk();
        $this->getJson("/api/payables/credit-notes/{$note['id']}")->assertJsonPath('data.status', 'anulada');
    }

    public function test_statement_summary_and_detail(): void
    {
        [, $receiptId] = $this->receivedOrder();
        $invoice = $this->postJson('/api/payables/invoices', [
            'supplier_invoice_number' => 'FE-1001', 'goods_receipt_ids' => [$receiptId],
            'issue_date' => '2026-08-01', 'due_date' => '2026-08-31',
            'subtotal' => 3000000, 'tax' => 570000,
        ])->json('data');
        $this->postJson('/api/payables/payments', [
            'supplier_id' => $this->supplier->id, 'date' => '2026-09-10', 'method' => 'transferencia', 'amount' => 1000000,
            'allocations' => [['supplier_invoice_id' => $invoice['id'], 'amount' => 1000000]],
        ])->assertCreated();

        $summary = $this->getJson('/api/payables/statement')->assertOk()->json('data');
        $this->assertCount(1, $summary);
        $this->assertEquals(2570000, $summary[0]['balance']);
        $this->assertEquals(2570000, $summary[0]['overdue_balance'], 'vencida desde agosto');

        $detail = $this->getJson('/api/payables/statement/'.$this->supplier->id)->assertOk()->json('data');
        $this->assertEquals(2570000, $detail['totals']['balance']);
        $this->assertCount(1, $detail['invoices']);
        $this->assertTrue($detail['invoices'][0]['is_overdue']);
        $this->assertCount(1, $detail['payments']);

        // Vencidas aparecen en el filtro pseudo-estado.
        $this->getJson('/api/payables/invoices?status=vencida')->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(1, SupplierInvoice::query()->count());
    }

    public function test_tesoreria_has_payables_access_and_bodeguero_does_not(): void
    {
        $teso = User::factory()->create();
        $teso->assignRole('tesoreria');
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($teso);
        $this->getJson('/api/payables/invoices')->assertOk();
        $this->getJson('/api/payables/statement')->assertOk();

        $bodeguero = User::factory()->create();
        $bodeguero->assignRole('bodeguero');
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($bodeguero);
        $this->getJson('/api/payables/invoices')->assertStatus(403);
        $this->postJson('/api/payables/payments', [])->assertStatus(403);
    }
}
