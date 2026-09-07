<?php

namespace App\Http\Resources\Inventory;

use App\Http\Resources\Purchasing\AttachmentResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GoodsReceiptResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'purchase_order_id' => $this->purchase_order_id,
            'order' => $this->whenLoaded('order', fn () => [
                'id' => $this->order->id,
                'number' => $this->order->number,
                'status' => $this->order->status->value,
                'status_label' => $this->order->status->label(),
                'supplier' => $this->order->relationLoaded('supplier') ? ['id' => $this->order->supplier->id, 'name' => $this->order->supplier->name, 'document_number' => $this->order->supplier->document_number] : null,
            ]),
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'supplier_remission' => $this->supplier_remission,
            'received_at' => $this->received_at?->format('Y-m-d'),
            'receiver' => $this->whenLoaded('receiver', fn () => ['id' => $this->receiver->id, 'name' => $this->receiver->name]),
            'status' => $this->status->value,
            'status_label' => $this->status->label('f'),
            'is_editable' => $this->status->isEditable(),
            'notes' => $this->notes,
            'confirmed_at' => $this->confirmed_at,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'total_cost' => $this->whenLoaded('items', fn () => $this->totalCost()),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'purchase_order_item_id' => $i->purchase_order_item_id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'unit_id' => $i->unit_id,
                'unit' => $i->relationLoaded('unit') ? ['id' => $i->unit->id, 'code' => $i->unit->code, 'name' => $i->unit->name] : null,
                'factor' => (float) $i->factor,
                'quantity' => (float) $i->quantity,
                'qty_base' => (float) $i->qty_base,
                'unit_cost_base' => (float) $i->unit_cost_base,
                'line_cost' => round((float) $i->qty_base * (float) $i->unit_cost_base, 2),
                'qty_returned_base' => (float) $i->qty_returned_base,
                'returnable_base' => $i->returnableBase(),
                'order_item' => $i->relationLoaded('orderItem') && $i->orderItem ? [
                    'qty_base' => (float) $i->orderItem->qty_base,
                    'qty_received_base' => (float) $i->orderItem->qty_received_base,
                    'pending_base' => $i->orderItem->pendingToReceiveBase(),
                ] : null,
                'notes' => $i->notes,
            ])),
            'returns' => $this->whenLoaded('returns', fn () => $this->returns->map(fn ($r) => [
                'id' => $r->id, 'number' => $r->number, 'date' => $r->date?->format('Y-m-d'),
                'status' => $r->status->value, 'status_label' => $r->status->label('f'), 'total_cost' => (float) $r->total_cost,
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
