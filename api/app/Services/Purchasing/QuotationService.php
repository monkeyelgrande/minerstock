<?php

namespace App\Services\Purchasing;

use App\Enums\QuotationStatus as S;
use App\Exceptions\DomainException;
use App\Models\PurchaseRequestItem;
use App\Models\Quotation;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class QuotationService
{
    /**
     * Crea o actualiza una cotización. Los precios son opcionales mientras se arma la
     * solicitud (RFQ): se envía al proveedor sin precios y estos se registran al responder.
     */
    public function save(?Quotation $quotation, array $data, User $user): Quotation
    {
        if ($quotation && ! $quotation->status->isEditable()) {
            throw new DomainException('Solo se pueden editar cotizaciones en borrador o con respuesta recibida.');
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
                $price = isset($line['unit_price']) && $line['unit_price'] !== null && $line['unit_price'] !== '' ? (float) $line['unit_price'] : null;
                $notQuoted = (bool) ($line['not_quoted'] ?? false);

                return [
                    'product_id' => $product->id,
                    'purchase_request_item_id' => $reqItemId,
                    'unit_id' => (int) $line['unit_id'],
                    'factor' => $factor,
                    'quantity' => $qty,
                    'qty_base' => round($qty * $factor, 3),
                    'unit_price' => $notQuoted ? null : $price,
                    'tax_rate' => $line['tax_rate'] ?? 0,
                    'line_total' => $price !== null && ! $notQuoted ? round($qty * $price, 2) : 0,
                    'delivery_days' => $line['delivery_days'] ?? null,
                    'notes' => $line['notes'] ?? null,
                    'not_quoted' => $notQuoted,
                ];
            });

            $quotation->load('items')->recalcTotals();

            return $quotation->refresh();
        });
    }

    /**
     * Marca la solicitud como enviada al proveedor y, opcionalmente, la duplica
     * (mismos ítems, sin precios) para otros proveedores, también como enviadas.
     *
     * @param  int[]  $additionalSupplierIds
     * @return Collection<int, Quotation> todas las cotizaciones enviadas (la original primero)
     */
    public function send(Quotation $quotation, array $additionalSupplierIds, User $user): Collection
    {
        $this->assertStatus($quotation, [S::Borrador], 'enviar');
        if ($quotation->items()->count() === 0) {
            throw new DomainException('La cotización no tiene ítems.');
        }

        $additionalSupplierIds = collect($additionalSupplierIds)
            ->map(fn ($id) => (int) $id)->unique()
            ->reject(fn ($id) => $id === (int) $quotation->supplier_id)
            ->values();

        return DB::transaction(function () use ($quotation, $additionalSupplierIds, $user) {
            $quotation->forceFill(['status' => S::Enviada, 'sent_at' => now()])->save();
            $sent = collect([$quotation]);

            foreach ($additionalSupplierIds as $supplierId) {
                $copy = Quotation::query()->create([
                    'supplier_id' => $supplierId,
                    'date' => $quotation->date?->format('Y-m-d'),
                    'valid_until' => $quotation->valid_until?->format('Y-m-d'),
                    'notes' => $quotation->notes,
                    'created_by' => $user->id,
                    'status' => S::Enviada,
                    'sent_at' => now(),
                ]);
                foreach ($quotation->items as $item) {
                    $copy->items()->create([
                        'product_id' => $item->product_id,
                        'purchase_request_item_id' => $item->purchase_request_item_id,
                        'unit_id' => $item->unit_id,
                        'factor' => $item->factor,
                        'quantity' => $item->quantity,
                        'qty_base' => $item->qty_base,
                        'unit_price' => null,
                        'tax_rate' => 0,
                        'line_total' => 0,
                        'delivery_days' => null,
                        'notes' => $item->notes,
                        'sort_order' => $item->sort_order,
                    ]);
                }
                $sent->push($copy);
            }

            return $sent;
        });
    }

    /**
     * Registra la respuesta del proveedor: precios por ítem o marca "no cotizó".
     * Al menos un ítem debe quedar con precio. Pasa la cotización a "recibida".
     *
     * @param  array<int, array{id:int, unit_price?:float|null, tax_rate?:float, delivery_days?:int|null, not_quoted?:bool}>  $lines
     */
    public function registerResponse(Quotation $quotation, array $lines, ?string $validUntil, User $user): Quotation
    {
        if (! $quotation->status->canRespond()) {
            throw new DomainException("No se puede registrar la respuesta de una cotización en estado \"{$quotation->status->label()}\".");
        }

        return DB::transaction(function () use ($quotation, $lines, $validUntil) {
            $items = $quotation->items()->get()->keyBy('id');

            foreach ($lines as $line) {
                $item = $items->get((int) $line['id'])
                    ?? throw new DomainException('El ítem no pertenece a la cotización.');
                $notQuoted = (bool) ($line['not_quoted'] ?? false);
                $price = isset($line['unit_price']) && $line['unit_price'] !== null && $line['unit_price'] !== '' ? (float) $line['unit_price'] : null;

                if (! $notQuoted && ($price === null || $price < 0)) {
                    throw new DomainException("Indica el precio de {$item->product->name} o márcalo como no cotizado.");
                }

                $item->fill([
                    'unit_price' => $notQuoted ? null : $price,
                    'tax_rate' => $line['tax_rate'] ?? $item->tax_rate,
                    'delivery_days' => $line['delivery_days'] ?? null,
                    'line_total' => $notQuoted ? 0 : round((float) $item->quantity * $price, 2),
                    'not_quoted' => $notQuoted,
                ])->save();
            }

            $quotation->refresh();
            if ($quotation->items()->where('not_quoted', false)->whereNotNull('unit_price')->count() === 0) {
                throw new DomainException('El proveedor no cotizó ningún ítem. Si no hubo respuesta útil, descarta la cotización.');
            }

            if ($validUntil !== null) {
                $quotation->forceFill(['valid_until' => $validUntil])->save();
            }
            $quotation->forceFill(['status' => S::Recibida])->save();
            $quotation->load('items')->recalcTotals();

            return $quotation->refresh();
        });
    }

    /** Paso directo borrador → recibida (cuando el comprador ya tiene los precios). */
    public function markReceived(Quotation $quotation): Quotation
    {
        $this->assertStatus($quotation, [S::Borrador], 'marcar como recibida');
        if ($quotation->items()->count() === 0) {
            throw new DomainException('La cotización no tiene ítems.');
        }
        if ($quotation->items()->where('not_quoted', false)->whereNull('unit_price')->exists()) {
            throw new DomainException('Hay ítems sin precio. Complétalos, márcalos como no cotizados o envía primero la solicitud al proveedor.');
        }
        if ($quotation->items()->where('not_quoted', false)->whereNotNull('unit_price')->count() === 0) {
            throw new DomainException('Todos los ítems están marcados como no cotizados.');
        }
        $quotation->forceFill(['status' => S::Recibida])->save();

        return $quotation;
    }

    /** Descartar: también cubre las solicitudes enviadas que nunca tuvieron respuesta. */
    public function discard(Quotation $quotation): Quotation
    {
        $this->assertStatus($quotation, [S::Borrador, S::Enviada, S::Recibida], 'descartar');
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
