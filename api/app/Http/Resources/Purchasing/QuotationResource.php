<?php

namespace App\Http\Resources\Purchasing;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuotationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
                'document_number' => $this->supplier->document_number,
                'payment_terms_days' => $this->supplier->payment_terms_days,
            ]),
            'date' => $this->date?->format('Y-m-d'),
            'valid_until' => $this->valid_until?->format('Y-m-d'),
            'is_expired' => $this->valid_until !== null && $this->valid_until->isPast() && ! $this->valid_until->isToday(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable(),
            'can_respond' => $this->status->canRespond(),
            'sent_at' => $this->sent_at,
            'subtotal' => (float) $this->subtotal,
            'tax' => (float) $this->tax,
            'total' => (float) $this->total,
            'notes' => $this->notes,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id,
                    'sku' => $i->product->sku,
                    'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'purchase_request_item_id' => $i->purchase_request_item_id,
                'request' => $i->relationLoaded('requestItem') && $i->requestItem ? [
                    'id' => $i->requestItem->purchase_request_id,
                    'number' => $i->requestItem->relationLoaded('request') ? $i->requestItem->request->number : null,
                    'pending_base' => $i->requestItem->pendingToOrderBase(),
                ] : null,
                'unit_id' => $i->unit_id,
                'unit' => $i->relationLoaded('unit') ? ['id' => $i->unit->id, 'code' => $i->unit->code, 'name' => $i->unit->name] : null,
                'factor' => (float) $i->factor,
                'quantity' => (float) $i->quantity,
                'qty_base' => (float) $i->qty_base,
                'unit_price' => $i->unit_price !== null ? (float) $i->unit_price : null,
                'base_price' => $i->basePrice(),
                'not_quoted' => $i->not_quoted,
                'tax_rate' => (float) $i->tax_rate,
                'line_total' => (float) $i->line_total,
                'delivery_days' => $i->delivery_days,
                'notes' => $i->notes,
                'is_selected' => $i->is_selected,
                'purchase_order_item_id' => $i->purchase_order_item_id,
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
