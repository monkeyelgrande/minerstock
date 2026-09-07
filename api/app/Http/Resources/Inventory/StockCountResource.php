<?php

namespace App\Http\Resources\Inventory;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockCountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $items = $this->relationLoaded('items') ? $this->items : null;

        return [
            'id' => $this->id,
            'number' => $this->number,
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'date' => $this->date?->format('Y-m-d'),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_open' => $this->status->value === 'en_proceso',
            'counter' => $this->whenLoaded('counter', fn () => ['id' => $this->counter->id, 'name' => $this->counter->name]),
            'notes' => $this->notes,
            'adjustment_id' => $this->adjustment_id,
            'adjustment' => $this->whenLoaded('adjustment', fn () => $this->adjustment ? ['id' => $this->adjustment->id, 'number' => $this->adjustment->number] : null),
            'closed_at' => $this->closed_at,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'summary' => $items !== null ? [
                'total' => $items->count(),
                'counted' => $items->whereNotNull('counted_qty')->count(),
                'with_difference' => $items->filter(fn ($i) => $i->difference() !== null && abs($i->difference()) >= 0.0005)->count(),
            ] : null,
            'items' => $items?->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                    'category' => $i->product->relationLoaded('category') ? $i->product->category?->name : null,
                ] : null,
                'system_qty' => (float) $i->system_qty,
                'counted_qty' => $i->counted_qty !== null ? (float) $i->counted_qty : null,
                'difference' => $i->difference(),
                'notes' => $i->notes,
            ]),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
