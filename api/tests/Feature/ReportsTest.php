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

class ReportsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Warehouse $bodega;

    private Product $cemento;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();
        Sanctum::actingAs($this->admin);

        $site = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        $this->bodega = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);
        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $this->cemento = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);

        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->bodega->id, 'date' => '2026-11-10', 'reason' => 'inventario_inicial',
            'items' => [['product_id' => $this->cemento->id, 'qty_base' => 40, 'unit_cost' => 30000]],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();
    }

    public function test_catalog_lists_all_reports_and_requires_permission(): void
    {
        $this->getJson('/api/reports')->assertOk()->assertJsonCount(9, 'data.reports');

        $solicitante = User::query()->create(['name' => 'Soli', 'username' => 'soli', 'email' => 'soli@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $solicitante->syncRoles(['solicitante']);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($solicitante);
        $this->getJson('/api/reports')->assertForbidden();
        $this->getJson('/api/reports/inventario')->assertForbidden();
    }

    public function test_inventory_and_kardex_reports_return_valued_rows(): void
    {
        $inv = $this->getJson('/api/reports/inventario')->assertOk()->json('data');
        $this->assertSame('Inventario valorizado', $inv['title']);
        $this->assertCount(1, $inv['rows']);
        $this->assertEquals(1200000, $inv['totals']['valor']); // 40 × 30.000
        $this->assertEquals(40, $inv['rows'][0]['cantidad']);

        $kardex = $this->getJson("/api/reports/kardex?warehouse_id={$this->bodega->id}")->assertOk()->json('data');
        $this->assertCount(1, $kardex['rows']);
        $this->assertEquals(40, $kardex['totals']['entrada']);
        $this->assertStringContainsString('AJ-', $kardex['rows'][0]['documento']);
    }

    public function test_reports_export_to_xlsx_and_pdf(): void
    {
        $this->get('/api/reports/inventario?export=xlsx')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->get('/api/reports/inventario?export=pdf')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_cartera_report_buckets_overdue_balances(): void
    {
        $supplier = Supplier::query()->create(['name' => 'Acme', 'document_number' => '900123', 'payment_terms_days' => 30]);
        SupplierInvoice::query()->create([
            'supplier_invoice_number' => 'FE-1', 'supplier_id' => $supplier->id,
            'issue_date' => today()->subDays(60), 'due_date' => today()->subDays(45),
            'subtotal' => 100000, 'tax' => 19000, 'withholding' => 0, 'total' => 119000,
            'paid_amount' => 19000, 'credited_amount' => 0, 'status' => 'parcial', 'created_by' => $this->admin->id,
        ]);

        $data = $this->getJson('/api/reports/cartera')->assertOk()->json('data');
        $this->assertCount(1, $data['rows']);
        $this->assertEquals(100000, $data['rows'][0]['saldo']);
        $this->assertEquals(45, $data['rows'][0]['dias_vencida']);
        $this->assertEquals(100000, $data['totals']['vencida_31_a_60_días']);
        $this->assertEquals(0, $data['totals']['corriente']);
    }

    public function test_global_search_finds_documents_and_products(): void
    {
        $groups = $this->getJson('/api/search?q=CEM')->assertOk()->json('data');
        $product = collect($groups)->firstWhere('type', 'product');
        $this->assertNotNull($product);
        $this->assertSame('Cemento', $product['items'][0]['title']);

        $groups = $this->getJson('/api/search?q=AJ-00001')->assertOk()->json('data');
        $this->assertSame('adjustment', $groups[0]['type']);

        // Sin permiso de ajustes no aparece el grupo.
        $teso = User::query()->create(['name' => 'Teso', 'username' => 'teso', 'email' => 'teso@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $teso->syncRoles(['tesoreria']);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($teso);
        $this->assertEmpty($this->getJson('/api/search?q=AJ-00001')->assertOk()->json('data'));
    }

    public function test_activity_log_is_admin_only_and_records_changes(): void
    {
        $data = $this->getJson('/api/admin/activity?subject_type=Adjustment')->assertOk()->json();
        $this->assertNotEmpty($data['data']);
        $this->assertSame('Adjustment', $data['data'][0]['subject_type']);
        $this->assertSame('Administrador', $data['data'][0]['causer']['name']);

        $consulta = User::query()->create(['name' => 'Con', 'username' => 'con', 'email' => 'con@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $consulta->syncRoles(['consulta']);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($consulta);
        $this->getJson('/api/admin/activity')->assertForbidden();
    }
}
