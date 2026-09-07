<?php

namespace App\Http\Resources\Inventory;

use App\Http\Resources\Purchasing\AttachmentResource;
use App\Models\SupplierReturn;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupplierReturnResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => ['id' => $this->supplier->id, 'name' => $this->supplier->name, 'document_number' => $this->supplier->document_number]),
            'goods_receipt_id' => $this->goods_receipt_id,
            'receipt' => $this->whenLoaded('receipt', fn () => [
                'id' => $this->receipt->id, 'number' => $this->receipt->number, 'received_at' => $this->receipt->received_at?->format('Y-m-d'),
                'order' => $this->receipt->relationLoaded('order') ? ['id' => $this->receipt->order->id, 'number' => $this->receipt->order->number] : null,
            ]),
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'date' => $this->date?->format('Y-m-d'),
            'reason' => $this->reason,
            'reason_label' => SupplierReturn::REASONS[$this->reason] ?? $this->reason,
            'status' => $this->status->value,
            'status_label' => $this->status->label('f'),
            'is_editable' => $this->status->isEditable(),
            'total_cost' => (float) $this->total_cost,
            'notes' => $this->notes,
            'confirmed_at' => $this->confirmed_at,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'goods_receipt_item_id' => $i->goods_receipt_item_id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'qty_base' => (float) $i->qty_base,
                'unit_cost_base' => (float) $i->unit_cost_base,
                'line_cost' => round((float) $i->qty_base * (float) $i->unit_cost_base, 2),
                'received_base' => $i->relationLoaded('receiptItem') && $i->receiptItem ? (float) $i->receiptItem->qty_base : null,
                'notes' => $i->notes,
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
