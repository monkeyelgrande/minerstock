<?php

namespace App\Services\Purchasing;

use App\Enums\QuotationStatus;
use App\Exceptions\DomainException;
use App\Models\PurchaseOrder;
use App\Models\QuotationItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Comparativa de cotizaciones: matriz producto × proveedor, selección del ganador
 * por ítem y generación de órdenes de compra por proveedor.
 */
class ComparisonService
{
    public function __construct(private readonly PurchaseOrderService $orders) {}

    /** Ítems de cotización comparables (cotización recibida/seleccionada, aún sin OC). */
    private function comparableItems(array $filters): Builder
    {
        $query = QuotationItem::query()
            ->with(['quotation.supplier', 'product.baseUnit', 'unit', 'requestItem.request'])
            ->whereNull('purchase_order_item_id')
            ->whereHas('quotation', fn (Builder $q) => $q->whereIn('status', [QuotationStatus::Recibida->value, QuotationStatus::Seleccionada->value]));

        if (! empty($filters['request_ids'])) {
            $query->whereHas('requestItem', fn (Builder $q) => $q->whereIn('purchase_request_id', $filters['request_ids']));
        }
        if (! empty($filters['product_id'])) {
            $query->where('product_id', $filters['product_id']);
        }
        if (! empty($filters['supplier_id'])) {
            $query->whereHas('quotation', fn (Builder $q) => $q->where('supplier_id', $filters['supplier_id']));
        }
        if (! empty($filters['quotation_id'])) {
            $query->where('quotation_id', $filters['quotation_id']);
        }
        if (! empty($filters['only_valid'])) {
            $query->whereHas('quotation', fn (Builder $q) => $q->where(fn ($w) => $w->whereNull('valid_until')->orWhereDate('valid_until', '>=', today())));
        }

        return $query;
    }

    /**
     * @return array{suppliers: array, rows: array}
     */
    public function matrix(array $filters): array
    {
        $items = $this->comparableItems($filters)->get();

        // Filas ya decididas (algún competidor de la misma fila ya tiene OC) se excluyen:
        // las ofertas perdedoras no deben volver a compararse.
        $decided = QuotationItem::query()->whereNotNull('purchase_order_item_id')
            ->get(['product_id', 'purchase_request_item_id'])
            ->map(fn (QuotationItem $i) => $i->product_id.':'.($i->purchase_request_item_id ?? 0))
            ->unique()->flip();
        $items = $items->reject(fn (QuotationItem $i) => $decided->has($i->product_id.':'.($i->purchase_request_item_id ?? 0)));

        $suppliers = $items->map(fn (QuotationItem $i) => [
            'id' => $i->quotation->supplier_id,
            'name' => $i->quotation->supplier->name,
        ])->unique('id')->sortBy('name')->values();

        // Agrupamos por producto + ítem de solicitud (para que dos solicitudes del mismo producto no se mezclen).
        $rows = $items->groupBy(fn (QuotationItem $i) => $i->product_id.':'.($i->purchase_request_item_id ?? 0))
            ->map(function (Collection $group) {
                /** @var QuotationItem $first */
                $first = $group->first();
                $best = $group->min(fn (QuotationItem $i) => $i->basePrice());
                $reqItem = $first->requestItem;

                $offers = $group->map(fn (QuotationItem $i) => [
                    'quotation_item_id' => $i->id,
                    'quotation_id' => $i->quotation_id,
                    'quotation_number' => $i->quotation->number,
                    'supplier_id' => $i->quotation->supplier_id,
                    'valid_until' => $i->quotation->valid_until?->format('Y-m-d'),
                    'unit' => $i->unit->code,
                    'factor' => (float) $i->factor,
                    'quantity' => (float) $i->quantity,
                    'qty_base' => (float) $i->qty_base,
                    'unit_price' => (float) $i->unit_price,
                    'base_price' => $i->basePrice(),
                    'tax_rate' => (float) $i->tax_rate,
                    'line_total' => (float) $i->line_total,
                    'delivery_days' => $i->delivery_days,
                    'is_selected' => $i->is_selected,
                    'is_best' => abs($i->basePrice() - $best) < 0.00001,
                ])->values();

                return [
                    'key' => $first->product_id.':'.($first->purchase_request_item_id ?? 0),
                    'product' => [
                        'id' => $first->product->id,
                        'sku' => $first->product->sku,
                        'name' => $first->product->name,
                        'base_unit' => $first->product->baseUnit->code,
                    ],
                    'request' => $reqItem ? [
                        'id' => $reqItem->purchase_request_id,
                        'number' => $reqItem->request->number,
                        'item_id' => $reqItem->id,
                        'qty_base' => (float) $reqItem->qty_base,
                        'pending_base' => $reqItem->pendingToOrderBase(),
                    ] : null,
                    'selected_quotation_item_id' => $group->firstWhere('is_selected', true)?->id,
                    'offers' => $offers,
                ];
            })
            ->sortBy('product.name')->values();

        return ['suppliers' => $suppliers->all(), 'rows' => $rows->all()];
    }

