<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Site;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Flujo de solicitud de cotización (RFQ): enviar sin precios y registrar la respuesta. */
class QuotationRfqTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplierA;

    private Supplier $supplierB;

    private Supplier $supplierC;

    private Product $cement;

    private Product $nails;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Sanctum::actingAs(User::query()->where('email', 'admin@minerstock.local')->firstOrFail());

        $site = Site::query()->create(['name' => 'Municipio', 'type' => 'municipio']);
        Warehouse::query()->create(['site_id' => $site->id, 'code' => 'BM', 'name' => 'Bodega Municipio']);
        $bulto = Unit::query()->where('code', 'BULTO')->firstOrFail();
        $kg = Unit::query()->where('code', 'KG')->firstOrFail();
        $this->cement = Product::query()->create(['sku' => 'CEM', 'name' => 'Cemento', 'base_unit_id' => $bulto->id, 'kind' => 'consumible']);
        $this->nails = Product::query()->create(['sku' => 'PUN', 'name' => 'Puntilla', 'base_unit_id' => $kg->id, 'kind' => 'consumible']);
        $this->supplierA = Supplier::query()->create(['document_number' => 'A', 'name' => 'Proveedor A']);
        $this->supplierB = Supplier::query()->create(['document_number' => 'B', 'name' => 'Proveedor B']);
        $this->supplierC = Supplier::query()->create(['document_number' => 'C', 'name' => 'Proveedor C']);
    }

    private function draftWithoutPrices(): array
    {
        return $this->postJson('/api/purchasing/quotations', [
            'supplier_id' => $this->supplierA->id, 'date' => '2026-09-10',
            'items' => [
                ['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 100],
                ['product_id' => $this->nails->id, 'unit_id' => $this->nails->base_unit_id, 'quantity' => 50],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.status', 'borrador')
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('data.items.0.unit_price', null)
            ->json('data');
    }

    public function test_send_to_multiple_suppliers_duplicates_the_request(): void
    {
        $q = $this->draftWithoutPrices();

        // El PDF de la solicitud está disponible desde borrador.
        $pdf = $this->get("/api/purchasing/quotations/{$q['id']}/pdf");
        $pdf->assertOk();
        $this->assertStringStartsWith('%PDF', $pdf->getContent());

        $res = $this->postJson("/api/purchasing/quotations/{$q['id']}/send", [
            'additional_supplier_ids' => [$this->supplierB->id, $this->supplierC->id, $this->supplierA->id],
        ])->assertOk();

        $sent = $res->json('data');
        $this->assertCount(3, $sent, 'la original + 2 copias (el proveedor propio se ignora)');
        $this->assertSame('enviada', $sent[0]['status']);
        $this->assertNotNull($sent[0]['sent_at']);
        $suppliers = array_column($sent, 'supplier_id');
        $this->assertEqualsCanonicalizing([$this->supplierA->id, $this->supplierB->id, $this->supplierC->id], $suppliers);
        $this->assertCount(2, $sent[1]['items']);
        $this->assertNull($sent[1]['items'][0]['unit_price']);

        // Una enviada no se puede editar ni reenviar; sin precios no entra a la comparativa.
        $this->putJson("/api/purchasing/quotations/{$q['id']}", [
            'supplier_id' => $this->supplierA->id, 'date' => '2026-09-10',
            'items' => [['product_id' => $this->cement->id, 'unit_id' => $this->cement->base_unit_id, 'quantity' => 1]],
        ])->assertStatus(422);
        $this->postJson("/api/purchasing/quotations/{$q['id']}/send")->assertStatus(422);
        $this->getJson('/api/purchasing/comparison')->assertOk()->assertJsonCount(0, 'data.rows');
    }

    public function test_register_response_with_partial_quote(): void
    {
        $q = $this->draftWithoutPrices();
        $this->postJson("/api/purchasing/quotations/{$q['id']}/send")->assertOk();
        $items = $this->getJson("/api/purchasing/quotations/{$q['id']}")->json('data.items');

        // Sin precio y sin marcar "no cotizó" → error.
        $this->postJson("/api/purchasing/quotations/{$q['id']}/respond", [
            'items' => [['id' => $items[0]['id']]],
        ])->assertStatus(422);

        // El proveedor cotiza el cemento y no maneja la puntilla.
        $q2 = $this->postJson("/api/purchasing/quotations/{$q['id']}/respond", [
            'valid_until' => '2026-12-31',
            'items' => [
                ['id' => $items[0]['id'], 'unit_price' => 30000, 'tax_rate' => 19, 'delivery_days' => 3],
                ['id' => $items[1]['id'], 'not_quoted' => true],
            ],
        ])->assertOk()
            ->assertJsonPath('data.status', 'recibida')
            ->assertJsonPath('data.subtotal', 3000000)
            ->assertJsonPath('data.valid_until', '2026-12-31')
            ->json('data');

        $notQuoted = collect($q2['items'])->firstWhere('not_quoted', true);
        $this->assertNull($notQuoted['unit_price']);
        $this->assertNull($notQuoted['base_price']);

        // La comparativa solo muestra el ítem cotizado.
        $matrix = $this->getJson('/api/purchasing/comparison')->assertOk()->json('data');
        $this->assertCount(1, $matrix['rows']);
        $this->assertSame('CEM', $matrix['rows'][0]['product']['sku']);
    }

    public function test_response_with_nothing_quoted_fails_and_discard_covers_no_response(): void
    {
        $q = $this->draftWithoutPrices();
        $this->postJson("/api/purchasing/quotations/{$q['id']}/send")->assertOk();
        $items = $this->getJson("/api/purchasing/quotations/{$q['id']}")->json('data.items');

        $this->postJson("/api/purchasing/quotations/{$q['id']}/respond", [
            'items' => [
                ['id' => $items[0]['id'], 'not_quoted' => true],
                ['id' => $items[1]['id'], 'not_quoted' => true],
            ],
        ])->assertStatus(422);

        // El proveedor nunca respondió: se descarta.
        $this->postJson("/api/purchasing/quotations/{$q['id']}/discard")->assertOk()->assertJsonPath('data.status', 'descartada');
    }

    public function test_mark_received_requires_prices(): void
    {
        $q = $this->draftWithoutPrices();
        $this->postJson("/api/purchasing/quotations/{$q['id']}/receive")->assertStatus(422);
    }
}
