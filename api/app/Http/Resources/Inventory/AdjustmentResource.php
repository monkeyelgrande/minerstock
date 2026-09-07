<?php

namespace App\Http\Resources\Inventory;

use App\Http\Resources\Purchasing\AttachmentResource;
use App\Models\Adjustment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdjustmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'date' => $this->date?->format('Y-m-d'),
            'reason' => $this->reason,
            'reason_label' => Adjustment::REASONS[$this->reason] ?? $this->reason,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable() && ! $this->stock_count_id,
            'stock_count_id' => $this->stock_count_id,
            'stock_count' => $this->whenLoaded('stockCount', fn () => $this->stockCount ? ['id' => $this->stockCount->id, 'number' => $this->stockCount->number] : null),
            'notes' => $this->notes,
            'confirmed_at' => $this->confirmed_at,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'qty_base' => (float) $i->qty_base,
                'unit_cost' => $i->unit_cost !== null ? (float) $i->unit_cost : null,
                'line_cost' => $i->unit_cost !== null ? round((float) $i->qty_base * (float) $i->unit_cost, 2) : null,
                'notes' => $i->notes,
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