    /**
     * Marca/desmarca ganadores. Al seleccionar un ítem se desmarcan los demás de la misma fila.
     *
     * @param  array<int, array{quotation_item_id:int, selected:bool}>  $selections
     */
    public function select(array $selections): void
    {
        DB::transaction(function () use ($selections) {
            foreach ($selections as $sel) {
                $item = QuotationItem::query()->with('quotation')->findOrFail($sel['quotation_item_id']);
                if ($item->purchase_order_item_id) {
                    throw new DomainException('El ítem ya fue convertido en orden de compra.');
                }
                if (! $item->quotation->status->isComparable()) {
                    throw new DomainException("La cotización {$item->quotation->number} no está recibida.");
                }
                if ($sel['selected']) {
                    // Desmarcar competidores de la misma fila (producto + ítem de solicitud).
                    QuotationItem::query()
                        ->where('product_id', $item->product_id)
                        ->where('id', '!=', $item->id)
                        ->whereNull('purchase_order_item_id')
                        ->when($item->purchase_request_item_id,
                            fn ($q) => $q->where('purchase_request_item_id', $item->purchase_request_item_id),
                            fn ($q) => $q->whereNull('purchase_request_item_id'))
                        ->update(['is_selected' => false]);
                }
                $item->forceFill(['is_selected' => (bool) $sel['selected']])->save();
            }
        });
    }

    /**
     * Crea una OC en borrador por cada proveedor con ítems seleccionados y sin OC.
     *
     * @return Collection<int, PurchaseOrder>
     */
    public function generateOrders(array $quotationItemIds, int $warehouseId, User $user): Collection
    {
        $items = QuotationItem::query()
            ->with(['quotation', 'requestItem'])
            ->whereIn('id', $quotationItemIds)
            ->where('is_selected', true)
            ->whereNull('purchase_order_item_id')
            ->get();

        if ($items->isEmpty()) {
            throw new DomainException('No hay ítems seleccionados pendientes de orden de compra.');
        }

        return DB::transaction(function () use ($items, $warehouseId, $user) {
            $orders = collect();

            foreach ($items->groupBy(fn (QuotationItem $i) => $i->quotation->supplier_id) as $supplierId => $group) {
                $lines = $group->map(fn (QuotationItem $i) => [
                    'product_id' => $i->product_id,
                    'purchase_request_item_id' => $i->purchase_request_item_id,
                    'quotation_item_id' => $i->id,
                    'unit_id' => $i->unit_id,
                    'quantity' => (float) $i->quantity,
                    'unit_price' => (float) $i->unit_price,
                    'tax_rate' => (float) $i->tax_rate,
                    'notes' => $i->notes,
                ])->values()->all();

                $order = $this->orders->save(null, [
                    'supplier_id' => $supplierId,
                    'warehouse_id' => $warehouseId,
                    'date' => today()->format('Y-m-d'),
                    'expected_date' => today()->addDays((int) ($group->max('delivery_days') ?? 0))->format('Y-m-d'),
                    'items' => $lines,
                ], $user);

                // Vincular ítems de cotización con los de la OC y marcar cotizaciones como seleccionadas.
                foreach ($order->items as $orderItem) {
                    QuotationItem::query()->where('id', $orderItem->quotation_item_id)
                        ->update(['purchase_order_item_id' => $orderItem->id]);
                }
                $group->pluck('quotation_id')->unique()->each(function ($quotationId) {
                    DB::table('quotations')->where('id', $quotationId)->update(['status' => QuotationStatus::Seleccionada->value]);
                });

                $orders->push($order);
            }

            return $orders;
        });
    }
}
