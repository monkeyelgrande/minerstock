<?php

namespace App\Http\Resources\Inventory;

use App\Models\Adjustment;
use App\Models\GoodsReceipt;
use App\Models\SupplierReturn;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockMovementResource extends JsonResource
{
    /** Clave pública del documento origen (para armar enlaces en el front). */
    private const SOURCE_KEYS = [
        GoodsReceipt::class => 'goods_receipt',
        SupplierReturn::class => 'supplier_return',
        Adjustment::class => 'adjustment',
    ];

    public function toArray(Request $request): array
    {
        $source = $this->relationLoaded('source') ? $this->source : null;

        return [
            'id' => $this->id,
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'product_id' => $this->product_id,
            'product' => $this->whenLoaded('product', fn () => [
                'id' => $this->product->id, 'sku' => $this->product->sku, 'name' => $this->product->name,
                'base_unit' => $this->product->relationLoaded('baseUnit') ? $this->product->baseUnit->code : null,
            ]),
            'type' => $this->type->value,
            'type_label' => $this->type->label(),
            'is_inbound' => (float) $this->qty_base > 0,
            'is_reversal' => $this->is_reversal,
            'qty_base' => (float) $this->qty_base,
            'unit_cost' => (float) $this->unit_cost,
            'total_cost' => (float) $this->total_cost,
            'balance_qty_after' => (float) $this->balance_qty_after,
            'balance_cost_after' => (float) $this->balance_cost_after,
            'balance_value_after' => round((float) $this->balance_qty_after * (float) $this->balance_cost_after, 2),
            'source' => $source ? [
                'type' => self::SOURCE_KEYS[get_class($source)] ?? $this->source_type,
                'id' => $source->getKey(),
                'number' => $source->number ?? null,
            ] : null,
            'moved_at' => $this->moved_at,
            'user' => $this->whenLoaded('user', fn () => ['id' => $this->user->id, 'name' => $this->user->name]),
            'notes' => $this->notes,
        ];
    }
}
