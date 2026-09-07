<?php

namespace App\Services\Purchasing;

use App\Enums\QuotationStatus as S;
use App\Exceptions\DomainException;
use App\Models\PurchaseRequestItem;
use App\Models\Quotation;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class QuotationService
{
    public function save(?Quotation $quotation, array $data, User $user): Quotation
    {
        if ($quotation && ! $quotation->status->isEditable()) {
            throw new DomainException('Solo se pueden editar cotizaciones en borrador o recibidas.');
        }

        return DB::transaction(function () use ($quotation, $data, $user) {
            $attrs = [
                'supplier_id' => $data['supplier_id'],
                'date' => $data['date'],
                'valid_until' => $data['valid_until'] ?? null,
                'notes' => $data['notes'] ?? null,
            ];

            if ($quotation) {
                $quotation->fill($attrs)->save();
            } else {
                $quotation = Quotation::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $products = LineItems::productsFor($data['items']);
            $requestItems = PurchaseRequestItem::query()
                ->with('request')
                ->whereIn('id', collect($data['items'])->pluck('purchase_request_item_id')->filter())
                ->get()->keyBy('id');

            LineItems::sync($quotation->items(), $data['items'], function (array $line) use ($products, $requestItems) {
                $product = $products->get((int) $line['product_id'])
                    ?? throw new DomainException('Producto no encontrado.');
                $factor = LineItems::factorFor($product, (int) $line['unit_id']);

                $reqItemId = $line['purchase_request_item_id'] ?? null;
                if ($reqItemId) {
                    $reqItem = $requestItems->get((int) $reqItemId)
                        ?? throw new DomainException('Ítem de solicitud no encontrado.');
                    if ((int) $reqItem->product_id !== (int) $product->id) {
                        throw new DomainException("El ítem de solicitud no corresponde al producto {$product->sku}.");
                    }
                    if (! $reqItem->request->status->isOpenForPurchasing()) {
                        throw new DomainException("La solicitud {$reqItem->request->number} no está aprobada.");
                    }
                }

                $qty = (float) $line['quantity'];
                $price = (float) $line['unit_price'];

                return [
                    'product_id' => $product->id,
                    'purchase_request_item_id' => $reqItemId,
                    'unit_id' => (int) $line['unit_id'],
                    'factor' => $factor,
                    'quantity' => $qty,
                    'qty_base' => round($qty * $factor, 3),
                    'unit_price' => $price,
                    'tax_rate' => $line['tax_rate'] ?? 0,
                    'line_total' => round($qty * $price, 2),
                    'delivery_days' => $line['delivery_days'] ?? null,
                    'notes' => $line['notes'] ?? null,
                ];
            });

            $quotation->load('items')->recalcTotals();

            return $quotation->refresh();
        });
    }

    public function markReceived(Quotation $quotation): Quotation
    {
        $this->assertStatus($quotation, [S::Borrador], 'marcar como recibida');
        if ($quotation->items()->count() === 0) {
            throw new DomainException('La cotización no tiene ítems.');
        }
        $quotation->forceFill(['status' => S::Recibida])->save();

        return $quotation;
    }

    public function discard(Quotation $quotation): Quotation
    {
        $this->assertStatus($quotation, [S::Borrador, S::Recibida], 'descartar');
        if ($quotation->items()->whereNotNull('purchase_order_item_id')->exists()) {
            throw new DomainException('No se puede descartar: tiene ítems ya convertidos en orden de compra.');
        }

        return DB::transaction(function () use ($quotation) {
            $quotation->items()->update(['is_selected' => false]);
            $quotation->forceFill(['status' => S::Descartada])->save();

            return $quotation;
        });
    }

    public function delete(Quotation $quotation): void
    {
        $this->assertStatus($quotation, [S::Borrador], 'eliminar');
        $quotation->delete();
    }

    private function assertStatus(Quotation $quotation, array $allowed, string $action): void
    {
        if (! in_array($quotation->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una cotización en estado \"{$quotation->status->label()}\".");
        }
    }
}
