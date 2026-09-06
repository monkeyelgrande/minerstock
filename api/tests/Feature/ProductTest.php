<?php

namespace Tests\Feature;

use App\Models\DocumentSequence;
use App\Models\Product;
use App\Models\Site;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $admin = User::query()->where('email', 'admin@minerstock.local')->firstOrFail();
        Sanctum::actingAs($admin);
    }

    public function test_product_is_created_with_alternate_units_and_warehouse_settings(): void
    {
        $und = Unit::query()->where('code', 'UND')->firstOrFail();
        $caja = Unit::query()->where('code', 'CAJA')->firstOrFail();
        $site = Site::query()->create(['name' => 'Mina', 'type' => 'mina']);
        $wh = Warehouse::query()->create(['site_id' => $site->id, 'code' => 'B1', 'name' => 'Bodega 1']);

        $res = $this->postJson('/api/catalog/products', [
            'sku' => 'GUA-01',
            'name' => 'Guantes',
            'base_unit_id' => $und->id,
            'kind' => 'consumible',
            'default_min_stock' => 10,
            'units' => [['unit_id' => $caja->id, 'factor' => 12, 'is_default_purchase' => true]],
            'warehouse_settings' => [['warehouse_id' => $wh->id, 'min_stock' => 5, 'max_stock' => 50]],
        ]);

        $res->assertCreated()
            ->assertJsonPath('data.units.0.unit.code', 'CAJA')
            ->assertJsonPath('data.units.0.factor', 12)
            ->assertJsonPath('data.warehouse_settings.0.min_stock', 5);

        $product = Product::query()->where('sku', 'GUA-01')->firstOrFail();
        $this->assertSame(12.0, $product->factorFor($caja->id));
        $this->assertSame(1.0, $product->factorFor($und->id));
        $this->assertNull($product->factorFor(999));
    }

    public function test_alternate_unit_cannot_equal_base_unit(): void
    {
        $und = Unit::query()->where('code', 'UND')->firstOrFail();

        $this->postJson('/api/catalog/products', [
            'sku' => 'X-1',
            'name' => 'X',
            'base_unit_id' => $und->id,
            'kind' => 'consumible',
            'units' => [['unit_id' => $und->id, 'factor' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors(['units.0.unit_id']);
    }

    public function test_updating_units_replaces_the_set(): void
    {
        $und = Unit::query()->where('code', 'UND')->firstOrFail();
        $caja = Unit::query()->where('code', 'CAJA')->firstOrFail();
        $paq = Unit::query()->where('code', 'PAQ')->firstOrFail();

        $id = $this->postJson('/api/catalog/products', [
            'sku' => 'P-1', 'name' => 'P', 'base_unit_id' => $und->id, 'kind' => 'consumible',
            'units' => [['unit_id' => $caja->id, 'factor' => 12]],
        ])->json('data.id');

        $this->putJson("/api/catalog/products/{$id}", [
            'sku' => 'P-1', 'name' => 'P', 'base_unit_id' => $und->id, 'kind' => 'retornable',
            'units' => [['unit_id' => $paq->id, 'factor' => 6]],
        ])->assertOk()
            ->assertJsonCount(1, 'data.units')
            ->assertJsonPath('data.units.0.unit.code', 'PAQ')
            ->assertJsonPath('data.kind', 'retornable');
    }

    public function test_document_sequence_generates_padded_consecutives(): void
    {
        $this->assertSame('OC-00001', DocumentSequence::next('OC'));
        $this->assertSame('OC-00002', DocumentSequence::next('OC'));
        $this->assertSame('SC-00001', DocumentSequence::next('SC'));
        $this->assertSame(3, DocumentSequence::query()->where('doc_type', 'OC')->value('next_number'));
    }
}
