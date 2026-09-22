<?php

namespace App\Http\Resources\Consumption;

use App\Http\Resources\Purchasing\AttachmentResource;
use App\Models\LoanReturnItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LoanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'recipient_id' => $this->recipient_id,
            'recipient' => $this->whenLoaded('recipient', fn () => [
                'id' => $this->recipient->id,
                'name' => $this->recipient->name,
                'type' => $this->recipient->type,
                'document_number' => $this->recipient->document_number,
            ]),
            'loaned_at' => $this->loaned_at?->format('Y-m-d'),
            'expected_return_at' => $this->expected_return_at?->format('Y-m-d'),
            'is_overdue' => $this->isOverdue(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable(),
            'can_return' => $this->status->isOpen(),
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
                'unit_cost' => (float) $i->unit_cost,
                'line_cost' => round((float) $i->qty_base * (float) $i->unit_cost, 2),
                'qty_returned_base' => (float) $i->qty_returned_base,
                'qty_damaged_base' => (float) $i->qty_damaged_base,
                'qty_lost_base' => (float) $i->qty_lost_base,
                'outstanding_base' => $i->outstandingBase(),
                'notes' => $i->notes,
            ])),
            'returns' => $this->whenLoaded('returns', fn () => $this->returns->map(fn ($r) => [
                'id' => $r->id,
                'returned_at' => $r->returned_at?->format('Y-m-d'),
                'receiver' => $r->relationLoaded('receiver') ? ['id' => $r->receiver->id, 'name' => $r->receiver->name] : null,
                'notes' => $r->notes,
                'items' => $r->relationLoaded('items') ? $r->items->map(fn ($ri) => [
                    'id' => $ri->id,
                    'loan_item_id' => $ri->loan_item_id,
                    'product' => $ri->relationLoaded('loanItem') && $ri->loanItem->relationLoaded('product') ? [
                        'id' => $ri->loanItem->product->id,
                        'sku' => $ri->loanItem->product->sku,
                        'name' => $ri->loanItem->product->name,
                    ] : null,
                    'qty_base' => (float) $ri->qty_base,
                    'condition' => $ri->condition,
                    'condition_label' => LoanReturnItem::CONDITIONS[$ri->condition] ?? $ri->condition,
                    'notes' => $ri->notes,
                ]) : null,
                'created_at' => $r->created_at,
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
