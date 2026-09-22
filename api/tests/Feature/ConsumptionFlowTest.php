<?php

namespace Tests\Feature;

use App\Models\CostCenter;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\Recipient;
use App\Models\Site;
use App\Models\StockBalance;
use App\Models\StockMovement;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsumptionFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Warehouse $mina;

    private Product $acpm;      // consumible, base GAL, alterna TAMBOR x55

    private Product $pala;      // retornable

    private Recipient $obrero;

    private CostCenter $cc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();
        Sanctum::actingAs($this->admin);

        $site = Site::query()->create(['name' => 'Mina Norte', 'type' => 'mina']);
        $this->mina = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'MN', 'name' => 'Bodega Mina Norte']);
        $this->cc = CostCenter::query()->create(['code' => 'EXT', 'name' => 'Extracción']);

        $gal = Unit::query()->where('code', 'GAL')->firstOrFail();
        $und = Unit::query()->where('code', 'UND')->firstOrFail();
        $tambor = Unit::query()->create(['code' => 'TAMBOR', 'name' => 'Tambor', 'allows_decimals' => false]);

        $this->acpm = Product::query()->create(['sku' => 'ACPM', 'name' => 'ACPM', 'base_unit_id' => $gal->id, 'kind' => 'consumible']);
        ProductUnit::query()->create(['product_id' => $this->acpm->id, 'unit_id' => $tambor->id, 'factor' => 55]);
        $this->pala = Product::query()->create(['sku' => 'PAL', 'name' => 'Pala', 'base_unit_id' => $und->id, 'kind' => 'retornable']);

        $this->obrero = Recipient::query()->create([
            'type' => 'persona', 'name' => 'Pedro Rojas', 'document_number' => '1098765', 'cost_center_id' => $this->cc->id,
        ]);

        // Stock: 110 GAL de ACPM a $10.000 y 10 palas a $50.000.
        $adj = $this->postJson('/api/inventory/adjustments', [
            'warehouse_id' => $this->mina->id, 'date' => '2026-09-08', 'reason' => 'inventario_inicial',
            'items' => [
                ['product_id' => $this->acpm->id, 'qty_base' => 110, 'unit_cost' => 10000],
                ['product_id' => $this->pala->id, 'qty_base' => 10, 'unit_cost' => 50000],
            ],
        ])->json('data');
        $this->postJson("/api/inventory/adjustments/{$adj['id']}/confirm")->assertOk();
    }

    private function balance(Product $product): float
    {
        return (float) (StockBalance::query()->where('warehouse_id', $this->mina->id)->where('product_id', $product->id)->value('qty') ?? 0);
    }

    public function test_issue_confirm_discharges_stock_at_average_cost(): void
    {
        // Borrador con conversión de unidad (1 tambor = 55 GAL) y centro de costo del receptor por defecto.
        $issue = $this->postJson('/api/consumption/issues', [
            'warehouse_id' => $this->mina->id, 'recipient_id' => $this->obrero->id, 'date' => '2026-09-08',
            'items' => [
                ['product_id' => $this->acpm->id, 'unit_id' => $this->acpm->units()->first()->unit_id, 'quantity' => 1],
                ['product_id' => $this->acpm->id, 'unit_id' => $this->acpm->base_unit_id, 'quantity' => 5],
            ],
        ])->assertCreated()->json('data');

        $this->assertSame('borrador', $issue['status']);
        $this->assertEquals($this->cc->id, $issue['cost_center_id']);
        $this->assertEquals(60, collect($issue['items'])->sum('qty_base'));
        $this->assertEquals(110, $this->balance($this->acpm)); // borrador no mueve stock

        $confirmed = $this->postJson("/api/consumption/issues/{$issue['id']}/confirm")->assertOk()->json('data');
        $this->assertSame('confirmado', $confirmed['status']);
        $this->assertEquals(10000, $confirmed['items'][0]['unit_cost']);
        $this->assertEquals(600000, $confirmed['total']);
        $this->assertEquals(50, $this->balance($this->acpm));
        $this->assertSame(2, StockMovement::query()->where('type', 'entrega_salida')->count());

        // PDF disponible.
        $this->get("/api/consumption/issues/{$issue['id']}/pdf")->assertOk()->assertHeader('content-type', 'application/pdf');

        // Anular reversa el kardex.
        $this->postJson("/api/consumption/issues/{$issue['id']}/cancel")->assertOk();
        $this->assertEquals(110, $this->balance($this->acpm));
    }

    public function test_issue_requires_stock(): void
    {
        $issue = $this->postJson('/api/consumption/issues', [
            'warehouse_id' => $this->mina->id, 'recipient_id' => $this->obrero->id, 'date' => '2026-09-08',
            'items' => [['product_id' => $this->acpm->id, 'unit_id' => $this->acpm->base_unit_id, 'quantity' => 500]],
        ])->json('data');

        $this->postJson("/api/consumption/issues/{$issue['id']}/confirm")
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Stock insuficiente'));
        $this->assertEquals(110, $this->balance($this->acpm));
    }

    public function test_loan_lifecycle_with_partial_damaged_and_lost_returns(): void
    {
        // Solo productos retornables.
        $this->postJson('/api/consumption/loans', [
            'warehouse_id' => $this->mina->id, 'recipient_id' => $this->obrero->id, 'loaned_at' => '2026-09-08',
            'items' => [['product_id' => $this->acpm->id, 'qty_base' => 1]],
        ])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'retornables'));

        $loan = $this->postJson('/api/consumption/loans', [
            'warehouse_id' => $this->mina->id, 'recipient_id' => $this->obrero->id,
            'loaned_at' => '2026-08-20', 'expected_return_at' => '2026-09-01', // ya vencido
            'items' => [['product_id' => $this->pala->id, 'qty_base' => 5]],
        ])->assertCreated()->json('data');
        $this->assertSame('borrador', $loan['status']);

        $open = $this->postJson("/api/consumption/loans/{$loan['id']}/confirm")->assertOk()->json('data');
        $this->assertSame('abierto', $open['status']);
        $this->assertTrue($open['is_overdue']);
        $this->assertEquals(50000, $open['items'][0]['unit_cost']);
        $this->assertEquals(5, $this->balance($this->pala));

        // Vencidos y herramientas por persona.
        $this->getJson('/api/consumption/loans?overdue=1')->assertOk()->assertJsonCount(1, 'data');
        $holdings = $this->getJson('/api/consumption/loans/holdings')->assertOk()->json('data');
        $this->assertCount(1, $holdings);
        $this->assertEquals('Pedro Rojas', $holdings[0]['recipient']['name']);
        $this->assertEquals(5, $holdings[0]['items'][0]['qty_base']);
        $this->assertTrue($holdings[0]['has_overdue']);

        // La matriz de stock reporta lo prestado.
        $this->getJson('/api/inventory/stock')->assertOk()
            ->assertJsonPath('totals.on_loan_count', 1);

        // Devolución 1: 2 buenas + 1 dañada.
        $itemId = $open['items'][0]['id'];
        $partial = $this->postJson("/api/consumption/loans/{$loan['id']}/returns", [
            'returned_at' => '2026-09-08',
            'items' => [
                ['loan_item_id' => $itemId, 'qty_base' => 2, 'condition' => 'bueno'],
                ['loan_item_id' => $itemId, 'qty_base' => 1, 'condition' => 'dañado', 'notes' => 'mango roto'],
            ],
        ])->assertOk()->json('data');

        $this->assertSame('parcial', $partial['status']);
        $this->assertEquals(2, $partial['items'][0]['qty_returned_base']);
        $this->assertEquals(1, $partial['items'][0]['qty_damaged_base']);
        $this->assertEquals(2, $partial['items'][0]['outstanding_base']);
        // Buenas entran (+2), dañada entra y sale por ajuste automático (+1 −1) → 7.
        $this->assertEquals(7, $this->balance($this->pala));
        $this->assertSame(1, StockMovement::query()->where('type', 'ajuste_salida')->count());
        $this->getJson('/api/inventory/adjustments?reason=devolucion_prestamo_danada')->assertOk()->assertJsonCount(1, 'data');

        // Devolver más de lo prestado falla.
        $this->postJson("/api/consumption/loans/{$loan['id']}/returns", [
            'returned_at' => '2026-09-08',
            'items' => [['loan_item_id' => $itemId, 'qty_base' => 5, 'condition' => 'bueno']],
        ])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'supera lo prestado'));

        // Devolución 2: 1 buena + 1 perdida → cierre con pérdida.
        $closed = $this->postJson("/api/consumption/loans/{$loan['id']}/returns", [
            'returned_at' => '2026-09-09',
            'items' => [
                ['loan_item_id' => $itemId, 'qty_base' => 1, 'condition' => 'bueno'],
                ['loan_item_id' => $itemId, 'qty_base' => 1, 'condition' => 'perdido'],
            ],
        ])->assertOk()->json('data');

        $this->assertSame('cerrado_con_perdida', $closed['status']);
        $this->assertEquals(0, $closed['items'][0]['outstanding_base']);
        $this->assertEquals(8, $this->balance($this->pala)); // la perdida no reingresa
        $this->assertCount(2, $closed['returns']);

        // Cerrado: no acepta más devoluciones ni anulación.
        $this->postJson("/api/consumption/loans/{$loan['id']}/returns", [
            'returned_at' => '2026-09-10',
            'items' => [['loan_item_id' => $itemId, 'qty_base' => 1, 'condition' => 'bueno']],
        ])->assertStatus(422);

        $this->get("/api/consumption/loans/{$loan['id']}/pdf")->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_loan_cancel_reverses_stock_only_without_returns(): void
    {
        $loan = $this->postJson('/api/consumption/loans', [
            'warehouse_id' => $this->mina->id, 'recipient_id' => $this->obrero->id, 'loaned_at' => '2026-09-08',
            'items' => [['product_id' => $this->pala->id, 'qty_base' => 4]],
        ])->json('data');
        $this->postJson("/api/consumption/loans/{$loan['id']}/confirm")->assertOk();
        $this->assertEquals(6, $this->balance($this->pala));

        // Con devolución registrada no se puede anular.
        $itemId = $this->getJson("/api/consumption/loans/{$loan['id']}")->json('data.items.0.id');
        $this->postJson("/api/consumption/loans/{$loan['id']}/returns", [
            'returned_at' => '2026-09-09',
            'items' => [['loan_item_id' => $itemId, 'qty_base' => 1, 'condition' => 'bueno']],
        ])->assertOk();
        $this->postJson("/api/consumption/loans/{$loan['id']}/cancel")->assertStatus(422);

        // Otro préstamo sin devoluciones sí se anula y reversa.
        $loan2 = $this->postJson('/api/consumption/loans', [
            'warehouse_id' => $this->mina->id, 'recipient_id' => $this->obrero->id, 'loaned_at' => '2026-09-08',
            'items' => [['product_id' => $this->pala->id, 'qty_base' => 2]],
        ])->json('data');
        $this->postJson("/api/consumption/loans/{$loan2['id']}/confirm")->assertOk();
        $this->assertEquals(5, $this->balance($this->pala));
        $this->postJson("/api/consumption/loans/{$loan2['id']}/cancel")->assertOk()->assertJsonPath('data.status', 'anulado');
        $this->assertEquals(7, $this->balance($this->pala));
    }

    public function test_consumption_requires_permissions_and_warehouse_visibility(): void
    {
        // Tesorería no tiene permisos de consumo.
        $tesoreria = User::query()->create(['name' => 'Tesorería', 'username' => 'teso', 'email' => 'teso@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $tesoreria->syncRoles(['tesoreria']);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($tesoreria);
        $this->getJson('/api/consumption/issues')->assertForbidden();
        $this->postJson('/api/consumption/loans', [])->assertForbidden();

        // El bodeguero solo ve vales de sus bodegas asignadas (no tiene la mina asignada).
        $bodeguero = User::query()->create(['name' => 'Bodeguero', 'username' => 'bode', 'email' => 'bode@minerstock.local', 'password' => 'password', 'is_active' => true]);
        $bodeguero->syncRoles(['bodeguero']);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($bodeguero);
        $this->getJson('/api/consumption/issues')->assertOk()->assertJsonCount(0, 'data');
    }
}
